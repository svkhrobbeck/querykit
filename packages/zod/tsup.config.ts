import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  platform: "neutral",
  dts: true,
  clean: true,
  cjsInterop: true,
  splitting: false,
  sourcemap: true,
  // Minified without whitespace — esbuild drops `/* @__PURE__ */` when it minifies
  // whitespace, and the schemas need them to tree-shake (REQUIREMENTS R14).
  minifySyntax: true,
  minifyIdentifiers: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
