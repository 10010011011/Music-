import { activeIndex, activeWordIndex, bakeOffset, parseLyrics, shiftFrom, toLRC } from "../src/lib/lyrics";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error("FAIL: " + label);
}
function equal<T>(actual: T, expected: T, label: string) {
  assert(actual === expected, label + ": expected " + String(expected) + ", received " + String(actual));
}
function deepEqual(actual: unknown, expected: unknown, label: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), label + ": values differ");
}
function close(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) < 0.001, label + ": expected " + expected + ", received " + actual);
}

// Ordinary LRC remains line-synchronised.
const plain = parseLyrics("[00:12.00]Hello world\n[00:15.25]Next line", "plain.lrc");
equal(plain.lines.length, 2, "plain line count");
equal(plain.lines[0].text, "Hello world", "plain lyric text");
close(plain.lines[0].t!, 12, "plain line timestamp");
equal(plain.lines[0].words, undefined, "plain LRC has no fabricated word timing");
equal(activeIndex(plain, 13), 0, "plain active line");

// Enhanced LRC preserves per-word timestamps and inter-word spaces.
const enhancedText = "[00:12.00]<00:12.00>Hello <00:12.40>world";
const enhanced = parseLyrics(enhancedText, "enhanced.lrc");
equal(enhanced.lines[0].text, "Hello world", "enhanced line text");
deepEqual(enhanced.lines[0].words?.map(word => word.text), ["Hello ", "world"], "enhanced word text and spacing");
close(enhanced.lines[0].words![0].t, 12, "first word timestamp");
close(enhanced.lines[0].words![1].t, 12.4, "second word timestamp");
equal(activeWordIndex(enhanced.lines[0], 12.2), 0, "first word is active");
equal(activeWordIndex(enhanced.lines[0], 12.5), 1, "second word is active");

// LRC offsets apply equally to line and word timestamps.
const offset = parseLyrics("[offset:500]\n" + enhancedText, "offset.lrc");
close(offset.lines[0].t!, 11.5, "offset line timestamp");
close(offset.lines[0].words![0].t, 11.5, "offset first word");
close(offset.lines[0].words![1].t, 11.9, "offset second word");

// Enhanced timing survives exporting and re-importing.
const roundTrip = parseLyrics(toLRC(enhanced), "roundtrip.lrc");
equal(roundTrip.lines[0].text, enhanced.lines[0].text, "round-trip line text");
deepEqual(roundTrip.lines[0].words?.map(word => word.text), ["Hello ", "world"], "round-trip word text");
close(roundTrip.lines[0].words![1].t, 12.4, "round-trip second word");

// Multiple line timestamps shift each repeated performance's word timestamps.
const repeated = parseLyrics("[00:01.00][00:05.00]<00:01.00>Hi <00:01.50>there", "repeat.lrc");
equal(repeated.lines.length, 2, "repeated line count");
close(repeated.lines[1].t!, 5, "repeated line timestamp");
close(repeated.lines[1].words![1].t, 5.5, "repeated word timestamp");

// WebVTT karaoke timestamp tags are retained too.
const vtt = parseLyrics(
  "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<00:00:01.000>Hello <00:00:02.000>world",
  "karaoke.vtt"
);
equal(vtt.lines[0].text, "Hello world", "WebVTT line text");
close(vtt.lines[0].words![1].t, 2, "WebVTT word timestamp");

// Timestamp-adjustment helpers keep word and line timing aligned.
const shifted = shiftFrom(enhanced, 0, 1);
close(shifted.lines[0].t!, 13, "shifted line");
close(shifted.lines[0].words![1].t, 13.4, "shifted word");
const baked = bakeOffset({ ...enhanced, offset: 0.5 });
close(baked.lines[0].t!, 12.5, "baked line offset");
close(baked.lines[0].words![1].t, 12.9, "baked word offset");

console.log("Lyrics parser tests passed (plain LRC, enhanced LRC, offsets, round-trip, repeated tags, WebVTT).");
