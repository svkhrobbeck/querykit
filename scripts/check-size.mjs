#!/usr/bin/env node
/**
 * Size budget (task 016, REQUIREMENTS § Performance budgets) — run after `bun run build`.
 *
 *   node scripts/check-size.mjs           compare with size-budget.json, exit 1 when over
 *   node scripts/check-size.mjs --write   write size-budget.json from today's build (+10 %)
 *
 * Measures what a consumer ships, not the files in `dist/`: for every published entry the
 * full import (`export * from "<entry>"`) bundled with its dependencies, minified, peers
 * external, then gzipped. A package that splits its files for tree-shaking is judged by this
 * bundle; the sum of its files is not a budget.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

import { bundle, entriesOf, packageDirs, ROOT } from "./bundle-entry.mjs";

const BUDGET_FILE = join(ROOT, "size-budget.json");
/** The budget is today's size plus this headroom. */
const HEADROOM = 1.1;

const sizes = [];
for (const { entry, file, options } of packageDirs().flatMap(entriesOf)) {
  const full = await bundle(`export * from "${file}";`, options);
  sizes.push({ entry, gzip: gzipSync(full.contents).byteLength });
}

if (process.argv.includes("--write")) {
  const budget = Object.fromEntries(sizes.map(({ entry, gzip }) => [entry, Math.ceil(gzip * HEADROOM)]));
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`size: wrote ${relative(ROOT, BUDGET_FILE)} for ${sizes.length} entries (today + ${Math.round((HEADROOM - 1) * 100)} %)`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
let over = 0;
for (const { entry, gzip } of sizes) {
  const limit = budget[entry];
  const ok = limit !== undefined && gzip <= limit;
  if (!ok) over++;
  console.log(`${ok ? "✅" : "❌"} ${entry.padEnd(32)} full import ${String(gzip).padStart(7)} B gzip / budget ${limit ?? "missing"}`);
}
console.log(`size: ${over === 0 ? "ok" : `${over} over budget`} (${sizes.length} entries)`);
if (over > 0) process.exitCode = 1;
