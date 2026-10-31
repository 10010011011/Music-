import { Capacitor } from "@capacitor/core";
import type { Track } from "./store";
import {
  getPersistentStorageStatus,
  persistNativeTracks as persistLegacyTracks,
  restoreNativeTracks as restoreLegacyTracks,
} from "./nativeLibrary";

type StoredTrack = {
  id: string;
  order: number;
  fileName: string;
  fileType: string;
  fileLastModified: number;
  fileSize: number;
  audio: Blob;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  cover?: string;
  coverBlob?: Blob;
  rgTrack?: number;
  rgAlbum?: number;
  embeddedLyrics?: string;
  tagsDone?: boolean;
  sidecar?: Blob;
  sidecarName?: string;
  sidecarType?: string;
  sidecarLastModified?: number;
};

const DB_NAME = "sonora-audio-library";
const DB_VERSION = 1;
let databasePromise: Promise<IDBDatabase> | undefined;
let saveQueue: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this app"));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tracks")) {
        db.createObjectStore("tracks", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error("Could not open the local music database"));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("The local music database is blocked by another app window"));
    };
  });
  return databasePromise;
}

function coverBlobFromTrack(track: Track): Blob | undefined {
  const value = track.coverData || track.cover || "";
  const match = value.match(/^data:([^;,]+)?;base64,([\\s\\S]*)$/);
  if (!match) return undefined;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] || "image/jpeg" });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not restore artwork"));
    reader.readAsDataURL(blob);
  });
}

async function requestPersistentQuota() {
  try {
    const storage = navigator.storage;
    if (storage?.persist) await storage.persist();
  } catch {
    // IndexedDB still remains the primary store if the browser does not expose
    // the persistent-storage request in this WebView.
  }
}

async function writeTrackSnapshot(tracks: Track[]) {
  const db = await openDatabase();
  const live = tracks.filter((track) => !track.demo);
  const keep = new Set(live.map((track) => track.id));

  const transaction = db.transaction("tracks", "readwrite");
  const store = transaction.objectStore("tracks");

  for (let order = 0; order < live.length; order++) {
    const track = live[order];
    const coverBlob = coverBlobFromTrack(track);
    const record: StoredTrack = {
      id: track.id,
      order,
      fileName: track.file.name,
      fileType: track.file.type,
      fileLastModified: track.file.lastModified,
      fileSize: track.file.size,
      audio: track.file.slice(0, track.file.size, track.file.type || "application/octet-stream"),
      path: track.path,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      cover: track.cover && !track.cover.startsWith("blob:") && !track.cover.startsWith("data:")
        ? track.cover
        : undefined,
      coverBlob,
      rgTrack: track.rgTrack,
      rgAlbum: track.rgAlbum,
      embeddedLyrics: track.embeddedLyrics,
      tagsDone: track.tagsDone,
      sidecar: track.sidecar?.slice(0, track.sidecar.size, track.sidecar.type || "text/plain"),
      sidecarName: track.sidecar?.name,
      sidecarType: track.sidecar?.type,
      sidecarLastModified: track.sidecar?.lastModified,
    };
    store.put(record);
  }

  const keysRequest = store.getAllKeys();
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) {
      if (typeof key === "string" && !keep.has(key)) store.delete(key);
    }
  };

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save the music library"));
    transaction.onabort = () => reject(transaction.error || new Error("Music library save was interrupted"));
  });
}

async function readTrackSnapshot(): Promise<Track[]> {
  const db = await openDatabase();
  const transaction = db.transaction("tracks", "readonly");
  const request = transaction.objectStore("tracks").getAll();
  const records = await new Promise<StoredTrack[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredTrack[]);
    request.onerror = () => reject(request.error || new Error("Could not read the music library"));
  });

  const restored: Track[] = [];
  for (const item of records.sort((a, b) => a.order - b.order)) {
    try {
      if (!(item.audio instanceof Blob)) continue;
      const file = new File([item.audio], item.fileName, {
        type: item.fileType || item.audio.type || "application/octet-stream",
        lastModified: item.fileLastModified || Date.now(),
      });
      const sidecar = item.sidecar instanceof Blob
        ? new File([item.sidecar], item.sidecarName || "lyrics.lrc", {
            type: item.sidecarType || item.sidecar.type || "text/plain",
            lastModified: item.sidecarLastModified || Date.now(),
          })
        : undefined;
      const coverData = item.coverBlob instanceof Blob
        ? await blobToDataUrl(item.coverBlob)
        : undefined;
      restored.push({
        id: item.id,
        file,
        path: item.path || item.fileName,
        title: item.title || item.fileName,
        artist: item.artist || "Unknown artist",
        album: item.album || "Local audio",
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
      console.warn("Sonora skipped a damaged locally stored track", item.fileName, error);
    }
  }
  return restored;
}

async function persistSnapshotWithQueue(tracks: Track[]) {
  await requestPersistentQuota();
  await writeTrackSnapshot(tracks);

  // Keep a user-selected folder as an optional second copy. It is no longer
  // required for persistence or restoration on the device.
  try {
    const status = await getPersistentStorageStatus();
    if (status.configured) await persistLegacyTracks(tracks);
  } catch (error) {
    console.warn("Sonora could not refresh the optional external library copy", error);
  }
}

export async function persistNativeTracks(tracks: Track[]) {
  if (!Capacitor.isNativePlatform()) return;
  const snapshot = [...tracks];
  const job = saveQueue.then(() => persistSnapshotWithQueue(snapshot));
  saveQueue = job.catch(() => {});
  await job;
}

export async function restoreNativeTracks(): Promise<Track[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const saved = await readTrackSnapshot();
    if (saved.length) return saved;
  } catch (error) {
    console.error("Sonora local music database could not be read; trying the previous storage", error);
  }

  // One-time compatibility path: recover tracks saved by older Sonora builds
  // in the app-private directory or the previously granted SAF folder.
  try {
    const legacy = await restoreLegacyTracks();
    if (legacy.length) {
      try {
        await persistNativeTracks(legacy);
      } catch (error) {
        console.warn("Sonora recovered legacy tracks but could not migrate them yet", error);
      }
    }
    return legacy;
  } catch (error) {
    console.error("Sonora could not recover the previous music library", error);
    return [];
  }
}
