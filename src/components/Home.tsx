import { useState } from "react";
import { useStore, settings, library, player, clock, fmt, toggleLikeTrack } from "../lib/store";
import { engine } from "../lib/engine";
import { loadDemo } from "../lib/demo";
import { useCurrent, ABLoop, SpeedChip, SleepChip } from "./Player";
import { LyricsView, useLyrics, SoundInMotionCanvas, LiveCanvas, drawSpectrum } from "./SharedAudioViews";
import { LimiterMeter } from "./Sound";
import { Card, Cover, Slider, Chip, Icon } from "./ui";

const spec40 = drawSpectrum(40);

const THEME_MOTIFS: Record<string, { code: string; badge: string; note: string }> = {
  miku: {
    code: "CV01 // 39",
    badge: "HATSUNE HARMONIC MATRIX",
    note: "Cyan #39C5BB & Ribbon Magenta #E12885 · Vocal Synth Grid",
  },
  teto: {
    code: "UTAU // 0401",
    badge: "KASANE TWIN-DRILL STUDIO",
    note: "Crimson #E8455A & Baguette Gold #E9B56F · Chimera Drive",
  },
  neru: {
    code: "DEN // 02",
    badge: "AKITA FLIP-PHONE SIGNAL",
    note: "Canary #FFD60A & Amber Pulse #FF8A1F · Dot-Matrix Monitor",
  },
};

