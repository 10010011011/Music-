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

/**
 * Rewrites nested imports (e.g. "../lib/store", "./components/Home", "./fonts/...")
 * into flat root-level imports ("./store", "./Home", "./dm-sans-latin.woff2")
 * so that extracting `sonora-github-flat.zip` and uploading all files into the root
 * of a GitHub repo from a mobile phone builds cleanly with `npm install && npm run build`
 * without needing any subdirectories!
 */
function flattenSourceCode(code) {
  return code
    .replace(/from\s+["'](?:\.\/|\.\.\/)+(?:lib|components|utils)\/([^"']+)["']/g, 'from "./$1"')
    .replace(/import\(["'](?:\.\/|\.\.\/)+(?:lib|components|utils)\/([^"']+)["']\)/g, 'import("./$1")')
    .replace(/url\(["']?\/?fonts\/([^"')]+)["']?\)/g, 'url("./$1")');
}

async function buildFlatZip() {
  const zip = new JSZip();

  // 1. Root config files adjusted for flat layout
  const pkg = JSON.parse(readText("package.json"));
  const flatPkg = {
    name: "sonora-player",
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      "@capacitor/android": pkg.dependencies["@capacitor/android"] || "^7.6.10",
      "@capacitor/core": pkg.dependencies["@capacitor/core"] || "^7.6.10",
      clsx: pkg.dependencies["clsx"] || "^2.1.1",
      react: pkg.dependencies["react"] || "^19.0.1",
      "react-dom": pkg.dependencies["react-dom"] || "^19.0.1",
      "tailwind-merge": pkg.dependencies["tailwind-merge"] || "^3.4.0",
    },
    devDependencies: {
      "@capacitor/cli": pkg.devDependencies["@capacitor/cli"] || "^7.6.10",
      "@tailwindcss/vite": pkg.devDependencies["@tailwindcss/vite"] || "^4.1.17",
      "@types/node": pkg.devDependencies["@types/node"] || "^22.14.0",
      "@types/react": pkg.devDependencies["@types/react"] || "^19.0.0",
      "@types/react-dom": pkg.devDependencies["@types/react-dom"] || "^19.0.0",
      "@vitejs/plugin-react": pkg.devDependencies["@vitejs/plugin-react"] || "^5.1.1",
      tailwindcss: pkg.devDependencies["tailwindcss"] || "^4.1.17",
      typescript: pkg.devDependencies["typescript"] || "^5.9.3",
      vite: pkg.devDependencies["vite"] || "^7.3.2",
    },
  };
  zip.file("package.json", JSON.stringify(flatPkg, null, 2) + "\n");

  zip.file("capacitor.config.json", readText("capacitor.config.json"));
  zip.file(".gitignore", "node_modules\ndist\nandroid\nout\n.DS_Store\n");
  zip.file("README.md", readText("README.md"));
  zip.file("android.yml", readText(".github/workflows/android.yml"));

  // Flat index.html pointing to ./main.tsx
  const indexHtml = readText("index.html").replace('src="/src/main.tsx"', 'src="./main.tsx"');
  zip.file("index.html", indexHtml);

  // Flat vite.config.ts & tsconfig.json
  const flatViteConfig = `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
`;
  zip.file("vite.config.ts", flatViteConfig);

  const flatTsConfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "types": ["vite/client", "node"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
`;
  zip.file("tsconfig.json", flatTsConfig);

  // 2. All source files flattened to root
  const sourceFiles = [
    ["src/main.tsx", "main.tsx"],
    ["src/App.tsx", "App.tsx"],
    ["src/index.css", "index.css"],
    ["src/vite-env.d.ts", "vite-env.d.ts"],
    ["src/utils/cn.ts", "cn.ts"],
    ["src/lib/analysis.worker.ts", "analysis.worker.ts"],
    ["src/lib/db.ts", "db.ts"],
    ["src/lib/demo.ts", "demo.ts"],
    ["src/lib/devices.ts", "devices.ts"],
    ["src/lib/engine.ts", "engine.ts"],
    ["src/lib/library.ts", "library.ts"],
    ["src/lib/lyrics.ts", "lyrics.ts"],
    ["src/lib/store.ts", "store.ts"],
    ["src/lib/tags.ts", "tags.ts"],
    ["src/components/Home.tsx", "Home.tsx"],
    ["src/components/Library.tsx", "Library.tsx"],
    ["src/components/Lyrics.tsx", "Lyrics.tsx"],
    ["src/components/Player.tsx", "Player.tsx"],
    ["src/components/Settings.tsx", "Settings.tsx"],
    ["src/components/Sound.tsx", "Sound.tsx"],
    ["src/components/Visual.tsx", "Visual.tsx"],
    ["src/components/SharedAudioViews.tsx", "SharedAudioViews.tsx"],
    ["src/components/ui.tsx", "ui.tsx"],
  ];

  for (const [srcPath, flatName] of sourceFiles) {
    const raw = readText(srcPath);
    zip.file(flatName, flattenSourceCode(raw));
  }

  // 3. Public assets placed directly at root (Vite copies root static assets or serves them alongside index.html;
  // also include a tiny vite publicDir plugin or asset copy in flatViteConfig so static files in root are copied to dist!)
  const flatViteWithAssets = `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const STATIC_ASSETS = ["favicon.svg", "afterglow-cover.webp", "dm-sans-latin.woff2", "manrope-latin.woff2"];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-flat-static-assets",
      writeBundle(options) {
        const outDir = options.dir || "dist";
        for (const file of STATIC_ASSETS) {
          if (fs.existsSync(file)) {
            fs.copyFileSync(file, path.join(outDir, file));
          }
        }
      },
    },
  ],
});
`;
  zip.file("vite.config.ts", flatViteWithAssets);

  zip.file("favicon.svg", readBin("public/favicon.svg"));
  zip.file("afterglow-cover.webp", readBin("public/afterglow-cover.webp"));
  zip.file("dm-sans-latin.woff2", readBin("public/fonts/dm-sans-latin.woff2"));
  zip.file("manrope-latin.woff2", readBin("public/fonts/manrope-latin.woff2"));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  fs.writeFileSync(path.join(rootDir, "public/sonora-github-flat.zip"), buf);
  fs.writeFileSync(path.join(rootDir, "sonora-github-flat.zip"), buf);
  fs.copyFileSync(path.join(rootDir, ".github/workflows/android.yml"), path.join(rootDir, "public/android.yml"));
  console.log(`Built flat zip: ${(buf.length / 1024).toFixed(1)} KB with ${Object.keys(zip.files).length} root-level files.`);
}

buildFlatZip();
