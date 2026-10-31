import { library, settings, lyricsStore, toast, type Track, type Lyrics } from "./store";
import { readTags, titleFromName } from "./tags";
import { parseLyrics } from "./lyrics";
import { kvGet, kvSet } from "./db";
import { engine } from "./engine";
import { persistNativeTracks } from "./mediaStore";

const AUDIO = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|webm|weba|mp4|wma|aiff?|alac)$/i;
const LYR = /\.(lrc|srt|vtt|txt)$/i;
const keyOf = (path: string) => path.replace(/\.[^./]+$/, "").toLowerCase();

export async function ingest(
  files: { file: File; path: string; cover?: string; demo?: boolean; subtitleTag?: string; duration?: number }[],
  folderName = "",
  replace = false,
  silent = false
) {
  library.set({ loading: true });
  const audio = files.filter((f) => AUDIO.test(f.file.name) || f.file.type.startsWith("audio/"));
  const side = new Map<string, File>();
  files.filter((f) => LYR.test(f.file.name)).forEach((f) => side.set(keyOf(f.path), f.file));
  if (!files.some((f) => f.demo)) {
    audio.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  }

  const fresh: Track[] = audio.map(({ file, path, cover, demo, subtitleTag, duration }) => {
    const n = titleFromName(file.name);
    return {
      id: demo ? `demo-${n.title.toLowerCase().replace(/\s+/g, "-")}` : `${file.name}|${file.size}|${file.lastModified}`,
      file,
      path,
      title: n.title,
      artist: n.artist || "Unknown artist",
      album: path.includes("/") ? path.split("/").slice(-2, -1)[0] : folderName || "Local audio",
      sidecar: side.get(keyOf(path)),
      cover,
      demo,
      subtitleTag,
      duration,
    };
  });

  const prev = replace ? [] : library.get().tracks;
  let attachedLyrics = 0;
  const updatedPrev = prev.map((track) => {
    const sidecar = side.get(keyOf(track.path)) || side.get(keyOf(track.file.name));
    if (!sidecar || (track.sidecar?.size === sidecar.size && track.sidecar?.lastModified === sidecar.lastModified)) {
      return track;
    }
    attachedLyrics++;
    return { ...track, sidecar };
  });
  const seen = new Set(updatedPrev.map((t) => t.id));
  const tracks = [...updatedPrev, ...fresh.filter((t) => !seen.has(t.id))];
  const queue = tracks.map((_, i) => i);
  const nextQpos = library.get().qpos >= 0 && !replace ? library.get().qpos : tracks.length ? 0 : -1;

  library.set({
    tracks,
    queue: settings.get().shuffle ? shuffled(queue, nextQpos) : queue,
    qpos: nextQpos,
    loading: false,
    folderName: folderName || library.get().folderName,
  });

  let persistError: unknown;
  try {
    await persistNativeTracks(tracks);
  } catch (error) {
    persistError = error;
    console.error("Sonora import could not be saved to durable storage", error);
  }

  if (nextQpos >= 0 && !engine.el.src) {
    engine.primeAt(nextQpos);
  }

  if (!silent && (fresh.length > 0 || attachedLyrics > 0)) {
    toast(persistError
      ? "Music or lyrics added, but saving failed. Check Settings → Music storage."
      : [
          fresh.length ? `${fresh.length} track${fresh.length === 1 ? "" : "s"} added` : "",
          attachedLyrics ? `${attachedLyrics} lyric file${attachedLyrics === 1 ? "" : "s"} attached` : "",
          fresh.length && side.size ? `${side.size} LRC matched` : "",
        ].filter(Boolean).join(" · "));
  }
  void loadTagsInBackground();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read artwork"));
    reader.readAsDataURL(blob);
  });
}