export default function Home({
  onNavigate,
  onOpenVisual,
}: {
  onNavigate: (v: "room" | "library" | "lyrics" | "sound") => void;
  onOpenVisual: () => void;
}) {
  const track = useCurrent();
  const playing = useStore(player, (s) => s.playing);
  const position = useStore(clock, (s) => s.t);
  const duration = useStore(player, (s) => s.duration) || track?.duration || 20;
  const rg = useStore(player, (s) => s.rgApplied);
  const outLabel = useStore(player, (s) => s.outputLabel);
  const { tracks, queue, qpos } = useStore(library, (s) => s);
  const s = useStore(settings, (x) => x);
  const lyr = useLyrics(track);

  const [spectrum, setSpectrum] = useState(false);

  const isLiked = track ? s.likedIds.includes(track.id) : false;
  const motif = THEME_MOTIFS[s.theme];

  // Build technical detail string with clean typographic separators (Zero-Pill discipline)
  const detailParts: string[] = [];
  if (track?.subtitleTag) detailParts.push(track.subtitleTag);
  else if (track?.demo) detailParts.push("Ambient electronic · Demo track");
  else detailParts.push(`From your device · ${track?.album || "Local audio"}`);

  if (s.rgMode !== "off") detailParts.push(`RG ${rg >= 0 ? "+" : ""}${rg.toFixed(1)} dB`);
  if (s.gapless) detailParts.push("Gapless");
  if (s.crossfade > 0) detailParts.push(`Crossfade ${s.crossfade}s`);
  if (s.boostDb > 0) detailParts.push(`Boost +${s.boostDb} dB`);
  if (s.orbit) detailParts.push("8D Orbit");
  if (outLabel) detailParts.push(outLabel);

  return (
    <div className="main-content room-content">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="section-kicker">
          <span /> THE LISTENING ROOM
        </div>
        {motif && (
          <div className="theme-motif-banner">
            <strong>{motif.code}</strong>
            <span>·</span>
            <span>{motif.badge}</span>
          </div>
        )}
      </div>

      <h1>
        Your music, <em>your way.</em>
      </h1>
      <p className="subtitle">
        {motif ? motif.note : "A little space to get lost in the sound."}
      </p>

      {/* Hero Feature Track Card (Sonora Layout) */}
      <section className="feature-track" data-theme-card={s.theme}>
        <div className={`cover-art ${track?.cover ? "" : "local-cover"}`}>
          {track?.cover ? (
            <img src={track.cover} alt={`${track.title} artwork`} referrerPolicy="no-referrer" />
          ) : (
            <Icon n="music" s={76} strokeWidth={1.1} />
          )}
        </div>

        <div className="feature-info">
          <div className="now-label">
            {playing ? "NOW PLAYING" : "READY TO PLAY"}
            {motif && <span>· {motif.code}</span>}
          </div>
          <div className="track-title">{track?.title || "Afterglow"}</div>
          <div className="track-artist">{track?.artist || "Sonora Sessions"}</div>
          <div className="feature-rule" />
          <div className="track-detail">
            <Icon n="audio-lines" s={17} />{" "}
            <span>{detailParts.join(" · ")}</span>
          </div>
          <div className="feature-buttons">
            <button
              type="button"
              className="round-play"
              onClick={() => engine.toggle()}
              aria-label={playing ? "Pause track" : "Play track"}
            >
              <Icon n={playing ? "pause" : "play"} s={23} fill />
            </button>
            <span>{playing ? "Pause track" : "Play track"}</span>

            {tracks.length <= 1 && (
              <button
                type="button"
                className="outline-button ml-2 h-9 px-3 text-xs"
                onClick={loadDemo}
                title="Synthesize Miku, Teto & Neru demo songs with spectrogram art"
              >
                <Icon n="sparkles" s={15} /> Load Vocaloid &amp; Synth Demos
              </button>
            )}

            {track && (
              <button
                type="button"
                className={`like-button ${isLiked ? "liked" : ""}`}
                title={isLiked ? "Unlike track" : "Like track"}
                aria-label="Like track"
                onClick={() => toggleLikeTrack(track.id)}
              >
                <Icon n="heart" s={20} fill={isLiked} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Sound in Motion Section */}
      <section className="visual-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">FEEL THE FREQUENCY</span>
            <h2>Sound in motion</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="segmented">
              <button
                type="button"
                className={!spectrum ? "selected" : ""}
                onClick={() => setSpectrum(false)}
              >
                Waveform
              </button>
              <button
                type="button"
                className={spectrum ? "selected" : ""}
                onClick={() => setSpectrum(true)}
              >
                Spectrogram
              </button>
            </div>
            <button
              type="button"
              className="outline-button h-8 px-2.5 text-[10px]"
              onClick={onOpenVisual}
              title="Open full-track FFT spectrogram & vectorscope lab"
            >
              Full FFT lab <Icon n="right" s={13} />
            </button>
          </div>
        </div>

        <div className="wave-wrap">
          <SoundInMotionCanvas spectrum={spectrum} />
        </div>
        <div className="wave-times tabular-nums">
          <span>{fmt(position)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </section>

      {/* Up Next Queue Section */}
      <section className="queue-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">KEEP LISTENING</span>
            <h2>Up next</h2>
          </div>
          <div className="flex items-center gap-4">
            {tracks.length <= 1 && (
              <button type="button" className="text-action" onClick={loadDemo}>
                + Add 3 Vocaloid synth demos
              </button>
            )}
            <button type="button" className="text-action" onClick={() => onNavigate("library")}>
              View library <Icon n="right" s={16} />
            </button>
          </div>
        </div>

        <div className="queue-list">
          {queue.slice(0, 12).map((ti, qIndex) => {
            const t = tracks[ti];
            if (!t) return null;
            const isCurrent = qpos === qIndex;
            const tLiked = s.likedIds.includes(t.id);
            return (
              <div
                key={t.id}
                className={`queue-row ${isCurrent ? "current" : ""}`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                  onClick={() => engine.playAt(qIndex)}
                >
                  <span className="queue-number tabular-nums">
                    {isCurrent && playing ? (
                      <Icon n="audio-lines" s={17} />
                    ) : (
                      String(qIndex + 1).padStart(2, "0")
                    )}
                  </span>
                  <Cover src={t.cover} size={42} alt={t.title} />
                  <span className="queue-name">
                    <b>{t.title}</b>
                    <small>
                      {t.artist}
                      {t.subtitleTag ? ` · ${t.subtitleTag}` : t.album ? ` · ${t.album}` : ""}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`row-heart px-2 ${tLiked ? "liked" : ""}`}
                  aria-label={`Like ${t.title}`}
                  onClick={() => toggleLikeTrack(t.id)}
                >
                  <Icon n="heart" s={15} fill={tLiked} />
                </button>
                <span className="queue-duration tabular-nums">{t.duration ? fmt(t.duration) : "--:--"}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Optional Studio Widgets from MX Player (collapsible) */}
      <section className="mt-9 border-t border-line pt-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">MODULAR DECK</span>
            <h2>Studio widgets</h2>
          </div>
          <button
            type="button"
            className="text-action"
            onClick={() => settings.set({ showRoomWidgets: !s.showRoomWidgets })}
          >
            {s.showRoomWidgets ? "Hide widgets" : "Show studio widgets"} <Icon n={s.showRoomWidgets ? "up" : "down"} s={15} />
          </button>
        </div>

        {s.showRoomWidgets && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Card title="Quick Sound & Limiter">
              <Slider
                label="Safe Boost"
                min={0}
                max={15}
                step={0.5}
                value={s.boostDb}
                onChange={(v) => settings.set({ boostDb: v })}
                fmt={(v) => `+${v} dB`}
              />
              <Slider
                label="Bass Shelf"
                min={-12}
                max={15}
                step={0.5}
                value={s.bassDb}
                onChange={(v) => settings.set({ bassDb: v })}
                className="mt-3"
              />
              <LimiterMeter />
            </Card>

            <Card
              title="Live Spectrum"
              right={
                <button type="button" onClick={onOpenVisual} className="text-xs font-bold text-accent">
                  Full lab →
                </button>
              }
            >
              <LiveCanvas draw={spec40} className="h-24 w-full" />
            </Card>

            <Card title="A-B Loop, Speed & Sleep">
              <div className="flex flex-wrap gap-2">
                <ABLoop />
                <SpeedChip />
                <SleepChip />
                {[15, 30, 60].map((m) => (
                  <Chip
                    key={m}
                    onClick={() => player.set({ sleepAt: Date.now() + m * 60000, sleepEndOfTrack: false })}
                  >
                    {m}m
                  </Chip>
                ))}
              </div>
            </Card>

            <Card
              title="Lyrics Strip"
              right={
                <button type="button" onClick={() => onNavigate("lyrics")} className="text-xs font-bold text-accent">
                  Studio →
                </button>
              }
            >
              <LyricsView lyr={lyr} lines={3} />
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
