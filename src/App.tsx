import { useEffect, useRef, useState, lazy, Suspense, type ChangeEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { useStore, settings, player, library, toast } from "./lib/store";
import { engine } from "./lib/engine";
import { initDevices } from "./lib/devices";
import { ingest, openFolderHandle } from "./lib/library";
import { restoreNativeTracks } from "./lib/nativeLibrary";
import { PlayerBar } from "./components/Player";
import { RightLyricsPanel } from "./components/SharedAudioViews";
import { Icon } from "./components/ui";
import Home from "./components/Home";
import Library from "./components/Library";
import Sound from "./components/Sound";
import SettingsModal from "./components/Settings";

const LyricsPage = lazy(() => import("./components/Lyrics"));
const VisualPage = lazy(() => import("./components/Visual"));

export type View = "room" | "library" | "lyrics" | "sound" | "visual";

function useTheme() {
  const theme = useStore(settings, (s) => s.theme);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const t = theme === "system" ? (mq.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = t;
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
      }
      meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#111415";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  const [view, setView] = useState<View>("room");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tracks = useStore(library, (s) => s.tracks);
  const loading = useStore(library, (s) => s.loading);
  const likedIds = useStore(settings, (s) => s.likedIds);
  const toastMsg = useStore(player, (s) => s.toast);

  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restore = async () => {
      const saved = await restoreNativeTracks();
      if (saved.length) {
        const queue = saved.map((_, i) => i);
        library.set({ tracks: saved, queue, qpos: 0, folderName: "On this device" });
        if (!engine.el.src) engine.primeAt(0);
      }
    };
    void restore();
    initDevices();

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        engine.toggle();
      } else if (e.code === "ArrowRight" && e.shiftKey) engine.next();
      else if (e.code === "ArrowLeft" && e.shiftKey) engine.prev();
      else if (e.code === "ArrowRight") engine.seek(engine.time + 5);
      else if (e.code === "ArrowLeft") engine.seek(engine.time - 5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track whether lyrics UI is visible so engine can throttle seekbar/lyrics clock to 10Hz when hidden
  useEffect(() => {
    const checkVisibility = () => {
      const panelShown = window.innerWidth > 1020 || view === "lyrics";
      if (player.get().lyricsVisible !== panelShown) {
        player.set({ lyricsVisible: panelShown });
      }
    };
    checkVisibility();
    window.addEventListener("resize", checkVisibility);
    return () => window.removeEventListener("resize", checkVisibility);
  }, [view]);

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl || !fl.length) return;
    const arr = Array.from(fl).map((f) => ({
      file: f,
      path: (f as any).webkitRelativePath || f.name,
    }));
    const root = arr[0].path.includes("/") ? arr[0].path.split("/")[0] : "Local files";
    ingest(arr, root, false);
    e.target.value = "";
  };

  const triggerOpenFolder = () => {
    // Android WebView does not implement the browser directory picker and its
    // webkitdirectory fallback is not supported by Android document providers.
    // Use the native file chooser instead; users can multi-select audio files.
    if (Capacitor.isNativePlatform()) {
      filesRef.current?.click();
      return;
    }
    if (window.showDirectoryPicker) openFolderHandle();
    else folderRef.current?.click();
  };

  const navigate = (next: View) => {
    setView(next);
  };

  const viewTitle =
    view === "room"
      ? "Listening room"
      : view === "library"
        ? "Your library"
        : view === "lyrics"
          ? "Lyrics studio"
          : view === "visual"
            ? "Visual analyzer"
            : "Sound lab";

  return (
    <div className="app-shell">
      <input
        ref={filesRef}
        type="file"
        multiple
        accept="audio/*,.lrc,.srt,.vtt,.flac,.opus,.m4a,.aiff"
        hidden
        onChange={handleFilesSelected}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        hidden
        onChange={handleFilesSelected}
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      {/* Left Sidebar (Desktop) / 4-Tab Bottom Bar (Mobile) */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon n="audio-lines" s={23} strokeWidth={2.7} />
          </div>
          <span>
            sonora<span className="brand-dot">.</span>
          </span>
        </div>

        <div className="side-scroll">
          <div className="side-title">YOUR SPACE</div>
          <nav className="side-nav" aria-label="Primary">
            <button
              type="button"
              className={view === "room" ? "active" : ""}
              onClick={() => navigate("room")}
            >
              <Icon n="music" s={19} /> Listening room
            </button>
            <button
              type="button"
              className={view === "library" ? "active" : ""}
              onClick={() => navigate("library")}
            >
              <Icon n="list-music" s={19} /> Your library
            </button>
            <button
              type="button"
              className={view === "lyrics" ? "active" : ""}
              onClick={() => navigate("lyrics")}
            >
              <Icon n="mic" s={19} /> Lyrics studio
            </button>
            <button
              type="button"
              className={view === "sound" || view === "visual" ? "active" : ""}
              onClick={() => navigate("sound")}
            >
              <Icon n="sliders" s={19} /> Sound lab
            </button>
          </nav>

          <div className="side-divider" />

          <div className="side-heading">
            <span>YOUR LIBRARY</span>
            <button
              type="button"
              onClick={() => filesRef.current?.click()}
              title="Add files"
              aria-label="Add audio files"
            >
              <Icon n="plus" s={17} />
            </button>
          </div>

          <button
            type="button"
            className="side-library"
            onClick={() => {
              library.set({ filter: "all" });
              navigate("library");
            }}
          >
            <span className="side-mini">
              <Icon n="music" s={17} />
            </span>
            <span>
              <b>All songs</b>
              <small>
                {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
              </small>
            </span>
          </button>

          <button
            type="button"
            className="side-library"
            onClick={() => {
              library.set({ filter: "liked" });
              navigate("library");
            }}
          >
            <span className="side-mini pink">
              <Icon n="heart" s={17} />
            </span>
            <span>
              <b>Liked songs</b>
              <small>{likedIds.length} saved</small>
            </span>
          </button>

          <div className="side-divider" />

          <div className="side-title">QUICK ACCESS</div>
          <button type="button" className="quick-link" onClick={triggerOpenFolder}>
            <Icon n="folder-open" s={17} /> Open a folder
          </button>
          <button type="button" className="quick-link" onClick={() => filesRef.current?.click()}>
            <Icon n="upload" s={17} /> Add audio files
          </button>
          <a
            href="./sonora-github-flat.zip"
            download="sonora-github-flat.zip"
            className="quick-link"
            onClick={() => toast("Downloading flat GitHub zip for mobile…")}
          >
            <Icon n="package" s={17} /> Flat GitHub zip
          </a>
        </div>

        <div className="sidebar-bottom">
          <div className="side-note">
            <Icon n="sparkles" s={17} />
            <span>
              <b>Made for your music</b>
              <small>Gapless DSP · ReplayGain · Offline first.</small>
            </span>
          </div>
          <button type="button" className="settings-link" onClick={() => setSettingsOpen(true)}>
            <Icon n="gear" s={18} /> Settings <Icon n="right" s={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            YOUR SPACE <Icon n="right" s={13} /> <strong>{viewTitle}</strong>
            {loading && <span className="ml-2 text-accent">· Scanning…</span>}
          </div>

          <div className="top-actions">
            <span className="local-badge">LOCAL FIRST</span>
            <button
              type="button"
              className="top-icon"
              title="Preferences & Themes"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon n="gear" s={19} />
            </button>
            <button type="button" className="import-button" onClick={triggerOpenFolder}>
              <Icon n="plus" s={18} /> Import music
            </button>
          </div>
        </header>

        <Suspense fallback={<div className="main-content inner-content text-sm text-muted">Loading studio…</div>}>
          {view === "room" && (
            <Home onNavigate={navigate} onOpenVisual={() => navigate("visual")} />
          )}
          {view === "library" && <Library dirRef={folderRef} fileRef={filesRef} />}
          {view === "lyrics" && <LyricsPage />}
          {view === "sound" && <Sound onOpenVisual={() => navigate("visual")} />}
          {view === "visual" && <VisualPage onBack={() => navigate("sound")} />}
        </Suspense>
      </main>

      {/* Right-hand Live Lyrics Panel (Desktop) */}
      <RightLyricsPanel onOpenStudio={() => navigate("lyrics")} />

      {/* Persistent Bottom Player Bar */}
      <PlayerBar onOpenSettings={() => setSettingsOpen(true)} onNavigate={navigate} />

      {/* Preferences Modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Sonora Toast Notification */}
      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          <Icon n="check" s={16} /> {toastMsg}
        </div>
      )}
    </div>
  );
}
