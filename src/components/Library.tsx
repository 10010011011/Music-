import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useStore, library, player, settings, fmt, toggleLikeTrack } from "../lib/store";
import { ingest, openFolderHandle, savedFolder, playTrackIndex } from "../lib/library";
import { loadDemo } from "../lib/demo";
import { Icon, Cover, Chip } from "./ui";

const ROW = 66;

export function Pickers({
  dirRef,
  fileRef,
}: {
  dirRef: React.RefObject<HTMLInputElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [saved, setSaved] = useState<FileSystemDirectoryHandle | undefined>();
  useEffect(() => {
    savedFolder().then(setSaved);
  }, []);

  const native = Capacitor.isNativePlatform();
  const openFolder = () => {
    // Folder selection via webkitdirectory is not implemented by Android WebView.
    if (native) return fileRef.current?.click();
    return window.showDirectoryPicker ? openFolderHandle() : dirRef.current?.click();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="outline-button" onClick={() => fileRef.current?.click()}>
        <Icon n="plus" s={17} /> Add music
      </button>
      {!native && (
        <button type="button" className="outline-button" onClick={openFolder}>
          <Icon n="folder-open" s={17} /> Open folder
        </button>
      )}
      {saved && (
        <button
          type="button"
          className="outline-button"
          onClick={() => openFolderHandle(saved)}
          title={`Reopen ${saved.name}`}
        >
          <Icon n="loop" s={16} /> Reopen “{saved.name}”
        </button>
      )}
      <button type="button" className="outline-button" onClick={loadDemo}>
        <Icon n="sparkles" s={16} /> Demo songs
      </button>
    </div>
  );
}

export default function Library({
  dirRef,
  fileRef,
}: {
  dirRef: React.RefObject<HTMLInputElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const tracks = useStore(library, (s) => s.tracks);
  const loading = useStore(library, (s) => s.loading);
  const folder = useStore(library, (s) => s.folderName);
  const filter = useStore(library, (s) => s.filter);
  const curId = useStore(player, (s) => s.trackId);
  const playing = useStore(player, (s) => s.playing);
  const likedIds = useStore(settings, (s) => s.likedIds);

  const [q, setQ] = useState("");
  const [scroll, setScroll] = useState(0);
  const [h, setH] = useState(520);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight || 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (filter === "liked" && !likedIds.includes(t.id)) continue;
      if (s && !`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(s)) continue;
      out.push(i);
    }
    return out;
  }, [tracks, q, filter, likedIds]);

  const start = Math.max(0, Math.floor(scroll / ROW) - 6);
  const end = Math.min(list.length, Math.ceil((scroll + h) / ROW) + 6);

  return (
    <div className="main-content inner-content">
      <div className="section-kicker">
        <span /> LIBRARY
      </div>
      <h1>Library</h1>
      <p className="subtitle">
        {tracks.length} {tracks.length === 1 ? "track" : "tracks"}{loading ? " · Loading…" : ""}
      </p>

      <div className="library-tools">
        <div className="search-box">
          <Icon n="search" s={18} />
          <input
            placeholder="Search title, artist, album..."
            aria-label="Search your music"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button
            type="button"
            className={filter === "all" ? "selected" : ""}
            onClick={() => library.set({ filter: "all" })}
          >
            All songs ({tracks.length})
          </button>
          <button
            type="button"
            className={filter === "liked" ? "selected" : ""}
            onClick={() => library.set({ filter: "liked" })}
          >
            Liked ({likedIds.length})
          </button>
        </div>
        <Pickers dirRef={dirRef} fileRef={fileRef} />
      </div>

      <div className="library-heading">
        <span>SONG</span>
        <span>DURATION</span>
      </div>

      <div
        ref={box}
        className="library-list relative max-h-[540px] overflow-y-auto"
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      >
        {list.length === 0 ? (
          <div className="workspace-empty">
            {filter === "liked"
              ? "No liked songs yet."
              : "No songs yet. Add music to your library."}
          </div>
        ) : (
          <div style={{ height: list.length * ROW }} className="relative">
            {list.slice(start, end).map((ti, k) => {
              const t = tracks[ti];
              const isCurrent = t.id === curId;
              const isLiked = likedIds.includes(t.id);
              const metaParts = [t.artist];
              if (t.album && t.album !== t.artist) metaParts.push(t.album);
              if (t.sidecar || t.embeddedLyrics || (t as any).demoLyrics) metaParts.push("LRC");
              if (t.rgTrack != null) metaParts.push("RG");

              return (
                <div
                  key={t.id}
                  className={`library-row absolute left-0 right-0 ${isCurrent ? "current" : ""}`}
                  style={{ top: (start + k) * ROW, height: ROW }}
                >
                  <button
                    type="button"
                    className="library-row-main"
                    onClick={() => playTrackIndex(ti)}
                  >
                    <Cover src={t.cover} size={42} alt={t.title} />
                    <span className="queue-name">
                      <b>{t.title}</b>
                      <small>{metaParts.join(" · ")}</small>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`row-heart ${isLiked ? "liked" : ""}`}
                    onClick={() => toggleLikeTrack(t.id)}
                    aria-label={`Like ${t.title}`}
                    title={isLiked ? "Unlike song" : "Like song"}
                  >
                    <Icon n="heart" s={17} fill={isLiked} />
                  </button>

                  <span className="library-duration tabular-nums">
                    {isCurrent && playing ? (
                      <Icon n="audio-lines" s={16} className="ml-auto text-accent" />
                    ) : t.duration ? (
                      fmt(t.duration)
                    ) : (
                      "--:--"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="library-footnote">
        Reads ID3v2 &amp; FLAC headers (embedded cover art, ReplayGain, and lyrics) and automatically pairs sidecar{" "}
        <code>.lrc / .srt / .vtt</code> files from your folder.
      </p>
    </div>
  );
}
export { ingest };
