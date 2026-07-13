import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react/index.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  platform: "neutral",
  dts: true,
  clean: true,
  cjsInterop: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
