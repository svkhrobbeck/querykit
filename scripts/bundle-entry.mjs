/**
 * Shared by check-treeshake.mjs and check-size.mjs: the published entries of
 * the workspace packages and an esbuild "consumer bundle" of one of them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Server entries are bundled for node (built-ins external); the rest for the browser. */
const NODE_PACKAGES = new Set(["drizzle-pg", "prisma-pg", "mongoose", "mongodb"]);
const NODE_ENTRIES = new Set(["@querykitjs/core/internal"]);

/** The package name of an import path (`react/jsx-runtime` → `react`, `@prisma/client/x` → `@prisma/client`). */
export const packageOf = specifier =>
  specifier
    .split("/")
    .slice(0, specifier.startsWith("@") ? 2 : 1)
    .join("/");

/** Package folders under `packages/`, sorted. */
export const packageDirs = () =>
  readdirSync(join(ROOT, "packages"), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

/**
 * Every published entry of a package (`exports`): its name, the built ESM file (imported by
 * path from the package folder — its own dependencies and peers resolve there; the root has
 * no workspace links) and the options a consumer bundle of it uses.
 */
export function entriesOf(dir) {
  const manifest = JSON.parse(readFileSync(join(ROOT, "packages", dir, "package.json"), "utf8"));
  const peers = Object.keys(manifest.peerDependencies ?? {});
  return Object.entries(manifest.exports ?? {}).map(([subpath, conditions]) => {
    const entry = subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
    return {
      dir,
      peers,
      entry,
      file: `./${conditions.import.default.replace(/^\.\//, "")}`,
      options: { platform: NODE_PACKAGES.has(dir) || NODE_ENTRIES.has(entry) ? "node" : "browser", peers, resolveDir: join(ROOT, "packages", dir) },
    };
  });
}

/** A minified ESM bundle of `contents` as a consumer would build it: peers (and `alsoExternal`) external. */
export async function bundle(contents, { platform, peers, resolveDir, alsoExternal = [] }) {
  const result = await build({
    stdin: { contents, resolveDir, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform,
    external: [...peers.flatMap(peer => [peer, `${peer}/*`]), ...alsoExternal],
    write: false,
    metafile: true,
    logLevel: "silent",
    // Resolve published `dist` files, not the `paths` → `src` mapping of the package tsconfig.
    tsconfigRaw: "{}",
  });
  const [output] = Object.values(result.metafile.outputs);
  return {
    bytes: result.outputFiles[0].contents.byteLength,
    contents: result.outputFiles[0].contents,
    code: result.outputFiles[0].text.trim(),
    exports: output.exports,
    // Node built-ins (external on the node platform) are not peers.
    externals: output.imports.filter(i => i.external && !isBuiltin(i.path)).map(i => packageOf(i.path)),
  };
}
