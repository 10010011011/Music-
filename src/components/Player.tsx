import { useMemo, useRef, useState, useEffect, type CSSProperties } from "react";
import { useStore, player, library, clock, settings, fmt, toggleLikeTrack, toast } from "../lib/store";
import { engine } from "../lib/engine";
import { setShuffle } from "../lib/library";
import { Icon, Cover, Chip } from "./ui";

export function useCurrent() {
  const id = useStore(player, (s) => s.trackId);
  const tracks = useStore(library, (s) => s.tracks);
  const qpos = useStore(library, (s) => s.qpos);
  const queue = useStore(library, (s) => s.queue);
  return useMemo(() => {
    if (id) {
      const hit = tracks.find((t) => t.id === id);
      if (hit) return hit;
    }
    return tracks[queue[qpos]] ?? tracks[0];
  }, [id, tracks, qpos, queue]);
}

export function SeekBar({ compact = false }: { compact?: boolean }) {
  const t = useStore(clock, (s) => s.t);
  const dur = useStore(player, (s) => s.duration);
  const a = useStore(player, (s) => s.abA);
  const b = useStore(player, (s) => s.abB);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const ratio = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const cur = drag != null ? drag * dur : t;
  const p = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className={compact ? "" : "select-none"}>
      <div
        ref={ref}
        className={`group relative cursor-pointer touch-none ${compact ? "h-1" : "h-5"} flex items-center`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDrag(ratio(e));
        }}
        onPointerMove={(e) => drag != null && setDrag(ratio(e))}
        onPointerUp={(e) => {
          if (drag != null) engine.seek(ratio(e) * dur);
          setDrag(null);
        }}
      >
        <div className={`relative w-full overflow-hidden rounded-full bg-line ${compact ? "h-1" : "h-1.5"}`}>
          {a != null && dur > 0 && (
            <div
              className="absolute inset-y-0 bg-accent2/45"
              style={{ left: `${(a / dur) * 100}%`, width: `${Math.max(1, (((b ?? cur) - a) / dur) * 100)}%` }}
            />
          )}
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${p}%` }} />
        </div>
        {!compact && (
          <div
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-accent shadow ring-2 ring-bg transition-transform group-hover:scale-110"
            style={{ left: `${p}%` }}
          />
        )}
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted">
          <span>{fmt(cur)}</span>
          <span>{fmt(dur)}</span>
        </div>
      )}
    </div>
  );
}

export function Transport({ size = 1 }: { size?: number }) {
  const playing = useStore(player, (s) => s.playing);
  const shuffle = useStore(settings, (s) => s.shuffle);
  const repeat = useStore(settings, (s) => s.repeat);
  const cycleRepeat = () => {
    const r = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    settings.set({ repeat: r });
    engine.setLoopFlag();
  };
  return (
    <div className="transport">
      <button
        type="button"
        className={shuffle ? "control-active" : ""}
        title="Shuffle"
        aria-label="Shuffle"
        onClick={() => setShuffle(!shuffle)}
      >
        <Icon n="shuffle" s={18 * size} />
      </button>
      <button type="button" title="Previous" aria-label="Previous" onClick={() => engine.prev()}>
        <Icon n="prev" s={21 * size} fill />
      </button>
      <button
        type="button"
        className="transport-play"
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => engine.toggle()}
      >
        <Icon n={playing ? "pause" : "play"} s={19 * size} fill />
      </button>
      <button type="button" title="Next" aria-label="Next" onClick={() => engine.next()}>
        <Icon n="next" s={21 * size} fill />
      </button>
      <button
        type="button"
        className={`relative ${repeat !== "off" ? "control-active" : ""}`}
        title={`Repeat: ${repeat}`}
        aria-label={`Repeat: ${repeat}`}
        onClick={cycleRepeat}
      >
        <Icon n="repeat" s={18 * size} />
        {repeat === "one" && <span className=" -top-1 -right-1.5 absolute font-mono text-[8px] font-black">1</span>}
      </button>
    </div>
  );
}

export function ABLoop() {
  const a = useStore(player, (s) => s.abA);
  const b = useStore(player, (s) => s.abB);
  const press = () => {
    const t = engine.time;
    if (a == null) {
      player.set({ abA: t });
      toast(`Loop A set at ${fmt(t)}`);
    } else if (b == null) {
      if (t <= a) toast("Set B after point A");
      else {
        player.set({ abB: t });
        toast(`A-B loop active (${fmt(a)} → ${fmt(t)})`);
      }
    } else {
      player.set({ abA: null, abB: null });
      toast("A-B loop cleared");
    }
  };
  return (
    <Chip active={a != null} onClick={press} title="A-B loop: tap to set A, again for B, again to clear">
      {a == null ? "A-B Loop" : b == null ? `A ${fmt(a)} → B?` : `${fmt(a)}–${fmt(b)} ×`}
    </Chip>
  );
}

export function SleepChip() {
  const at = useStore(player, (s) => s.sleepAt);
  const eot = useStore(player, (s) => s.sleepEndOfTrack);
  const [, force] = useState(0);
  useEffect(() => {
    if (!at) return;
    const i = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [at]);
  const opts = [0, 15, 30, 60, -1];
  const cur = eot ? -1 : at ? 1 : 0;
  const cycle = () => {
    const idx = eot ? 4 : at ? opts.findIndex((m) => m > 0 && (at - Date.now()) / 60000 <= m) : 0;
    const nx = opts[(idx + 1) % opts.length];
    player.set({ sleepAt: nx > 0 ? Date.now() + nx * 60000 : null, sleepEndOfTrack: nx === -1 });
  };
  return (
    <Chip active={cur !== 0} onClick={cycle} title="Sleep timer (tap to cycle)">
      <span className="inline-flex items-center gap-1">
        <Icon n="timer" s={13} />
        {eot ? "End of track" : at ? fmt((at - Date.now()) / 1000) : "Sleep"}
      </span>
    </Chip>
  );
}

export function SpeedChip() {
  const speed = useStore(settings, (s) => s.speed);
  const steps = [0.5, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 2];
  return (
    <Chip
      active={speed !== 1}
      onClick={() => settings.set({ speed: steps[(steps.indexOf(speed) + 1) % steps.length] ?? 1 })}
      title="Playback speed (tap to cycle)"
    >
      {speed.toFixed(2)}×
    </Chip>
  );
}

export function PlayerBar({
  onOpenSettings,
  onNavigate,
}: {
  onOpenSettings: () => void;
  onNavigate: (v: "room" | "library" | "lyrics" | "sound") => void;
}) {
  const track = useCurrent();
  const position = useStore(clock, (s) => s.t);
  const duration = useStore(player, (s) => s.duration) || track?.duration || 20;
  const loopA = useStore(player, (s) => s.abA);
  const loopB = useStore(player, (s) => s.abB);
  const sleepUntil = useStore(player, (s) => s.sleepAt);
  const sleepEot = useStore(player, (s) => s.sleepEndOfTrack);
  const volume = useStore(settings, (s) => s.volume);
  const muted = useStore(settings, (s) => s.muted);
  const likedIds = useStore(settings, (s) => s.likedIds);

  const isLiked = track ? likedIds.includes(track.id) : false;
  const volPct = Math.round(volume * 100);
  const progressPct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <footer className="player-bar">
      <div className="player-song">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onNavigate("room")}
          title="Open Listening Room"
        >
          <Cover src={track?.cover} size={49} className="player-cover" alt={track?.title || "Cover"} />
          <div className="player-song-text">
            <b>{track?.title || "No track selected"}</b>
            <small>{track?.artist || "Select a file or demo"}</small>
          </div>
        </button>
        {track && (
          <button
            type="button"
            className={`player-heart ${isLiked ? "liked" : ""}`}
            onClick={() => toggleLikeTrack(track.id)}
            aria-label="Like current song"
            title={isLiked ? "Remove from Liked songs" : "Save to Liked songs"}
          >
            <Icon n="heart" s={18} fill={isLiked} />
          </button>
        )}
      </div>

      <div className="player-center">
        <Transport />
        <div className="progress-row">
          <span className="tabular-nums">{fmt(position)}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(position, duration || 1)}
            onChange={(e) => engine.seek(Number(e.target.value))}
            aria-label="Track progress"
            style={{ "--fill": `${progressPct}%` } as CSSProperties}
          />
          <span className="tabular-nums">{fmt(duration)}</span>
        </div>
      </div>

      <div className="player-tools">
        <button
          type="button"
          className={loopA !== null ? "control-active" : ""}
          title={loopA === null ? "Set A point" : loopB === null ? "Set B point" : "Clear A-B loop"}
          aria-label="A-B Loop"
          onClick={() => {
            if (loopA === null) {
              player.set({ abA: position });
              toast(`Loop A set at ${fmt(position)}`);
            } else if (loopB === null) {
              if (position <= loopA) toast("Set B after point A");
              else {
                player.set({ abB: position });
                toast("A-B loop is active");
              }
            } else {
              player.set({ abA: null, abB: null });
              toast("A-B loop cleared");
            }
          }}
        >
          <span className="ab-label">{loopA === null ? "A-B" : loopB === null ? "A→?" : "A•B"}</span>
        </button>
        <button
          type="button"
          className={sleepUntil || sleepEot ? "control-active" : ""}
          title="Sleep timer & Preferences"
          aria-label="Sleep timer"
          onClick={onOpenSettings}
        >
          <Icon n="timer" s={18} />
        </button>
        <button
          type="button"
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => settings.set({ muted: !muted })}
        >
          <Icon n={muted ? "volume-x" : "volume"} s={19} />
        </button>
        <input
          className="volume-slider"
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volPct}
          onChange={(e) => settings.set({ volume: Number(e.target.value) / 100, muted: false })}
          aria-label="Volume"
          style={{ "--fill": `${muted ? 0 : volPct}%` } as CSSProperties}
        />
        <button type="button" title="Sound lab" aria-label="Open Sound lab" onClick={() => onNavigate("sound")}>
          <Icon n="sliders" s={19} />
        </button>
      </div>
    </footer>
  );
}
