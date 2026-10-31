import { useState } from "react";
import { useStore, settings, toggleLikeTrack } from "../lib/store";
import { useCurrent, SeekBar, Transport } from "./Player";
import { LyricsScroller } from "./LyricsScroller";
import { Cover, Icon } from "./ui";

export default function NowPlaying({
  onNavigate,
}: {
  onNavigate: (v: "room" | "library" | "lyrics" | "sound") => void;
}) {
  const track = useCurrent();
  const likedIds = useStore(settings, state => state.likedIds);
  const liked = track ? likedIds.includes(track.id) : false;
  const [surface, setSurface] = useState<"cover" | "lyrics">("cover");

  return (
    <div className="main-content now-playing-screen">
      <div className="now-playing-toolbar">
        <button type="button" onClick={() => onNavigate("room")} aria-label="Back to home">
          <Icon n="down" s={21} />
        </button>
        <span>Now playing</span>
        <span />
      </div>

      {track ? (
        <>
          <div className="now-playing-switch segmented" role="tablist" aria-label="Now playing display">
            <button
              type="button"
              role="tab"
              aria-selected={surface === "cover"}
              className={surface === "cover" ? "selected" : ""}
              onClick={() => setSurface("cover")}
            >
              Cover
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={surface === "lyrics"}
              className={surface === "lyrics" ? "selected" : ""}
              onClick={() => setSurface("lyrics")}
            >
              Lyrics
            </button>
          </div>

          <div className={"now-playing-body" + (surface === "lyrics" ? " lyrics-mode" : "")}>
            {surface === "cover" ? (
              <Cover src={track.cover} size={264} className="now-playing-cover" alt={track.title} />
            ) : (
              <LyricsScroller className="now-lyrics-view" onOpenStudio={() => onNavigate("lyrics")} />
            )}

            <div className="now-playing-track">
              <div className="now-playing-meta">
                <div>
                  <h1>{track.title}</h1>
                  <p>{track.artist}</p>
                </div>
                <button
                  type="button"
                  className={"like-button" + (liked ? " liked" : "")}
                  onClick={() => toggleLikeTrack(track.id)}
                  aria-label={liked ? "Unlike track" : "Like track"}
                >
                  <Icon n="heart" s={21} fill={liked} />
                </button>
              </div>
              <SeekBar />
              <Transport size={1.15} />
              <div className="now-playing-links">
                <button type="button" onClick={() => onNavigate("lyrics")}>
                  <Icon n="lyrics" s={17} /> Lyrics studio
                </button>
                <button type="button" onClick={() => onNavigate("sound")}>
                  <Icon n="sliders" s={17} /> Sound
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-library">
          <div className="empty-library-icon"><Icon n="music" s={27} /></div>
          <div>
            <h3>No track selected</h3>
            <p>Choose a song from your library.</p>
          </div>
          <button type="button" className="accent-button" onClick={() => onNavigate("library")}>
            Library
          </button>
        </div>
      )}
    </div>
  );
}
