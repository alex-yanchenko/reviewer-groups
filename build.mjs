import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");
const zip = process.argv.includes("--zip");

const copyStaticFiles = async () => {
  await mkdir(dist, { recursive: true });
  await cp(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
  await cp(resolve(root, "src/popup/popup.html"), resolve(dist, "popup.html"));
  await cp(resolve(root, "icons"), resolve(dist, "icons"), { recursive: true });
};

const copyStaticFilesAfterBuild = {
  name: "copy-static-files",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await copyStaticFiles();
    });
  },
};

await rm(dist, { recursive: true, force: true });

const ctx = await context({
  entryPoints: [
    { in: resolve(root, "src/popup/main.tsx"), out: "popup" },
    { in: resolve(root, "src/content/picker.ts"), out: "picker" },
  ],
  outdir: dist,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  jsx: "automatic",
  minify: !watch,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [copyStaticFilesAfterBuild],
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

if (zip) {
  const { version } = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
  const archive = resolve(root, `reviewer-groups-${version}.zip`);
  await rm(archive, { force: true });
  execFileSync("zip", ["-r", "-X", archive, "."], { cwd: dist, stdio: "inherit" });
}
