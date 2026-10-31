import { ingest, loadLyricsFor } from "./library";
import { library, toast } from "./store";

// Synthesizes Sonora's signature "Afterglow" ambient track + Vocaloid trio demo songs in-browser.
// Each track embeds a hidden spectrogram image (viewable in Sound Lab -> Open Spectrogram -> Linear Hz).

interface DemoSpec {
  title: string;
  artist: string;
  album: string;
  subtitleTag: string;
  cover: string;
  hidden: string;
  root: number; // MIDI note
  bpm: number;
  prog: number[][];
  lyrics: { t: number; text: string }[];
  ambient?: boolean;
}

function makeSvgCover(bg1: string, bg2: string, accent: string, code: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <circle cx="256" cy="256" r="176" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2"/>
    <circle cx="256" cy="256" r="118" fill="none" stroke="${accent}" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="6 8"/>
    <path d="M96 278h46l24-74 36 144 42-182 38 132 26-58 20 38h88" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="42" y="76" fill="${accent}" font-family="monospace" font-weight="800" font-size="38" letter-spacing="3">${code}</text>
    <text x="42" y="458" fill="#ffffff" fill-opacity="0.75" font-family="sans-serif" font-weight="700" font-size="22" letter-spacing="4">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AFTERGLOW_SPEC: DemoSpec = {
  title: "Afterglow",
  artist: "Sonora Sessions",
  album: "Sonora Sessions",
  subtitleTag: "Ambient electronic · Demo track",
  cover: "./afterglow-cover.webp",
  hidden: "SONORA",
  root: 58,
  bpm: 96,
  prog: [
    [0, 4, 7, 11],
    [5, 9, 12, 16],
    [9, 12, 16, 19],
    [7, 11, 14, 17],
  ],
  ambient: true,
  lyrics: [
    { t: 0, text: "The light settles in" },
    { t: 3.2, text: "Somewhere beyond the blue" },
    { t: 6.8, text: "A quiet place to begin again" },
    { t: 10.5, text: "We let the hours drift away" },
    { t: 14.3, text: "And follow the afterglow" },
    { t: 17.6, text: "Until the stars come through" },
  ],
};

const EXTRA_SPECS: DemoSpec[] = [
  {
    title: "Teal Signal",
    artist: "CV01 Miku Synth",
    album: "Vocaloid Studio 39",
    subtitleTag: "Cyber-pop · Spectrogram: MIKU 39",
    cover: makeSvgCover("#0a191c", "#143538", "#39c5bb", "01 // 39", "HATSUNE HARMONICS"),
    hidden: "MIKU 39",
    root: 57,
    bpm: 128,
    prog: [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12],
    ],
    lyrics: [
      { t: 0, text: "♪ (intro) ♪" },
      { t: 2.2, text: "Signal in the teal light" },
      { t: 4.8, text: "Thirty-nine voices calling" },
      { t: 7.5, text: "Twin tails spinning through the night" },
      { t: 10.2, text: "Sing it once and keep on falling" },
      { t: 13.0, text: "Check the spectrogram tonight" },
      { t: 15.6, text: "There is a secret in the sound" },
      { t: 18.0, text: "♪ (outro) ♪" },
    ],
  },
  {
    title: "Baguette Drill",
    artist: "UTAU 0401 Teto",
    album: "Chimera Sessions",
    subtitleTag: "Synth-rock · Spectrogram: TETO 0401",
    cover: makeSvgCover("#1f0c11", "#38141d", "#e8455a", "0401", "KASANE DRILL STUDIO"),
    hidden: "TETO 0401",
    root: 50,
    bpm: 140,
    prog: [
      [0, 3, 7],
      [8, 12, 15],
      [3, 7, 10],
      [10, 14, 17],
    ],
    lyrics: [
      { t: 0, text: "♪ (intro) ♪" },
      { t: 2.1, text: "Red drills turning round and round" },
      { t: 4.6, text: "April fool that came to stay" },
      { t: 7.2, text: "Warm gold notes on crimson ground" },
      { t: 9.8, text: "Gapless into the next play" },
      { t: 12.5, text: "Tap the lines to sync the sound" },
      { t: 15.2, text: "Shift them all by plus or minus" },
      { t: 17.8, text: "♪ (outro) ♪" },
    ],
  },
  {
    title: "Yellow Flip-Phone",
    artist: "DEN-02 Neru",
    album: "Akita Signal",
    subtitleTag: "Electro-beep · Spectrogram: NERU DEN",
    cover: makeSvgCover("#1c190a", "#332c10", "#ffd60a", "DEN-02", "AKITA PULSE LINE"),
    hidden: "NERU DEN",
    root: 53,
    bpm: 132,
    prog: [
      [0, 4, 7],
      [5, 9, 12],
      [2, 5, 9],
      [7, 11, 14],
    ],
    lyrics: [
      { t: 0, text: "♪ (dial tone) ♪" },
      { t: 2.4, text: "Golden side-tail on the line" },
      { t: 5.0, text: "Flip-phone glowing in the dark" },
      { t: 7.8, text: "Every keypad press in time" },
      { t: 10.6, text: "Leaves an amber neon spark" },
      { t: 13.4, text: "Ten-band filters locked in place" },
      { t: 16.2, text: "Midnight signal crystal clear" },
    ],
  },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function renderText(text: string, w: number, h: number) {
  if (typeof document === "undefined") return new Float32Array(w * h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return new Float32Array(w * h);
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff";
  let fs = Math.floor(h * 0.82);
  g.font = `900 ${fs}px system-ui, sans-serif`;
  const mw = g.measureText(text).width;
  if (mw > w * 0.92) {
    fs = Math.floor((fs * w * 0.92) / mw);
    g.font = `900 ${fs}px system-ui, sans-serif`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 1);
  const d = g.getImageData(0, 0, w, h).data;
  const px = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) px[i] = d[i * 4] / 255;
  return px;
}

function synth(spec: DemoSpec, sr = 22050) {
  const dur = 20;
  const N = sr * dur;
  const L = new Float32Array(N),
    R = new Float32Array(N);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const ci = Math.floor(t / bar) % spec.prog.length;
    const ch = spec.prog[ci];
    const tb = t % bar;
    const env = Math.min(1, tb * 3.5) * Math.min(1, (bar - tb) * 4.5);

    let pad = 0;
    for (const n of ch) {
      const f = mtof(spec.root + 12 + n);
      pad += Math.sin(2 * Math.PI * f * t) * 0.48 + Math.sin(2 * Math.PI * f * 2.002 * t) * 0.14;
    }
    pad *= (spec.ambient ? 0.075 : 0.05) * env;

    const tq = t % beat;
    const bf = mtof(spec.root - 12 + ch[0]);
    const bass = Math.tanh(Math.sin(2 * Math.PI * bf * t) * 1.8) * Math.exp(-tq * (spec.ambient ? 3.2 : 5)) * 0.2;
    const kick = spec.ambient
      ? Math.sin(2 * Math.PI * (46 + 70 * Math.exp(-tq * 22)) * tq) * Math.exp(-tq * 11) * 0.22
      : Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-tq * 30)) * tq) * Math.exp(-tq * 9) * 0.34;

    const step = Math.floor(t / (beat / 2));
    const te = t % (beat / 2);
    const an = ch[step % ch.length] + (step % 6 >= 3 ? 12 : 0);
    const af = mtof(spec.root + 24 + an);
    const arp = (Math.sin(2 * Math.PI * af * t) + 0.28 * Math.sin(4 * Math.PI * af * t)) * Math.exp(-te * 8.5) * 0.085;
    const pan = step % 2 ? 0.78 : 0.22;

    const fadeIn = Math.min(1, t / 1.4),
      fadeOut = Math.min(1, (dur - t) / 1.5);
    const m = (pad + bass + kick) * fadeIn * fadeOut;
    L[i] = m + arp * (1 - pan) * fadeIn * fadeOut;
    R[i] = m + arp * pan * fadeIn * fadeOut;
  }

  // Embed spectrogram watermark between 5 kHz and 10.2 kHz
  const W = 180,
    H = 36;
  const px = renderText(spec.hidden, W, H);
  const t0 = 2,
    t1 = 18,
    colLen = Math.floor(((t1 - t0) / W) * sr);
  for (let r = 0; r < H; r++) {
    const f = 10200 - (r / (H - 1)) * 5200;
    const w = (2 * Math.PI * f) / sr;
    for (let c = 0; c < W; c++) {
      const v = px[r * W + c];
      if (v < 0.25) continue;
      const s0 = Math.floor(t0 * sr) + c * colLen;
      const amp = 0.0055 * v;
      for (let k = 0; k < colLen; k++) {
        const win = Math.sin((Math.PI * k) / colLen);
        const sv = Math.sin(w * (s0 + k)) * amp * (0.4 + 0.6 * win);
        L[s0 + k] += sv;
        R[s0 + k] += sv;
      }
    }
  }
  return { L, R, sr, dur };
}

