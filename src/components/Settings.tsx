import { useState } from "react";
import { useStore, settings, player, toast, type ThemeName } from "../lib/store";
import { devices, requestDeviceNames } from "../lib/devices";
import { Icon } from "./ui";
import { Calibrate } from "./SharedAudioViews";

export const THEMES: {
  id: ThemeName;
  name: string;
  badge: string;
  desc: string;
}[] = [
  { id: "dark", name: "Nocturne", badge: "DARK", desc: "Warm obsidian & lime-chartreuse" },
  { id: "light", name: "Daylight", badge: "LIGHT", desc: "Soft paper & botanical olive" },
  { id: "system", name: "System", badge: "AUTO", desc: "Follows device appearance" },
  { id: "miku", name: "Miku", badge: "CV01 · 39", desc: "Teal #39C5BB & ribbon pink cyber-grid" },
  { id: "teto", name: "Teto", badge: "UTAU · 0401", desc: "Crimson drills & warm baguette gold" },
  { id: "neru", name: "Neru", badge: "DEN · 02", desc: "Canary yellow & flip-phone dot matrix" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useStore(settings, (x) => x);
  const sleepUntil = useStore(player, (p) => p.sleepAt);
  const sleepEot = useStore(player, (p) => p.sleepEndOfTrack);
  const named = useStore(devices, (d) => d.named);

  const [calib, setCalib] = useState(false);
  const set = settings.set;

  const sleepMinutes = sleepEot
    ? -1
    : sleepUntil
      ? Math.max(1, Math.ceil((sleepUntil - Date.now()) / 60000))
      : 0;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Preferences">
        <div className="modal-head">
          <div>
            <span className="eyebrow">MAKE IT YOURS</span>
            <h2>Preferences</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <Icon n="x" s={21} />
          </button>
        </div>

        <div className="modal-scroll">
          {/* Appearance & Special Vocaloid Themes */}
          <div className="settings-group">
            <h3>Appearance &amp; Character Editions</h3>
            <div className="theme-grid">
              {THEMES.map((t) => {
                const chosen = s.theme === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={`theme-choice ${chosen ? "chosen" : ""}`}
                    onClick={() => {
                      set({
                        theme: t.id,
                        colormap:
                          t.id === "miku" || t.id === "teto" || t.id === "neru"
                            ? t.id
                            : s.colormap,
                      });
                    }}
                    title={t.desc}
                  >
                    <span className={`theme-swatch ${t.id}`} />
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate leading-tight">{t.name}</span>
                      <span className="truncate font-mono text-[9px] font-normal opacity-70">{t.badge}</span>
                    </span>
                    {chosen && <Icon n="check" s={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Playback & Transitions */}
          <div className="settings-group">
            <h3>Playback &amp; Transitions</h3>

            <div className="setting-line">
              <div>
                <b>Gapless playback</b>
                <span>Pre-buffers next track on a second deck for zero-gap transitions</span>
              </div>
              <button
                type="button"
                className={`switch ${s.gapless ? "on" : ""}`}
                onClick={() => set({ gapless: !s.gapless })}
                aria-label="Gapless playback"
                aria-pressed={s.gapless}
              >
                <span />
              </button>
            </div>

            <div className="setting-line">
              <div>
                <b>Crossfade tracks</b>
                <span>Smoothly overlap ending and starting tracks</span>
              </div>
              <select
                value={s.crossfade}
                aria-label="Crossfade tracks"
                onChange={(e) => set({ crossfade: Number(e.target.value) })}
              >
                <option value={0}>Off</option>
                <option value={2}>2 sec</option>
                <option value={4}>4 sec</option>
                <option value={6}>6 sec</option>
                <option value={8}>8 sec</option>
                <option value={12}>12 sec</option>
              </select>
            </div>

            <div className="setting-line">
              <div>
                <b>Playback speed</b>
                <span>Adjust how fast the track plays</span>
              </div>
              <select
                value={s.speed}
                aria-label="Playback speed"
                onChange={(e) => set({ speed: Number(e.target.value) })}
              >
                {[0.5, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 2].map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </div>

            <div className="setting-line">
              <div>
                <b>Preserve pitch</b>
                <span>Keep the musical key unchanged when changing speed</span>
              </div>
              <button
                type="button"
                className={`switch ${s.keepPitch ? "on" : ""}`}
                onClick={() => set({ keepPitch: !s.keepPitch })}
                aria-label="Preserve pitch"
                aria-pressed={s.keepPitch}
              >
                <span />
              </button>
            </div>

            <div className="setting-line">
              <div>
                <b>Sleep timer</b>
                <span>
                  {sleepEot
                    ? "Stops at the end of current track"
                    : sleepUntil
                      ? `Stops in about ${sleepMinutes} min (with 20s fade-out)`
                      : "Stop playing after a while"}
                </span>
              </div>
              <select
                value={sleepEot ? -1 : [0, 15, 30, 45, 60].includes(sleepMinutes) ? sleepMinutes : 15}
                aria-label="Sleep timer"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n === -1) player.set({ sleepEndOfTrack: true, sleepAt: null });
                  else player.set({ sleepEndOfTrack: false, sleepAt: n > 0 ? Date.now() + n * 60000 : null });
                }}
              >
                <option value={0}>Off</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={-1}>End of track</option>
              </select>
            </div>
          </div>

          {/* Lyrics & Devices */}
          <div className="settings-group">
            <h3>Lyrics &amp; Devices</h3>

            <div className="setting-line">
              <div>
                <b>Tap reaction offset</b>
                <span>Subtract your response delay from every tap-sync stamp</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="Decrease tap offset"
                    onClick={() => set({ tapLatency: Math.max(0, s.tapLatency - 25) })}
                  >
                    <Icon n="minus" s={14} />
                  </button>
                  <span className="tabular-nums">{s.tapLatency} ms</span>
                  <button
                    type="button"
                    aria-label="Increase tap offset"
                    onClick={() => set({ tapLatency: Math.min(600, s.tapLatency + 25) })}
                  >
                    <Icon n="plus" s={14} />
                  </button>
                </div>
                <button type="button" className="outline-button h-7 px-2 text-[10px]" onClick={() => setCalib(true)}>
                  Calibrate
                </button>
              </div>
            </div>

            <div className="setting-line">
              <div>
                <b>Pause when headphones unplug</b>
                <span>Immediately pause playback if an audio output disconnects</span>
              </div>
              <button
                type="button"
                className={`switch ${s.pauseOnDisconnect ? "on" : ""}`}
                onClick={() => set({ pauseOnDisconnect: !s.pauseOnDisconnect })}
                aria-label="Pause when headphones unplug"
                aria-pressed={s.pauseOnDisconnect}
              >
                <span />
              </button>
            </div>

            <div className="setting-line">
              <div>
                <b>Resume on output reconnect</b>
                <span>Automatically resume when your headset reconnects</span>
              </div>
              <button
                type="button"
                className={`switch ${s.autoResume ? "on" : ""}`}
                onClick={() => set({ autoResume: !s.autoResume })}
                aria-label="Resume on output reconnect"
                aria-pressed={s.autoResume}
              >
                <span />
              </button>
            </div>

            {!named && (
              <div className="setting-line">
                <div>
                  <b>Headset device names</b>
                  <span>Unlock Bluetooth / USB headset names for automatic EQ profile switching</span>
                </div>
                <button type="button" className="outline-button h-8 px-3 text-xs" onClick={requestDeviceNames}>
                  Unlock names
                </button>
              </div>
            )}
          </div>

          {/* Mobile & GitHub APK Packaging */}
          <div className="settings-group">
            <h3>Android APK &amp; Flat GitHub Package</h3>
            <div className="setting-line">
              <div>
                <b>Flat GitHub Zip (Mobile-Ready)</b>
                <span>
                  All source files flattened into root with rewritten relative imports — extract &amp; upload directly
                  from mobile GitHub without creating subfolders.
                </span>
              </div>
              <a
                href="./sonora-github-flat.zip"
                download="sonora-github-flat.zip"
                className="accent-button h-8 px-3 text-xs"
                onClick={() => toast("Downloading flat GitHub zip…")}
              >
                <Icon n="download" s={14} /> Flat Zip
              </a>
            </div>
            <div className="setting-line">
              <div>
                <b>Android GitHub Workflow (.yml)</b>
                <span>
                  Separate <code>android.yml</code> file for <code>.github/workflows/android.yml</code> (SDK 35, Node
                  22, Capacitor 7).
                </span>
              </div>
              <a
                href="./android.yml"
                download="android.yml"
                className="outline-button h-8 px-3 text-xs"
                onClick={() => toast("Downloading android.yml workflow…")}
              >
                <Icon n="download" s={14} /> android.yml
              </a>
            </div>
          </div>

          <p className="modal-note">
            Settings, lyric edits, liked songs, and ReplayGain loudness analyses persist offline on your device. Push to
            GitHub with <code>.github/workflows/android.yml</code> to compile an installable Android SDK 35 APK.
          </p>
        </div>
      </div>
      {calib && <Calibrate onClose={() => setCalib(false)} />}
    </div>
  );
}
