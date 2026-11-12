import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../docs/screenshots");
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const shots = [
  { scene: "pick", width: 1280, height: 800 },
  { scene: "groups", width: 1280, height: 800 },
  { scene: "search", width: 1280, height: 800 },
  { scene: "save", width: 1280, height: 800 },
  { scene: "promo", width: 440, height: 280 },
];

await build({
  entryPoints: { scenes: resolve(here, "scenes.tsx") },
  outdir: resolve(here, ".build"),
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

await mkdir(output, { recursive: true });
const page = pathToFileURL(resolve(here, "index.html")).href;

for (const { scene, width, height } of shots) {
  const file = resolve(output, `${scene}.png`);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--blink-settings=preferredColorScheme=1",
    "--allow-file-access-from-files",
    `--window-size=${width},${height}`,
    "--virtual-time-budget=6000",
    `--screenshot=${file}`,
    `${page}#${scene}`,
  ]);
  console.log(`wrote ${file}`);
}
