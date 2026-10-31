import type { LyricLine, Lyrics } from "./store";

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function toSec(m: string, s: string, f?: string) {
  let frac = 0;
  if (f) frac = parseInt(f, 10) / Math.pow(10, f.length);
  return parseInt(m, 10) * 60 + parseInt(s, 10) + frac;
}

export function parseCueTime(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) {
    const sub = s.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
    if (!sub) return null;
    return (sub[1] ? parseInt(sub[1]) * 3600 : 0) + parseInt(sub[2]) * 60 + parseInt(sub[3]) + parseInt(sub[4]) / Math.pow(10, sub[4].length);
  }
  return (m[1] ? parseInt(m[1]) * 3600 : 0) + parseInt(m[2]) * 60 + parseInt(m[3]) + (m[4] ? parseInt(m[4]) / Math.pow(10, m[4].length) : 0);
}

export function parseLyrics(text: string, source = "text"): Lyrics {
  text = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  // SRT / VTT
  if (/-->/.test(text)) {
    const lines: LyricLine[] = [];
    for (const block of text.split(/\n\s*\n/)) {
      const rows = block.split("\n").filter((r) => r.trim() && r.trim() !== "WEBVTT");
      const ti = rows.findIndex((r) => r.includes("-->"));
      if (ti < 0) continue;
      const t = parseCueTime(rows[ti].split("-->")[0]);
      const txt = rows.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
      if (txt) lines.push({ t, text: txt });
    }
    return { lines: sortLines(lines), offset: 0, source };
  }
  // LRC (with multi-tag lines, [offset:], enhanced word tags)
  let offset = 0;
  const lines: LyricLine[] = [];
  let timed = 0;
  for (const raw of text.split("\n")) {
    const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) {
      offset = parseInt(off[1], 10) / 1000; // LRC: positive = lyrics earlier
      continue;
    }
    if (/^\s*\[[a-z]+:.*\]\s*$/i.test(raw)) continue; // metadata
    const times: number[] = [];
    TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TAG.exec(raw))) {
      if (m.index !== lastEnd && raw.slice(lastEnd, m.index).trim()) break;
      times.push(toSec(m[1], m[2], m[3]));
      lastEnd = m.index + m[0].length;
    }
    const txt = raw.slice(lastEnd).replace(WORD, "").trim();
    if (times.length) {
      timed++;
      for (const t of times) lines.push({ t, text: txt });
    } else if (txt) lines.push({ t: null, text: txt });
  }
  const res = timed ? sortLines(lines) : lines;
  if (offset) res.forEach((l) => l.t != null && (l.t = Math.max(0, l.t - offset)));
  return { lines: res, offset: 0, source };
}

function sortLines(lines: LyricLine[]) {
  if (lines.some((l) => l.t == null)) return lines;
  return [...lines].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

export function stamp(t: number) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
}

export function toLRC(l: Lyrics, meta?: { ti?: string; ar?: string }) {
  const out: string[] = [];
  if (meta?.ti) out.push(`[ti:${meta.ti}]`);
  if (meta?.ar) out.push(`[ar:${meta.ar}]`);
  for (const line of l.lines) {
    out.push(line.t == null ? line.text : `[${stamp(Math.max(0, line.t + l.offset))}]${line.text}`);
  }
  return out.join("\n");
}

export function bakeOffset(l: Lyrics): Lyrics {
  return {
    ...l,
    offset: 0,
    lines: l.lines.map((x) => ({
      ...x,
      t: x.t == null ? null : Math.round(Math.max(0, x.t + l.offset) * 100) / 100,
    })),
  };
}

export function shiftFrom(l: Lyrics, fromIdx: number, delta: number): Lyrics {
  return {
    ...l,
    lines: l.lines.map((x, i) =>
      i >= fromIdx && x.t != null
        ? { ...x, t: Math.round(Math.max(0, x.t + delta) * 100) / 100 }
        : x
    ),
  };
}

export function activeIndex(l: Lyrics | undefined, time: number) {
  if (!l) return -1;
  let idx = -1;
  for (let i = 0; i < l.lines.length; i++) {
    const t = l.lines[i].t;
    if (t == null) continue;
    if (t + l.offset <= time + 0.08) idx = i;
    else break;
  }
  return idx;
}
