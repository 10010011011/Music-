import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const rootDir = process.cwd();

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), "utf8");
}

function readBin(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath));
}

function pickVersions(source, names, label) {
  return Object.fromEntries(names.map((name) => {
    if (!source[name]) throw new Error(`Missing required ${label} dependency: ${name}`);
    return [name, source[name]];
  }));
}

/**
 * Flatten only imports that point into the src/lib, src/components, or
 * src/utils trees. Imports between already-flattened files remain unchanged.
 */
function flattenSourceCode(code) {
  return code
    .replace(
      /(\bfrom\s*["']|\bimport\s*\(\s*["'])(?:\.\/|\.\.\/)+(?:lib|components|utils)\/([^"']+)(["'])/g,
      (_match, prefix, file, suffix) => prefix + "./" + file + suffix
    )
    .replace(
      /url\(\s*(["']?)\/fonts\/([^"')]+)\1\s*\)/g,
      (_match, quote, file) => `url(${quote}./${file}${quote})`
    );
}

async function buildFlatZip() {
  const zip = new JSZip();
  const currentPackage = JSON.parse(readText("package.json"));

  const flatPackage = {
    name: "sonora-player",
    private: true,
    version: currentPackage.version || "1.0.0",
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0",
      build: "vite build",
      preview: "vite preview",
      lint: "tsc --noEmit",
      "test:lyrics": "tsx scripts/test-lyrics.ts",
      "test:core": "tsx --test lyrics-and-dsp.test.ts"
    },
    dependencies: pickVersions(currentPackage.dependencies, [
      "@capacitor/android",
      "@capacitor/core",
      "@capacitor/filesystem",
      "react",
      "react-dom"
    ], "runtime"),
    devDependencies: pickVersions(currentPackage.devDependencies, [
      "@capacitor/cli",
      "@tailwindcss/vite",
      "@types/node",
      "@types/react",
      "@types/react-dom",
      "@vitejs/plugin-react",
      "tailwindcss",
      "tsx",
      "typescript",
      "vite"
    ], "build")
  };

  zip.file("package.json", JSON.stringify(flatPackage, null, 2) + "\n");
  zip.file("capacitor.config.json", readText("capacitor.config.json"));
  zip.file(".gitignore", [
    "node_modules/",
    "dist/",
    "android/",
    "out/",
    ".env*",
    "!.env.example",
    ".DS_Store",
    "sonora-github-flat.zip",
    ""
  ].join("\n"));
  const fullWorkflow = readText(".github/workflows/android.yml");
  const flatWorkflow = fullWorkflow.replace(
    "      - name: Verify mobile flat-source archive\n        run: |\n          npm run build:flat-zip\n          unzip -t sonora-github-flat.zip\n",
    ""
  );
  if (flatWorkflow === fullWorkflow) {
    throw new Error("Could not remove the source-archive-only CI step from the flat workflow");
  }

  const flatReadme = [
    "# Sonora — Flattened Source Bundle",
    "",
    "This archive is already prepared for a mobile GitHub upload. App modules are flattened to the archive root, while the Android workflow and required scripts remain in their original folders.",
    "",
    "1. Extract the archive and upload its contents to the repository root.",
    "2. Keep the .github/workflows/android.yml and scripts/ folder.",
    "3. Open GitHub Actions and run Build Android APK.",
    "",
    "To regenerate this archive, return to the original structured Sonora repository and run npm run build:flat-zip."
  ].join("\n");

  zip.file("README.md", flatReadme);
  zip.file("metadata.json", readText("metadata.json"));
  zip.file("android.yml", flatWorkflow);
  zip.file(".github/workflows/android.yml", flatWorkflow);

  const indexHtml = readText("index.html")
    .replace('src="/src/main.tsx"', 'src="./main.tsx"');
  zip.file("index.html", indexHtml);

  const flatViteConfig = `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const staticAssets = [
  "favicon.svg",
  "dm-sans-latin.woff2",
  "manrope-latin.woff2"
];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-flat-static-assets",
      apply: "build",
      writeBundle({ dir }) {
        const outDir = path.resolve(dir || "dist");
        fs.mkdirSync(outDir, { recursive: true });
        for (const file of staticAssets) {
          if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join(outDir, file));
          }
        }
      }
    }
  ]
});
`;
  zip.file("vite.config.ts", flatViteConfig);

  zip.file("tsconfig.json", `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "experimentalDecorators": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
`);

  const sourceFiles = [
    ["src/main.tsx", "main.tsx"],
    ["src/App.tsx", "App.tsx"],
    ["src/index.css", "index.css"],
    ["src/vite-env.d.ts", "vite-env.d.ts"],
    ["src/lib/analysis.worker.ts", "analysis.worker.ts"],
    ["src/lib/db.ts", "db.ts"],
    ["src/lib/demo.ts", "demo.ts"],
    ["src/lib/devices.ts", "devices.ts"],
    ["src/lib/engine.ts", "engine.ts"],
    ["src/lib/library.ts", "library.ts"],
    ["src/lib/lyrics.ts", "lyrics.ts"],
    ["src/lib/mediaStore.ts", "mediaStore.ts"],
    ["src/lib/nativeLibrary.ts", "nativeLibrary.ts"],
    ["src/lib/store.ts", "store.ts"],
    ["src/lib/tags.ts", "tags.ts"],
    ["src/components/Home.tsx", "Home.tsx"],
    ["src/components/Library.tsx", "Library.tsx"],
    ["src/components/Lyrics.tsx", "Lyrics.tsx"],
    ["src/components/LyricsScroller.tsx", "LyricsScroller.tsx"],
    ["src/components/NowPlaying.tsx", "NowPlaying.tsx"],
    ["src/components/Player.tsx", "Player.tsx"],
    ["src/components/Settings.tsx", "Settings.tsx"],
    ["src/components/SharedAudioViews.tsx", "SharedAudioViews.tsx"],
    ["src/components/Sound.tsx", "Sound.tsx"],
    ["src/components/Visual.tsx", "Visual.tsx"],
    ["src/components/ui.tsx", "ui.tsx"]
  ];

  for (const [sourcePath, archivePath] of sourceFiles) {
    zip.file(archivePath, flattenSourceCode(readText(sourcePath)));
  }

  zip.file(
    "scripts/test-lyrics.ts",
    readText("scripts/test-lyrics.ts").replace("../src/lib/lyrics", "../lyrics")
  );
  zip.file("lyrics-and-dsp.test.ts", readText("src/lib/lyrics-and-dsp.test.ts"));

  for (const script of [
    "scripts/install-sonora-storage-plugin.sh",
    "scripts/set-android-icon.sh"
  ]) {
    zip.file(script, readText(script));
  }

  for (const [source, archive] of [
    ["public/favicon.svg", "favicon.svg"],
    ["public/fonts/dm-sans-latin.woff2", "dm-sans-latin.woff2"],
    ["public/fonts/manrope-latin.woff2", "manrope-latin.woff2"]
  ]) {
    zip.file(archive, readBin(source));
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  fs.writeFileSync(path.join(rootDir, "sonora-github-flat.zip"), buffer);
  fs.mkdirSync(path.join(rootDir, "public"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "public/sonora-github-flat.zip"), buffer);

  console.log(
    `Built flat source archive: ${(buffer.length / 1024).toFixed(1)} KB, ${Object.keys(zip.files).length} files.`
  );
}

buildFlatZip().catch((error) => {
  console.error("Could not build the flat source archive:", error);
  process.exitCode = 1;
});
