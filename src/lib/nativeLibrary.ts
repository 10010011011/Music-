import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { Lyrics, Settings, Track } from "./store";

export interface StorageStatus {
  configured: boolean;
  folderName: string;
  libraryUri?: string;
}

interface SonoraStoragePlugin {
  chooseFolder(): Promise<StorageStatus>;
  getStatus(): Promise<StorageStatus>;
  writeFile(options: { path: string; data: string; mimeType?: string }): Promise<{ path: string; size: number }>;
  readFile(options: { path: string }): Promise<{ data: string }>;
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
  beginWrite(options: { path: string; mimeType?: string }): Promise<{ token: string }>;
  appendWrite(options: { token: string; data: string }): Promise<{ bytes: number }>;
  finishWrite(options: { token: string }): Promise<void>;
  abortWrite(options: { token: string }): Promise<void>;
  beginRead(options: { path: string }): Promise<{ token: string; size: number }>;
  readChunk(options: { token: string }): Promise<{ data: string; done: boolean }>;
  finishRead(options: { token: string }): Promise<void>;
  abortRead(options: { token: string }): Promise<void>;
}

const NativeStorage = registerPlugin<SonoraStoragePlugin>("SonoraStorage");
const PRIVATE_INDEX = "sonora-library/index.json";
const PRIVATE_STATE = "sonora-library/state.json";
const legacyName = (id: string) => encodeURIComponent(id).replace(/%/g, "_") + ".audio";

type SavedTrack = {
  id: string; fileName: string; type: string; size: number; lastModified: number;
  path: string; title: string; artist: string; album: string; duration?: number;
  cover?: string; coverData?: string; coverPath?: string; coverType?: string;
  coverSize?: number; coverLastModified?: number; rgTrack?: number; rgAlbum?: number;
  embeddedLyrics?: string; tagsDone?: boolean; audioPath?: string; sidecarSize?: number;
  sidecarLastModified?: number; privatePath?: string; privateCoverPath?: string;
  sidecarPath?: string; sidecarName?: string; sidecarType?: string;
};

export interface PersistedAppState {
  settings?: Partial<Settings>;
  lyrics?: Record<string, Lyrics>;
  queueIds?: string[];
  currentTrackId?: string | null;
}

let activeLibraryUri = "";
let cachedIndex: SavedTrack[] | null = null;

function hashId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeFileName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\\\/:*?"<>|\\u0000-\\u001f]/g, "_")
    .replace(/^\\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function coverExtension(type: string) {
  const subtype = type.toLowerCase().split("/")[1]?.split("+")[0] || "jpeg";
  if (subtype === "png" || subtype === "webp" || subtype === "gif" || subtype === "avif") return subtype;
  return "jpg";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function textToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function base64ToText(value: string) {
  return new TextDecoder().decode(base64ToBytes(value));
}

function dataUrlToBlob(value?: string): Blob | undefined {
  if (!value) return undefined;
  const match = value.match(/^data:([^;,]+)?;base64,([\\s\\S]*)$/);
  if (!match) return undefined;
  return new Blob([bytesToArrayBuffer(base64ToBytes(match[2]))], { type: match[1] || "image/jpeg" });
}

function blobToDataUrl(bytes: Uint8Array, type: string) {
  return "data:" + (type || "image/jpeg") + ";base64," + bytesToBase64(bytes);
}

async function writeSafBlob(path: string, file: Blob, mimeType = "application/octet-stream") {
  const session = await NativeStorage.beginWrite({ path, mimeType });
  try {
    const chunkSize = 256 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer());
      await NativeStorage.appendWrite({ token: session.token, data: bytesToBase64(chunk) });
    }
    await NativeStorage.finishWrite({ token: session.token });
  } catch (error) {
    await NativeStorage.abortWrite({ token: session.token }).catch(() => {});
    throw error;
  }
}

