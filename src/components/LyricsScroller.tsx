import { useEffect, useRef } from "react";
import { clock, lyricsStore, useStore, type LyricLine } from "../lib/store";
import { loadLyricsFor } from "../lib/library";
import { activeIndex, activeWordIndex } from "../lib/lyrics";
import { engine } from "../lib/engine";
import { useCurrent } from "./Player";
import { Icon } from "./ui";

export function LyricText({
  line,
  time,
  offset = 0,
  active = false,
}: {
  line: LyricLine;
  time: number;
  offset?: number;
  active?: boolean;
}) {
  if (!line.words?.length) return <span className="lyric-text">{line.text || "♪"}</span>;
  const activeWord = active ? activeWordIndex(line, time, offset) : -1;

  return (
    <span className="lyric-words">
      {line.words.map((word, index) => (
        <span
          key={index}
          className={
            "lyric-word"
            + (active && index === activeWord ? " is-current" : "")
            + (active && activeWord >= 0 && index < activeWord ? " is-spoken" : "")
          }
        >
          {word.text}
        </span>
      ))}
    </span>
  );
}

export function LyricsScroller({
  className = "lyrics-body",
  onOpenStudio,
}: {
  className?: string;
  onOpenStudio?: () => void;
}) {
  const track = useCurrent();
  const lyrics = useStore(lyricsStore, state => (track ? state.map[track.id] : undefined));
  const time = useStore(clock, state => state.t);
  const active = activeIndex(lyrics, time);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  useEffect(() => {
    if (track) void loadLyricsFor(track);
  }, [track?.id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || active < 0 || Date.now() - userScrolledAt.current < 3200) return;
    const line = container.querySelector<HTMLElement>('[data-line="' + active + '"]');
    if (!line) return;
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2,
      behavior: "smooth",
    });
  }, [active, track?.id, lyrics?.lines.length]);

  const lines = lyrics?.lines ?? [];
  const offset = lyrics?.offset ?? 0;

  return (
    <div
      className={className}
      ref={containerRef}
      onWheel={() => { userScrolledAt.current = Date.now(); }}
      onTouchMove={() => { userScrolledAt.current = Date.now(); }}
    >
      {lines.length ? (
        lines.map((line, index) => (
          <button
            type="button"
            key={index}
            data-line={index}
            className={
              "lyric-line"
              + (active === index ? " active" : "")
              + (index < active ? " past" : "")
            }
            onClick={() => {
              if (line.t != null) engine.seek(line.t + offset);
            }}
          >
            <span className="lyric-marker" />
            <LyricText line={line} time={time} offset={offset} active={active === index} />
          </button>
        ))
      ) : (
        <div className="no-lyrics">
          <Icon n="mic" s={28} />
          <b>{track ? "No lyrics yet" : "Nothing playing"}</b>
          <p>{track ? "Import an LRC file or paste your lyrics in Lyrics studio." : "Choose a song to see its lyrics here."}</p>
          {track && onOpenStudio && (
            <button type="button" onClick={onOpenStudio}>
              Add lyrics <Icon n="right" s={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