function wav(L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  ws(0, "RIFF");
  dv.setUint32(4, 36 + n * 4, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  ws(36, "data");
  dv.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    o += 4;
  }
  return new Blob([buf], { type: "audio/wav" });
}

function formatLrcLines(lines: { t: number; text: string }[]) {
  return lines
    .map(
      (l) =>
        `[${String(Math.floor(l.t / 60)).padStart(2, "0")}:${(l.t % 60).toFixed(2).padStart(5, "0")}]${l.text}`
    )
    .join("\n");
}

let bootLoaded = false;

export async function ensureStarterDemo() {
  if (bootLoaded || library.get().tracks.length > 0) return;
  bootLoaded = true;
  const { L, R, sr, dur } = synth(AFTERGLOW_SPEC, 22050);
  const name = `${AFTERGLOW_SPEC.artist} - ${AFTERGLOW_SPEC.title}.wav`;
  const file = new File([wav(L, R, sr)], name, { type: "audio/wav", lastModified: 1700000000000 });
  const lrc = formatLrcLines(AFTERGLOW_SPEC.lyrics);
  await ingest(
    [
      {
        file,
        path: `${AFTERGLOW_SPEC.album}/${name}`,
        cover: AFTERGLOW_SPEC.cover,
        demo: true,
        subtitleTag: AFTERGLOW_SPEC.subtitleTag,
        duration: dur,
      },
    ],
    "Sonora Sessions",
    false,
    true
  );
  const tr = library.get().tracks[0];
  if (tr) {
    (tr as any).demoLyrics = lrc;
    await loadLyricsFor(tr);
  }
}

