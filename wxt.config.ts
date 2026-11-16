import { defineConfig } from "wxt";

const ICONS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png",
};

export default defineConfig({
  srcDir: "src",
  imports: false,
  manifest: {
    name: "Reviewer Groups",
    description: "Request GitHub pull request reviews from several people at once, and save them as groups.",
    minimum_chrome_version: "126",
    permissions: ["storage", "activeTab", "scripting"],
    action: { default_title: "Reviewer Groups", default_icon: ICONS },
    icons: ICONS,
  },
  vite: () => ({ build: { target: "chrome126" } }),
  zip: { artifactTemplate: "{{name}}-{{version}}.zip" },
});
