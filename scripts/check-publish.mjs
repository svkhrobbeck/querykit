#!/usr/bin/env node
/**
 * Publish check (task 016, miq LIB-06) — run after `bun run build`.
 *
 *   node scripts/check-publish.mjs
 *
 * Every package: `publint` (package.json `exports` / `main` / `types` against the files
 * that ship) and `attw --pack` (are the types right in node10, node16-cjs, node16-esm and
 * bundler resolution). Exit 1 when either reports a problem for any package.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLINT = join(ROOT, "node_modules", "publint", "src", "cli.js");
const ATTW = join(ROOT, "node_modules", "@arethetypeswrong", "cli", "dist", "index.js");

function run(label, script, args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const ok = result.status === 0;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (output) console.log(output.replace(/^/gm, "   "));
  return ok;
}

const dirs = readdirSync(join(ROOT, "packages"), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();
let failed = 0;
for (const dir of dirs) {
  const packageDir = join(ROOT, "packages", dir);
  console.log(`\n== ${dir}`);
  if (!run(`publint ${dir}`, PUBLINT, ["--level", "warning"], packageDir)) failed++;
  if (!run(`attw ${dir}`, ATTW, ["--pack", ".", "--format", "table-flipped"], packageDir)) failed++;
}
console.log(`\npublish: ${failed === 0 ? "ok" : `${failed} check(s) failed`} (${dirs.length} packages)`);
if (failed > 0) process.exitCode = 1;
