import { useSyncExternalStore } from "react";

export type Store<T> = {
  get: () => T;
  set: (p: Partial<T> | ((s: T) => Partial<T>)) => void;
  sub: (l: () => void) => () => void;
};

export function createStore<T extends object>(init: T, persistKey?: string): Store<T> {
  let s = init;
  if (persistKey && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) s = { ...init, ...JSON.parse(raw) };
    } catch {}
  }
  const ls = new Set<() => void>();
  let saveT: number | undefined;
  return {
    get: () => s,
    set: (p) => {
      const patch = typeof p === "function" ? p(s) : p;
      s = { ...s, ...patch };
      ls.forEach((l) => l());
      if (persistKey && typeof localStorage !== "undefined") {
        clearTimeout(saveT);
        saveT = window.setTimeout(() => {
          try {
            localStorage.setItem(persistKey, JSON.stringify(s));
          } catch {}
        }, 200);
      }
    },
    sub: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
}

export function useStore<T extends object, U>(store: Store<T>, sel: (s: T) => U): U {
  return useSyncExternalStore(store.sub, () => sel(store.get()));
}

/* ---------------- Types ---------------- */

export interface Track {
  id: string;
  file: File;
  path: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  cover?: string;
  coverData?: string;
  rgTrack?: number;
  rgAlbum?: number;
  embeddedLyrics?: string;
  sidecar?: File;
  tagsDone?: boolean;
  demo?: boolean;
  subtitleTag?: string;
}

export interface LyricLine {
  t: number | null;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  offset: number; // seconds, live preview offset (display = t + offset)
  source?: string;
}

export interface SoundProfile {
  id: string;
  name: string;
  eq: number[];
  preampDb: number;
  bassDb: number;
  midsDb: number;
  trebleDb: number;
  width: number;
  crossfeed: number;
}

export type ThemeName = "dark" | "light" | "system" | "miku" | "teto" | "neru";
export type StereoMode = "normal" | "mono" | "karaoke" | "vocal";

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const WIDGET_IDS = ["now", "lyrics", "viz", "next", "quick", "sleep", "loop"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface Settings {
  theme: ThemeName;
  volume: number;
  muted: boolean;
  boostDb: number;
  limiter: boolean;
  eqOn: boolean;
  eq: number[];
  preampDb: number;
  autoPreamp: boolean;
  bassDb: number;
  midsDb: number;
  trebleDb: number;
  stereoMode: StereoMode;
  width: number;
  crossfeed: number;
  orbit: boolean;
  orbitSpeed: number;
  room: number;
  rgMode: "off" | "track" | "album";
  rgPreamp: number;
  rgAnalyze: boolean;
  gapless: boolean;
  crossfade: number;
  speed: number;
  keepPitch: boolean;
  tapLatency: number; // ms
  profiles: SoundProfile[];
  deviceMap: Record<string, string>;
  autoResume: boolean;
  pauseOnDisconnect: boolean;
  widgets: { id: WidgetId; on: boolean }[];
  showRoomWidgets: boolean;
  floatingMini: boolean;
  colormap: "magma" | "viridis" | "gray" | "miku" | "teto" | "neru";
  specLog: boolean;
  fftSize: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  likedIds: string[];
}

export const defaultSettings: Settings = {
  theme: "dark",
  volume: 0.8,
  muted: false,
  boostDb: 0,
  limiter: true,
  eqOn: true,
  eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  preampDb: 0,
  autoPreamp: true,
  bassDb: 0,
  midsDb: 0,
  trebleDb: 0,
  stereoMode: "normal",
  width: 1,
  crossfeed: 0,
  orbit: false,
  orbitSpeed: 0.12,
  room: 0,
  rgMode: "track",
  rgPreamp: 0,
  rgAnalyze: true,
  gapless: true,
  crossfade: 0,
  speed: 1,
  keepPitch: true,
  tapLatency: 100,
  profiles: [],
  deviceMap: {},
  autoResume: true,
  pauseOnDisconnect: true,
  widgets: WIDGET_IDS.map((id) => ({ id, on: id !== "now" && id !== "next" })),
  showRoomWidgets: false,
  floatingMini: false,
  colormap: "miku",
  specLog: false,
  fftSize: 2048,
  shuffle: false,
  repeat: "all",
  likedIds: [],
};

export const settings = createStore<Settings>(defaultSettings, "sonora.settings.v1");

export function toggleLikeTrack(id: string) {
  const cur = settings.get().likedIds;
  const liked = cur.includes(id);
  const next = liked ? cur.filter((x) => x !== id) : [...cur, id];
  settings.set({ likedIds: next });
  return !liked;
}

/**
 * Maps Sonora's 3-band Mids slider (-12..+12 dB) into a smooth bump across
 * the 500 Hz, 1 kHz, and 2 kHz bands of the 10-band EQ.
 */
export function applyMidsToEq(eq: number[], midsDb: number): number[] {
  const next = [...eq];
  next[4] = Math.round(midsDb * 0.75 * 2) / 2; // 500 Hz
  next[5] = midsDb;                            // 1 kHz
  next[6] = Math.round(midsDb * 0.75 * 2) / 2; // 2 kHz
  return next;
}

export interface LibState {
  tracks: Track[];
  queue: number[]; // indices into tracks
  qpos: number; // position in queue
  loading: boolean;
  folderName: string;
  filter: "all" | "liked";
}

export const library = createStore<LibState>({
  tracks: [],
  queue: [],
  qpos: -1,
  loading: false,
  folderName: "Sonora Sessions",
  filter: "all",
});

export interface PlayerState {
  playing: boolean;
  duration: number;
  trackId: string | null;
  abA: number | null;
  abB: number | null;
  sleepAt: number | null; // epoch ms
  sleepEndOfTrack: boolean;
  limiting: number; // dB of gain reduction
  clipping: boolean;
  rgApplied: number; // dB
  outputId: string;
  outputLabel: string;
  toast: string;
  lyricsVisible: boolean;
}

export const player = createStore<PlayerState>({
  playing: false,
  duration: 20,
  trackId: null,
  abA: null,
  abB: null,
  sleepAt: null,
  sleepEndOfTrack: false,
  limiting: 0,
  clipping: false,
  rgApplied: 0,
  outputId: "default",
  outputLabel: "",
  toast: "",
  lyricsVisible: true,
});

export const clock = createStore<{ t: number }>({ t: 0 });
export const lyricsStore = createStore<{ map: Record<string, Lyrics> }>({ map: {} });

let toastT: number | undefined;
export function toast(msg: string) {
  player.set({ toast: msg });
  clearTimeout(toastT);
  toastT = window.setTimeout(() => player.set({ toast: "" }), 2800);
}

export function currentTrack(): Track | undefined {
  const { tracks, queue, qpos } = library.get();
  return tracks[queue[qpos]] ?? tracks[0];
}

export function fmt(sec: number | null | undefined) {
  if (sec == null || !isFinite(sec)) return "--:--";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
