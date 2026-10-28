import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", internal: "src/internal/index.ts" },
  format: ["esm", "cjs"],
  target: "es2020",
  platform: "neutral",
  dts: true,
  clean: true,
  cjsInterop: true,
  // Shared chunk: `./internal` must throw the very `QueryKitError` class the main entry exports (instanceof).
  splitting: true,
  sourcemap: true,
  // Task 009: the internal entry carries the shared adapter logic. keepNames keeps class names (`QueryKitError.name`) after minify.
  minify: true,
  keepNames: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
