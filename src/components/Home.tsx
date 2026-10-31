import { useStore, settings, library, player, fmt, toggleLikeTrack } from "../lib/store";
import { engine } from "../lib/engine";
import { useCurrent } from "./Player";
import { Icon, Cover } from "./ui";

export default function Home({
  onNavigate,
}: {
  onNavigate: (v: "room" | "library" | "lyrics" | "sound") => void;
}) {
  const track = useCurrent();
  const playing = useStore(player, (s) => s.playing);
  const { tracks, queue, qpos } = useStore(library, (s) => s);
  const likedIds = useStore(settings, (s) => s.likedIds);

  return (
    <div className="main-content room-content android-home">
      <div className="home-heading">
        <h1>Home</h1>
        <button type="button" className="text-action" onClick={() => onNavigate("library")}>
          Library <Icon n="right" s={16} />
        </button>
      </div>

      <section className="home-now-playing">
        <div className="section-head">
          <h2>Now playing</h2>
        </div>
        {track ? (
          <div className="feature-track" data-theme-card="true">
            <Cover src={track.cover} size={112} className="home-cover" alt={track.title} />
            <div className="feature-info">
              <div className="now-label">{playing ? "PLAYING" : "PAUSED"}</div>
              <div className="track-title">{track.title}</div>
              <div className="track-artist">{track.artist}</div>
              <div className="feature-buttons">
                <button
                  type="button"
                  className="round-play"
                  onClick={() => engine.toggle()}
                  aria-label={playing ? "Pause track" : "Play track"}
                >
                  <Icon n={playing ? "pause" : "play"} s={21} fill />
                </button>
                <button
                  type="button"
                  className={`like-button ${likedIds.includes(track.id) ? "liked" : ""}`}
                  title={likedIds.includes(track.id) ? "Unlike track" : "Like track"}
                  aria-label="Like track"
                  onClick={() => toggleLikeTrack(track.id)}
                >
                  <Icon n="heart" s={19} fill={likedIds.includes(track.id)} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-library">
            <div className="empty-library-icon"><Icon n="music" s={27} /></div>
            <div>
              <h3>No songs yet</h3>
              <p>Add music to start listening.</p>
            </div>
            <button type="button" className="accent-button" onClick={() => onNavigate("library")}>
              <Icon n="plus" s={16} /> Add music
            </button>
          </div>
        )}
      </section>

      <section className="queue-section home-music-list">
        <div className="section-head">
          <h2>Your music</h2>
          <button type="button" className="text-action" onClick={() => onNavigate("library")}>
            See all <Icon n="right" s={16} />
          </button>
        </div>

        {tracks.length ? (
          <div className="queue-list">
            {queue.slice(0, 8).map((ti, qIndex) => {
              const t = tracks[ti];
              if (!t) return null;
              const isCurrent = qpos === qIndex;
              const isLiked = likedIds.includes(t.id);
              return (
                <div key={t.id} className={`queue-row ${isCurrent ? "current" : ""}`}>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                    onClick={() => engine.playAt(qIndex)}
                  >
                    <Cover src={t.cover} size={44} alt={t.title} />
                    <span className="queue-name">
                      <b>{t.title}</b>
                      <small>{t.artist}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`row-heart px-2 ${isLiked ? "liked" : ""}`}
                    aria-label={`Like ${t.title}`}
                    onClick={() => toggleLikeTrack(t.id)}
                  >
                    <Icon n="heart" s={16} fill={isLiked} />
                  </button>
                  <span className="queue-duration tabular-nums">{t.duration ? fmt(t.duration) : "--:--"}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="home-list-empty">Your imported songs will appear here.</div>
        )}
      </section>
    </div>
  );
}
