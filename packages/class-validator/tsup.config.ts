import { defineConfig } from "tsup";

export default defineConfig({
  // Task 016: extra entries give the load-time decorators, the validation core and the static DTOs
  // a chunk each, so a bundle drops what it does not import — a consumer
  // that does not import the deprecated static DTOs drops that module with its load-time
  // decorator registration (sideEffects: false). Only `index` is published in `exports`.
  entry: ["src/index.ts", "src/decorators.ts", "src/validate.ts", "src/legacy-dto.ts"],
  format: ["esm", "cjs"],
  target: "es2020",
  platform: "neutral",
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  cjsInterop: true,
  splitting: true,
  sourcemap: true,
  // Task 016: syntax-only minify — keeps the exported class names (DTOs, constraints)
  // and `/* @__PURE__ */`, which identifier/whitespace minify would drop.
  minifySyntax: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
