import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { Track } from "./store";

const INDEX = "sonora-library/index.json";
const safeName = (id: string) => encodeURIComponent(id).replace(/%/g, "_") + ".audio";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fromBase64(data: string, name: string, type: string): File {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: type || "application/octet-stream" });
}

type SavedTrack = {
  id: string; fileName: string; type: string; path: string; title: string;
  artist: string; album: string; duration?: number; cover?: string;
};

export async function persistNativeTracks(tracks: Track[]) {
  if (!Capacitor.isNativePlatform()) return;
  await Filesystem.mkdir({ path: "sonora-library", directory: Directory.Data, recursive: true }).catch(() => {});
  const saved: SavedTrack[] = [];
  for (const track of tracks) {
    if (track.demo) continue;
    const path = "sonora-library/" + safeName(track.id);
    try {
      await Filesystem.writeFile({ path, data: await toBase64(track.file), directory: Directory.Data });
      saved.push({
        id: track.id, fileName: track.file.name, type: track.file.type,
        path: track.path, title: track.title, artist: track.artist, album: track.album,
        duration: track.duration, cover: track.cover,
      });
    } catch (error) {
      console.error("Sonora could not save audio file", track.file.name, error);
    }
  }
  await Filesystem.writeFile({
    path: INDEX, data: JSON.stringify(saved), directory: Directory.Data, recursive: true,
  });
}

export async function restoreNativeTracks(): Promise<Track[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const result = await Filesystem.readFile({ path: INDEX, directory: Directory.Data });
    const raw = typeof result.data === "string" ? result.data : "";
    const saved = JSON.parse(raw) as SavedTrack[];
    const restored: Track[] = [];
    for (const item of saved) {
      try {
        const audio = await Filesystem.readFile({
          path: "sonora-library/" + safeName(item.id), directory: Directory.Data,
        });
        if (typeof audio.data !== "string") continue;
        const file = fromBase64(audio.data, item.fileName, item.type);
        restored.push({
          id: item.id, file, path: item.path, title: item.title,
          artist: item.artist, album: item.album, duration: item.duration,
          cover: item.cover, tagsDone: true,
        });
      } catch (error) {
        console.warn("Sonora skipped a missing saved track", item.fileName, error);
      }
    }
    return restored;
  } catch {
    return [];
  }
}
