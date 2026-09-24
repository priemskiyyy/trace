import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  clean: true,
  sourcemap: true,
  // A top-level banner also reaches the declarations, where the directive is TS1036 for consumers without skipLibCheck.
  outputOptions: { banner: '"use client";' },
});
