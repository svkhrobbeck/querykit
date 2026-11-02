import { defineConfig } from "tsup";

export default defineConfig({
  // `testing` is its own entry: test helpers stay out of the main bundle (REQUIREMENTS R14).
  entry: ["src/index.ts", "src/testing.ts"],
  format: ["esm", "cjs"],
  target: "node20",
  platform: "node",
  dts: true,
  clean: true,
  cjsInterop: true,
  splitting: false,
  sourcemap: true,
  minify: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
