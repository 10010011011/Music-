import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useStore, settings, player, toast, library, lyricsStore, type ThemeName } from "../lib/store";
import { devices, requestDeviceNames } from "../lib/devices";
import { Icon } from "./ui";
import { Calibrate } from "./SharedAudioViews";
import { choosePersistentLibraryFolder, getPersistentStorageStatus, persistNativeAppState, persistNativeTracks, restoreNativeAppState, restoreNativeTracks, type StorageStatus } from "../lib/nativeLibrary";

export const THEMES: {
  id: ThemeName;
  name: string;
  badge: string;
  desc: string;
}[] = [
  { id: "dark", name: "Nocturne", badge: "DARK", desc: "Warm obsidian & lime-chartreuse" },
  { id: "light", name: "Daylight", badge: "LIGHT", desc: "Soft paper & botanical olive" },
  { id: "system", name: "System", badge: "AUTO", desc: "Follows device appearance" },
  { id: "miku", name: "Miku", badge: "RIBBON", desc: "Soft waveform grid with ribbon-like accents" },
  { id: "teto", name: "Teto", badge: "SPIRAL", desc: "Twin spiral details in rose and warm gold" },
  { id: "neru", name: "Neru", badge: "LCD", desc: "Compact LCD-style dots and amber highlights" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useStore(settings, (x) => x);
  const sleepUntil = useStore(player, (p) => p.sleepAt);
  const sleepEot = useStore(player, (p) => p.sleepEndOfTrack);
  const named = useStore(devices, (d) => d.named);

  const [calib, setCalib] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ configured: false, folderName: "" });
  const [choosingStorage, setChoosingStorage] = useState(false);
  const set = settings.set;

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      getPersistentStorageStatus().then(setStorageStatus);
    }
  }, []);

  const chooseStorage = async () => {
    setChoosingStorage(true);
    try {
      const status = await choosePersistentLibraryFolder();
      setStorageStatus(status);
      try {
        const [folderTracks, folderState] = await Promise.all([
          restoreNativeTracks(),
          restoreNativeAppState(),
        ]);

        if (folderState?.settings && !localStorage.getItem("sonora.settings.v1")) {
          settings.set(folderState.settings);
        }
        if (folderState?.lyrics) {
          lyricsStore.set({ map: { ...folderState.lyrics, ...lyricsStore.get().map } });
        }

        const state = library.get();
        const merged = new Map(folderTracks.map((track) => [track.id, track]));
        for (const track of state.tracks) merged.set(track.id, track);
        const tracks = Array.from(merged.values());
        const indexById = new Map(tracks.map((track, index) => [track.id, index]));
        const savedQueueIds = [
          ...(folderState?.queueIds || []),
          ...state.queue.map((index) => state.tracks[index]?.id).filter((id): id is string => Boolean(id)),
        ];
        const queueIds = [...new Set(savedQueueIds)];
        const queueOrder = queueIds
          .map((id) => indexById.get(id))
          .filter((index): index is number => index !== undefined);
        const used = new Set(queueOrder);
        const queue = [...queueOrder, ...tracks.map((_, index) => index).filter((index) => !used.has(index))];
        const currentTrackId =
          state.tracks[state.queue[state.qpos]]?.id || folderState?.currentTrackId || null;
        const currentIndex = currentTrackId ? indexById.get(currentTrackId) : undefined;
        const qpos = currentIndex === undefined ? 0 : Math.max(0, queue.indexOf(currentIndex));

        library.set({ tracks, queue, qpos, folderName: "Sonora Library" });
        await persistNativeTracks(tracks);
        await persistNativeAppState(settings.get(), lyricsStore.get().map, { queueIds, currentTrackId });
        toast("Sonora Library folder is ready");
      } catch (error) {
        console.error("Sonora folder connected but current library migration failed", error);
        toast("Folder connected, but some music could not be copied. Check free space.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("cancel")) {
        toast("Could not grant folder access");
        console.error("Sonora folder selection failed", error);
      }
    } finally {
      setChoosingStorage(false);
    }
  };

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
          {Capacitor.isNativePlatform() && (
            <div className="settings-group">
              <h3>Music storage</h3>
              <div className="setting-line">
                <div>
                  <b>{storageStatus.configured ? "Folder connected" : "Choose a library folder"}</b>
                  <span>
                    {storageStatus.configured
                      ? "Music, artwork, lyrics and settings are saved in " + storageStatus.folderName + "."
                      : "Grant Sonora access once so your music and library data remain available after closing the app."}
                  </span>
                </div>
                <button
                  type="button"
                  className="outline-button h-8 px-3 text-xs"
                  onClick={chooseStorage}
                  disabled={choosingStorage}
                >
                  {choosingStorage ? "Opening…" : storageStatus.configured ? "Change folder" : "Grant access"}
                </button>
              </div>
              <p className="modal-note">
                Select a parent folder such as Music. Sonora creates its own “Sonora Library” folder inside it.
              </p>
            </div>
          )}
          {/* Appearance & Special Vocaloid Themes */}
          <div className="settings-group">
            <h3>Appearance</h3>
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

          <p className="modal-note">
            Your settings, liked songs, and imported music are saved on this device.
          </p>
        </div>
      </div>
      {calib && <Calibrate onClose={() => setCalib(false)} />}
    </div>
  );
}