let tagRun = 0;
export async function loadTagsInBackground() {
  const run = ++tagRun;
  const list = library.get().tracks;
  let dirty = 0;
  for (let i = 0; i < list.length; i++) {
    if (run !== tagRun) return;
    const t = list[i];
    if (t.tagsDone || t.demo) {
      t.tagsDone = true;
      continue;
    }
    const tg = await readTags(t.file);
    t.tagsDone = true;
    if (tg.title) t.title = tg.title;
    if (tg.artist) t.artist = tg.artist;
    if (tg.album) t.album = tg.album;
    if (tg.cover) {
      t.coverData = await blobToDataUrl(tg.cover);
      t.cover = t.coverData;
    }
    t.rgTrack = tg.rgTrack;
    t.rgAlbum = tg.rgAlbum;
    t.embeddedLyrics = tg.lyrics;
    if (++dirty % 12 === 0) library.set({ tracks: [...library.get().tracks] });
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  library.set({ tracks: [...library.get().tracks] });
  try {
    await persistNativeTracks(library.get().tracks);
  } catch (error) {
    console.error("Sonora could not save scanned tags and artwork", error);
  }
}

export function shuffled(q: number[], keepFirst: number) {
  const a = q.filter((x) => x !== keepFirst);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return keepFirst >= 0 ? [keepFirst, ...a] : a;
}

export function setShuffle(on: boolean) {
  settings.set({ shuffle: on });
  const { tracks, queue, qpos } = library.get();
  const cur = queue[qpos] ?? -1;
  const base = tracks.map((_, i) => i);
  const nq = on ? shuffled(base, cur) : base;
  library.set({ queue: nq, qpos: cur >= 0 ? nq.indexOf(cur) : -1 });
  engine.requeue();
}

export function playTrackIndex(trackIdx: number) {
  const { queue } = library.get();
  const pos = queue.indexOf(trackIdx);
  if (pos >= 0) engine.playAt(pos);
}

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: { file: File; path: string }[]) {
  for await (const h of dir.values()) {
    const p = prefix ? `${prefix}/${h.name}` : h.name;
    if (h.kind === "directory") await walk(h as unknown as FileSystemDirectoryHandle, p, out);
    else if (AUDIO.test(h.name) || LYR.test(h.name)) out.push({ file: await (h as any).getFile(), path: p });
  }
}

export async function openFolderHandle(handle?: FileSystemDirectoryHandle) {
  try {
    let dir = handle;
    if (!dir) {
      dir = await window.showDirectoryPicker!({ mode: "read", id: "music" });
      kvSet("dirHandle", dir);
    } else if (dir.queryPermission && (await dir.queryPermission({ mode: "read" })) !== "granted") {
      if ((await dir.requestPermission?.({ mode: "read" })) !== "granted") return;
    }
    library.set({ loading: true });
    const out: { file: File; path: string }[] = [];
    await walk(dir, "", out);
    await ingest(out, dir.name, false);
  } catch (e) {
    library.set({ loading: false });
    if ((e as Error)?.name !== "AbortError") toast("Could not open folder");
  }
}

export const savedFolder = () => kvGet<FileSystemDirectoryHandle>("dirHandle");

/* ---------------- Lyrics resolution ---------------- */
export async function loadLyricsFor(t: Track) {
  if (lyricsStore.get().map[t.id]) return;

  let cached: Lyrics | undefined = await kvGet<Lyrics>("lyr:" + t.id);
  const sidecarLyrics = t.sidecar
    ? parseLyrics(await t.sidecar.text(), t.sidecar.name)
    : undefined;
  const embeddedLyrics = t.embeddedLyrics
    ? parseLyrics(t.embeddedLyrics, "embedded tag")
    : undefined;
  const bundledLyrics = (t as any).demoLyrics
    ? parseLyrics((t as any).demoLyrics, "bundled")
    : undefined;

  // Older Sonora builds discarded enhanced-LRC word timestamps. Upgrade that
  // cache from the original imported sidecar rather than leaving the user with
  // line-only lyrics after the parser has learned word-level timing.
  const hasWordTiming = (lyrics?: Lyrics) =>
    Boolean(lyrics?.lines.some(line => line.words && line.words.length > 0));
  if (cached && !hasWordTiming(cached)) {
    if (hasWordTiming(sidecarLyrics)) cached = sidecarLyrics;
    else if (hasWordTiming(embeddedLyrics)) cached = embeddedLyrics;
  }

  const lyrics = cached || sidecarLyrics || embeddedLyrics || bundledLyrics;
  if (lyrics) {
    lyricsStore.set(state => ({ map: { ...state.map, [t.id]: lyrics } }));
    // Persist parser upgrades so subsequent opens don't need to reparse the file.
    if (lyrics === sidecarLyrics || lyrics === embeddedLyrics) {
      void kvSet("lyr:" + t.id, lyrics);
    }
  }
}

let saveT: number | undefined;
export function saveLyrics(id: string, l: Lyrics) {
  lyricsStore.set((s) => ({ map: { ...s.map, [id]: l } }));
  clearTimeout(saveT);
  saveT = window.setTimeout(() => kvSet("lyr:" + id, l), 300);
}