export async function loadDemo() {
  library.set({ loading: true });
  await new Promise((r) => setTimeout(r, 20));
  const allSpecs = [AFTERGLOW_SPEC, ...EXTRA_SPECS];
  const files: {
    file: File;
    path: string;
    cover?: string;
    demo?: boolean;
    subtitleTag?: string;
    duration?: number;
  }[] = [];
  const lyr: Record<string, string> = {};

  for (const [i, spec] of allSpecs.entries()) {
    const { L, R, sr, dur } = synth(spec, 22050);
    const name = `${spec.artist} - ${spec.title}.wav`;
    const file = new File([wav(L, R, sr)], name, { type: "audio/wav", lastModified: 1700000000000 + i });
    files.push({
      file,
      path: `${spec.album}/${name}`,
      cover: spec.cover,
      demo: true,
      subtitleTag: spec.subtitleTag,
      duration: dur,
    });
    lyr[name] = formatLrcLines(spec.lyrics);
    await new Promise((r) => setTimeout(r, 0));
  }

  await ingest(files, "Sonora & Vocaloid Synth Demos", false, true);
  for (const t of library.get().tracks) {
    if (lyr[t.file.name]) {
      (t as any).demoLyrics = lyr[t.file.name];
      await loadLyricsFor(t);
    }
  }
  toast("4 synthesized demo tracks ready (with synced lyrics & spectrogram art)");
}
