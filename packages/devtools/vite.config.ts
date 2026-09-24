import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Solid's event delegation registers on window at import time, which breaks server imports of the wrappers.
  plugins: [solid({ solid: { delegateEvents: false } })],
  resolve: { alias: { src: fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: "index",
    },
    // The inspector bundles its own Solid runtime, so a host application needs no Solid install.
    rolldownOptions: { external: ["@priemskiyyy/trace"] },
    target: "es2022",
    sourcemap: true,
    minify: false,
  },
});
