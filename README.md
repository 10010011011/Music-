# Sonora — Local Music Player, Lyrics Studio & DSP

**Sonora** merges **Sonora's** editorial visual design, 3-column desktop shell, 4-tab mobile navigation, and 3-tab Lyrics Studio with **MX Player's** modular Web Audio DSP engine, 20 Hz / 10 Hz adaptive external clock store, background Web Worker loudness & STFT spectrogram analyzer, ID3v2/FLAC header tag reader, and Capacitor Android CI pipeline.

## Highlights of the Merged Build

| Area | Merged Implementation |
|---|---|
| **Architecture & State** | Audio engine (`src/lib/engine.ts`) decoupled from React via `useSyncExternalStore` (`src/lib/store.ts`). Clock updates run in their own store (20 Hz when lyrics are visible, throttled to 10 Hz when the lyrics panel is hidden) so only the seekbar and active lyric line re-render. |
| **Typography & Offline Assets** | Self-hosted `DM Sans` and `Manrope` variable latin `.woff2` fonts (`public/fonts/`), zero Google Fonts network dependency, and `afterglow-cover.webp` compressed to 25 KB. |
| **Playback & Transitions** | Dual-deck gapless playback, 0–12 s crossfade, shuffle, repeat (`off` / `all` / `one`), A-B loop, playback speed `0.5×–2.0×` with pitch lock or vinyl/Nightcore/Slowed modes, and sleep timer (minutes or end-of-track with 20 s smooth fade-out). |
| **DSP & Sound Lab** | Sonora's simple 3-band Sound Lab (`Bass` shelf, `Mids` mapped across 500 Hz–2 kHz, `Treble` shelf, presets, `Safe sound boost` + brick-wall limiter with live GR meter, and `Smart normalization` via EBU R128 / ReplayGain) plus an expandable **Advanced DSP & 10-Band EQ** drawer with live frequency response curve, stereo width, vocal focus, karaoke, crossfeed, room ambience, and lazy-initialized **8D HRTF orbit**. |
| **Worker Analysis & Spectrogram** | Off-main-thread mono mixdown, waveform peak extraction, BS.1770 LUFS loudness caching, and full-track STFT spectrogram (`1024–4096` FFT, Linear/Log Hz, adjustable floor). Includes synthesized `"Afterglow"` + Vocaloid demo tracks (`"Teal Signal"`, `"Baguette Drill"`, `"Yellow Flip-Phone"`) with hidden spectrogram art. |
| **Library & Metadata** | Virtualized track list (`66 px` rows) with Sonora styling, real cover art extracted from ID3v2 & FLAC headers, automatic `.lrc / .srt / .vtt` sidecar pairing, and persisted **Liked songs** filter. |
| **Lyrics Studio** | Sonora's 3-tab studio (`Text editor`, `Tap to sync`, `Preview`) wired to `lyrics.ts` and IndexedDB (`db.ts`), with per-line editable timestamps, live preview offset + `Bake`, timestamp shift (`±1.7 s` all lines or from current line), and 16-click audio **tap-latency calibration**. |
| **Vocaloid Character Themes** | Alongside **Nocturne** (dark), **Daylight** (light), and **System**, includes three special character editions: **Miku (`CV01 // 39`)**, **Teto (`UTAU // 0401`)**, and **Neru (`DEN // 02`)** featuring custom coordinate-grid / diagonal-drill / dot-matrix surface patterns, serial badges, dual-tone harmonic sliders, and custom spectrogram colormaps. |

## Building the Android APK on GitHub (Mobile Flat Zip Workflow)

1. Download **`sonora-github-flat.zip`** (available in the workspace root or via the **Flat GitHub zip** button inside the app's sidebar / Preferences modal).
2. Extract `sonora-github-flat.zip` on your phone and upload all extracted files directly to the root of your GitHub repository. Because all imports inside `sonora-github-flat.zip` are pre-flattened to `./`, **no subfolders are required**.
3. Create `.github/workflows/android.yml` in your repository using the contents of `android.yml` (also downloadable from Preferences).
4. Run **Actions → Build Android APK** on GitHub and download the **`sonora-debug-apk`** artifact (`Sonora-main-debug.apk`).
