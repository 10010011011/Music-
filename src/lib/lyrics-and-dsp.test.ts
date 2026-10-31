import test from "node:test";
import assert from "node:assert/strict";
import { parseLyrics, toLRC, activeIndex, bakeOffset, shiftFrom, stamp, parseCueTime } from "./lyrics";
import { titleFromName } from "./tags";
import { applyMidsToEq, fmt } from "./store";

test("parseLyrics parses standard LRC with multiple tags and [offset:]", () => {
  const raw = `[ti:Afterglow]\n[ar:Sonora]\n[offset:500]\n[00:02.00][00:10.00]Hello world\n[00:05.50]Second line`;
  const parsed = parseLyrics(raw, "test.lrc");
  assert.equal(parsed.lines.length, 3);
  // offset +500ms means 0.5s subtracted from each timestamp
  assert.equal(parsed.lines[0].t, 1.5);
  assert.equal(parsed.lines[0].text, "Hello world");
  assert.equal(parsed.lines[1].t, 5.0);
  assert.equal(parsed.lines[1].text, "Second line");
  assert.equal(parsed.lines[2].t, 9.5);
});

test("parseLyrics parses SRT / VTT subtitle blocks", () => {
  const srt = `1\n00:00:03,200 --> 00:00:06,000\nSomewhere beyond the blue\n\n2\n00:00:06,800 --> 00:00:10,000\nA quiet place to begin again`;
  const parsed = parseLyrics(srt, "sub.srt");
  assert.equal(parsed.lines.length, 2);
  assert.equal(parsed.lines[0].t, 3.2);
  assert.equal(parsed.lines[0].text, "Somewhere beyond the blue");
  assert.equal(parsed.lines[1].t, 6.8);
});

test("bakeOffset and shiftFrom adjust timestamps accurately", () => {
  const lyr = parseLyrics("[00:04.00]First\n[00:08.00]Second");
  const withOffset = { ...lyr, offset: 1.5 };
  const baked = bakeOffset(withOffset);
  assert.equal(baked.offset, 0);
  assert.equal(baked.lines[0].t, 5.5);
  assert.equal(baked.lines[1].t, 9.5);

  const shifted = shiftFrom(baked, 1, -1.7);
  assert.equal(shifted.lines[0].t, 5.5);
  assert.equal(shifted.lines[1].t, 7.8);
});

test("activeIndex locates active lyric line with live offset", () => {
  const lyr = parseLyrics("[00:00.00]Line 1\n[00:03.20]Line 2\n[00:06.80]Line 3");
  assert.equal(activeIndex(lyr, 0.1), 0);
  assert.equal(activeIndex(lyr, 3.2), 1);
  assert.equal(activeIndex(lyr, 7.0), 2);
});

test("stamp and parseCueTime round-trip cleanly", () => {
  assert.equal(stamp(65.4), "01:05.40");
  assert.equal(parseCueTime("01:05.40"), 65.4);
});

test("titleFromName extracts artist and title from filename", () => {
  const a = titleFromName("01. CV01 Miku - Teal Signal.flac");
  assert.equal(a.artist, "CV01 Miku");
  assert.equal(a.title, "Teal Signal");

  const b = titleFromName("03_Afterglow_Session.mp3");
  assert.equal(b.artist, "");
  assert.equal(b.title, "Afterglow Session");
});

test("applyMidsToEq maps 3-band Mids to 500Hz, 1kHz, and 2kHz bands", () => {
  const eq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const updated = applyMidsToEq(eq, 4);
  assert.equal(updated[4], 3);
  assert.equal(updated[5], 4);
  assert.equal(updated[6], 3);
  assert.equal(fmt(125), "2:05");
  assert.equal(toLRC(parseLyrics("[00:01.00]Hi")), "[00:01.00]Hi");
});