async function readSafBlob(path: string): Promise<Uint8Array> {
  const session = await NativeStorage.beginRead({ path });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await NativeStorage.readChunk({ token: session.token });
      if (part.data) {
        const bytes = base64ToBytes(part.data);
        chunks.push(bytes);
        total += bytes.length;
      }
      if (part.done) break;
    }
    await NativeStorage.finishRead({ token: session.token });
  } catch (error) {
    await NativeStorage.abortRead({ token: session.token }).catch(() => {});
    throw error;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function fromBase64(data: string, name: string, type: string, lastModified = Date.now()) {
  return new File([bytesToArrayBuffer(base64ToBytes(data))], name, {
    type: type || "application/octet-stream",
    lastModified,
  });
}

function savedTrack(
  track: Track,
  paths: {
    audioPath?: string;
    privatePath?: string;
    sidecarPath?: string;
    coverPath?: string;
    privateCoverPath?: string;
  },
): SavedTrack {
  return {
    id: track.id,
    fileName: track.file.name,
    type: track.file.type,
    size: track.file.size,
    lastModified: track.file.lastModified,
    path: track.path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    cover: track.cover?.startsWith("blob:") || track.cover?.startsWith("data:") ? undefined : track.cover,
    coverType: track.coverData?.match(/^data:([^;,]+)/)?.[1],
    coverSize: dataUrlToBlob(track.coverData || track.cover)?.size,
    coverLastModified: track.file.lastModified,
    rgTrack: track.rgTrack,
    rgAlbum: track.rgAlbum,
    embeddedLyrics: track.embeddedLyrics,
    tagsDone: track.tagsDone,
    sidecarName: track.sidecar?.name,
    sidecarType: track.sidecar?.type,
    sidecarSize: track.sidecar?.size,
    sidecarLastModified: track.sidecar?.lastModified,
    ...paths,
  };
}

export async function getPersistentStorageStatus(): Promise<StorageStatus> {
  if (!Capacitor.isNativePlatform()) return { configured: false, folderName: "" };
  try {
    return await NativeStorage.getStatus();
  } catch (error) {
    console.warn("Sonora storage status unavailable", error);
    return { configured: false, folderName: "" };
  }
}

export async function choosePersistentLibraryFolder(): Promise<StorageStatus> {
  if (!Capacitor.isNativePlatform()) throw new Error("Persistent folder access is only available in the Android app");
  const status = await NativeStorage.chooseFolder();
  if (!status.configured) throw new Error("Android did not grant access to the selected folder");
  activeLibraryUri = status.libraryUri || "";
  cachedIndex = null;
  return status;
}

async function readSafIndex(status: StorageStatus): Promise<SavedTrack[]> {
  if (!status.configured || !status.libraryUri) return [];
  if (activeLibraryUri !== status.libraryUri || cachedIndex === null) {
    activeLibraryUri = status.libraryUri;
    try {
      const raw = await NativeStorage.readFile({ path: "index.json" });
      cachedIndex = JSON.parse(base64ToText(raw.data)) as SavedTrack[];
    } catch {
      cachedIndex = [];
    }
  }
  return cachedIndex || [];
}

async function persistPrivateTracks(tracks: Track[]) {
  await Filesystem.mkdir({ path: "sonora-library", directory: Directory.Data, recursive: true }).catch(() => {});
  const saved: SavedTrack[] = [];
  for (const track of tracks) {
    if (track.demo) continue;
    const privatePath = "sonora-library/" + legacyName(track.id);
    try {
      await Filesystem.writeFile({
        path: privatePath, data: await blobToBase64(track.file), directory: Directory.Data,
      });
      let sidecarPath: string | undefined;
      if (track.sidecar) {
        sidecarPath = "sonora-library/" + hashId(track.id) + ".lyrics";
        await Filesystem.writeFile({
          path: sidecarPath, data: await blobToBase64(track.sidecar), directory: Directory.Data,
        });
      }
      let privateCoverPath: string | undefined;
      const coverBlob = dataUrlToBlob(track.coverData || track.cover);
      if (coverBlob) {
        privateCoverPath = "sonora-library/" + hashId(track.id) + ".cover";
        await Filesystem.writeFile({
          path: privateCoverPath, data: await blobToBase64(coverBlob), directory: Directory.Data,
        });
      }
      saved.push(savedTrack(track, { privatePath, sidecarPath, privateCoverPath }));
    } catch (error) {
      console.error("Sonora could not save audio", track.file.name, error);
      throw error;
    }
  }
  await Filesystem.writeFile({
    path: PRIVATE_INDEX, data: JSON.stringify(saved), directory: Directory.Data, recursive: true,
  });
}

async function cleanupPrivateLibrary() {
  try {
    const result = await Filesystem.readFile({ path: PRIVATE_INDEX, directory: Directory.Data });
    if (typeof result.data !== "string") return;
    const saved = JSON.parse(result.data) as SavedTrack[];
    for (const item of saved) {
      const audioPath = item.privatePath || "sonora-library/" + legacyName(item.id);
      await Filesystem.deleteFile({ path: audioPath, directory: Directory.Data }).catch(() => {});
      if (item.sidecarPath) await Filesystem.deleteFile({ path: item.sidecarPath, directory: Directory.Data }).catch(() => {});
      if (item.privateCoverPath) await Filesystem.deleteFile({ path: item.privateCoverPath, directory: Directory.Data }).catch(() => {});
    }
    await Filesystem.deleteFile({ path: PRIVATE_INDEX, directory: Directory.Data }).catch(() => {});
  } catch {}
}

async function persistSafTracks(tracks: Track[], status: StorageStatus) {
  const existing = await readSafIndex(status);
  const oldById = new Map(existing.map((item) => [item.id, item]));
  const next: SavedTrack[] = [];

  for (const track of tracks) {
    if (track.demo) continue;
    const audioPath = "audio/" + hashId(track.id) + "-" + safeFileName(track.file.name, "track.audio");
    const old = oldById.get(track.id);
    if (!old || old.size !== track.file.size || old.lastModified !== track.file.lastModified || old.audioPath !== audioPath) {
      await writeSafBlob(audioPath, track.file);
      if (old?.audioPath && old.audioPath !== audioPath) {
        await NativeStorage.deleteFile({ path: old.audioPath }).catch(() => {});
      }
    }

    let sidecarPath: string | undefined;
    if (track.sidecar) {
      sidecarPath = "lyrics/" + hashId(track.id) + "-" + safeFileName(track.sidecar.name, "lyrics.lrc");
      if (!old || old.sidecarPath !== sidecarPath ||
          old.sidecarSize !== track.sidecar.size ||
          old.sidecarLastModified !== track.sidecar.lastModified) {
        await writeSafBlob(sidecarPath, track.sidecar);
        if (old?.sidecarPath && old.sidecarPath !== sidecarPath) {
          await NativeStorage.deleteFile({ path: old.sidecarPath }).catch(() => {});
        }
      }
    }

    let coverPath: string | undefined;
    const coverBlob = dataUrlToBlob(track.coverData || track.cover);
    if (coverBlob) {
      coverPath = "covers/" + hashId(track.id) + "." + coverExtension(coverBlob.type);
      if (!old || old.coverPath !== coverPath || old.coverSize !== coverBlob.size ||
          old.coverLastModified !== track.file.lastModified) {
        await writeSafBlob(coverPath, coverBlob);
        if (old?.coverPath && old.coverPath !== coverPath) {
          await NativeStorage.deleteFile({ path: old.coverPath }).catch(() => {});
        }
      }
    }
    next.push(savedTrack(track, { audioPath, sidecarPath, coverPath }));
  }

  await NativeStorage.writeFile({
    path: "index.json",
    data: textToBase64(JSON.stringify(next)),
    mimeType: "application/json",
  });
  cachedIndex = next;
}

let trackPersistenceQueue: Promise<void> = Promise.resolve();

async function persistNativeTracksNow(tracks: Track[]) {
  const status = await getPersistentStorageStatus();
  if (!status.configured) {
    await persistPrivateTracks(tracks);
    return;
  }
  try {
    await persistSafTracks(tracks, status);
    await cleanupPrivateLibrary();
  } catch (error) {
    console.error("Sonora could not save to the selected folder; keeping an app-private recovery copy", error);
    try {
      await persistPrivateTracks(tracks);
    } catch (fallbackError) {
      console.error("Sonora private recovery copy also failed", fallbackError);
    }
    throw error;
  }
}

export async function persistNativeTracks(tracks: Track[]) {
  if (!Capacitor.isNativePlatform()) return;
  const snapshot = [...tracks];
  const job = trackPersistenceQueue.then(() => persistNativeTracksNow(snapshot));
  trackPersistenceQueue = job.catch(() => {});
  await job;
}

async function restoreSafTracks(status: StorageStatus): Promise<Track[]> {
  const index = await readSafIndex(status);
  const restored: Track[] = [];
  for (const item of index) {
    try {
      if (!item.audioPath) continue;
      const audioBytes = await readSafBlob(item.audioPath);
      let sidecar: File | undefined;
      if (item.sidecarPath) {
        try {
          const lyrics = await readSafBlob(item.sidecarPath);
          sidecar = new File([bytesToArrayBuffer(lyrics)], item.sidecarName || "lyrics.lrc", { type: item.sidecarType || "text/plain", lastModified: item.lastModified });
        } catch (error) {
          console.warn("Sonora could not restore sidecar lyrics", item.sidecarName, error);
        }
      }
      let coverData: string | undefined;
      if (item.coverPath) {
        try {
          coverData = blobToDataUrl(await readSafBlob(item.coverPath), item.coverType || "image/jpeg");
        } catch (error) {
          console.warn("Sonora could not restore artwork", item.fileName, error);
        }
      }
      restored.push({
        id: item.id,
        file: new File([bytesToArrayBuffer(audioBytes)], item.fileName, { type: item.type || "application/octet-stream", lastModified: item.lastModified }),
        path: item.path,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        cover: coverData || item.cover,
        coverData,
        rgTrack: item.rgTrack,
        rgAlbum: item.rgAlbum,
        embeddedLyrics: item.embeddedLyrics,
        tagsDone: item.tagsDone,
        sidecar,
      });
    } catch (error) {
      console.warn("Sonora skipped a missing saved track", item.fileName, error);
    }
  }
  return restored;
}

async function restorePrivateTracks(): Promise<Track[]> {
  try {
    const result = await Filesystem.readFile({ path: PRIVATE_INDEX, directory: Directory.Data });
    const raw = typeof result.data === "string" ? result.data : "";
    const saved = JSON.parse(raw) as SavedTrack[];
    const restored: Track[] = [];
    for (const item of saved) {
      try {
        const path = item.privatePath || "sonora-library/" + legacyName(item.id);
        const audio = await Filesystem.readFile({ path, directory: Directory.Data });
        if (typeof audio.data !== "string") continue;
        let sidecar: File | undefined;
        if (item.sidecarPath) {
          try {
            const lyr = await Filesystem.readFile({ path: item.sidecarPath, directory: Directory.Data });
            if (typeof lyr.data === "string") sidecar = fromBase64(lyr.data, item.sidecarName || "lyrics.lrc", item.sidecarType || "text/plain", item.lastModified);
          } catch {}
        }
        let coverData: string | undefined;
        if (item.privateCoverPath) {
          try {
            const cover = await Filesystem.readFile({ path: item.privateCoverPath, directory: Directory.Data });
            if (typeof cover.data === "string") coverData = blobToDataUrl(base64ToBytes(cover.data), item.coverType || "image/jpeg");
          } catch {}
        }
        restored.push({
          id: item.id,
          file: fromBase64(audio.data, item.fileName, item.type, item.lastModified),
          path: item.path,
          title: item.title,
          artist: item.artist,
          album: item.album,
          duration: item.duration,
          cover: coverData || item.cover,
          coverData,
          rgTrack: item.rgTrack,
          rgAlbum: item.rgAlbum,
          embeddedLyrics: item.embeddedLyrics,
          tagsDone: item.tagsDone,
          sidecar,
        });
      } catch (error) {
        console.warn("Sonora could not restore a private track", item.fileName, error);
      }
    }
    return restored;
  } catch {
    return [];
  }
}

export async function restoreNativeTracks(): Promise<Track[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const status = await getPersistentStorageStatus();
  if (status.configured) {
    const shared = await restoreSafTracks(status);
    const legacy = await restorePrivateTracks();
    if (!legacy.length) return shared;
    // Merge any tracks saved privately after a temporary SAF write failure or by an older build.
    const merged = new Map(shared.map((track) => [track.id, track]));
    for (const track of legacy) merged.set(track.id, track);
    const all = Array.from(merged.values());
    if (all.length) {
      try {
        await persistSafTracks(all, status);
      } catch (error) {
        console.warn("Sonora could not finish migrating its recovery copy", error);
      }
    }
    return all;
  }
  return restorePrivateTracks();
}

let appStatePersistenceQueue: Promise<void> = Promise.resolve();

export async function persistNativeAppState(
  settings: Partial<Settings>,
  lyrics: Record<string, Lyrics>,
  playback?: { queueIds?: string[]; currentTrackId?: string | null },
) {
  if (!Capacitor.isNativePlatform()) return;
  const data = JSON.stringify({ version: 1, settings, lyrics, ...playback });
  const job = appStatePersistenceQueue.then(async () => {
    const status = await getPersistentStorageStatus();
    try {
      if (status.configured) {
        await NativeStorage.writeFile({
          path: "data/state.json", data: textToBase64(data), mimeType: "application/json",
        });
        await Filesystem.deleteFile({ path: PRIVATE_STATE, directory: Directory.Data }).catch(() => {});
      } else {
        await Filesystem.mkdir({ path: "sonora-library", directory: Directory.Data, recursive: true }).catch(() => {});
        await Filesystem.writeFile({
          path: PRIVATE_STATE, data, directory: Directory.Data, recursive: true,
        });
      }
    } catch (error) {
      console.warn("Sonora could not persist settings and lyric edits to the selected folder", error);
      await Filesystem.mkdir({ path: "sonora-library", directory: Directory.Data, recursive: true }).catch(() => {});
      await Filesystem.writeFile({
        path: PRIVATE_STATE, data, directory: Directory.Data, recursive: true,
      }).catch((fallbackError) => console.warn("Sonora private state backup failed", fallbackError));
    }
  });
  appStatePersistenceQueue = job.catch(() => {});
  await job;
}

export async function restoreNativeAppState(): Promise<PersistedAppState | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const status = await getPersistentStorageStatus();
  if (status.configured) {
    try {
      const raw = await NativeStorage.readFile({ path: "data/state.json" });
      return JSON.parse(base64ToText(raw.data)) as PersistedAppState;
    } catch {}
  }
  try {
    const raw = await Filesystem.readFile({ path: PRIVATE_STATE, directory: Directory.Data });
    if (typeof raw.data === "string") return JSON.parse(raw.data) as PersistedAppState;
  } catch {}
  return null;
}
