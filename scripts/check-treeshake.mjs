#!/usr/bin/env node
/**
 * Tree-shake check (REQUIREMENTS R14) — run after `bun run build`.
 *
 *   node scripts/check-treeshake.mjs
 *
 * For every published entry of every package (`exports` in its package.json):
 * - the full entry is bundled with its dependencies (`export * from "<entry>"`, minified
 *   ESM, peers external): it must bundle for its platform, and the peers it imports must
 *   be on the entry's allow-list (web `.` imports none);
 * - `import "<entry>"` alone must bundle to nothing (no top-level side effect);
 * - each runtime export is bundled alone (`export { X } from "<entry>"`) with the other
 *   `@querykitjs/*` packages external — each package is judged on its own code, as its
 *   `dist/index.js` (core's entries are checked as entries of their own): it passes when
 *   it is ≤ 2 KB, or ≤ 60 % of the same bundle of the whole entry.
 *   ENTRY_POINTS (below) are exempt from the 60 % rule: they wire the whole package.
 * Exit 1 when any check fails.
 */
import { bundle, entriesOf, packageDirs } from "./bundle-entry.mjs";

const SMALL_EXPORT_BYTES = 2048;
const MAX_SHARE = 0.6;
/**
 * ENTRY_POINTS — exports that wire every other part of their package or entry, so they pull
 * most of it by design: exempt from the 60 % / 2 KB rule, still listed with their size as
 * "entry point". A router hook is the whole job of its entry; `size-budget.json` still limits
 * that entry's growth. Every other export keeps the 60 % / 2 KB rule.
 */
const ENTRY_POINTS = {
  "@querykitjs/drizzle-pg": ["createRegistry", "buildRepository"],
  "@querykitjs/prisma-pg": ["createRegistry", "buildRepository"],
  "@querykitjs/mongoose": ["createRegistry", "buildRepository"],
  "@querykitjs/mongodb": ["createRegistry", "buildRepository"],
  "@querykitjs/web": ["createRegistry"],
  "@querykitjs/web/react": ["useListParams"],
  "@querykitjs/web/vue": ["useListParams"],
  "@querykitjs/web/angular": ["injectListParams"],
};
/** Workspace packages: external when an export is measured on its package's own code. */
const WORKSPACE = ["@querykitjs/*"];

/** Entries that must not import any peer, even one their package declares. */
const NO_PEER_ENTRIES = new Set(["@querykitjs/web"]);

async function checkEntry({ peers, entry, file, options }) {
  const problems = [];
  let full;
  try {
    full = await bundle(`export * from "${file}";`, options);
  } catch (error) {
    // e.g. a node built-in reached from a browser entry — the entry cannot be bundled at all.
    return { entry, fullBytes: 0, rows: [], problems: [`cannot bundle for ${options.platform}: ${error.errors?.[0]?.text ?? error.message}`] };
  }

  const allowed = NO_PEER_ENTRIES.has(entry) ? [] : peers;
  const strayPeers = [...new Set(full.externals)].filter(name => !allowed.includes(name));
  if (strayPeers.length > 0) problems.push(`imports peer(s) ${strayPeers.join(", ")} (allowed: ${allowed.join(", ") || "none"})`);

  const bare = await bundle(`import "${file}";`, options);
  if (bare.code !== "") problems.push(`import "${entry}" keeps ${bare.bytes} B of top-level code: ${bare.code.slice(0, 120)}`);

  const own = { ...options, alsoExternal: WORKSPACE };
  const ownFull = await bundle(`export * from "${file}";`, own);
  const rows = [];
  for (const name of full.exports.filter(n => n !== "default")) {
    const alone = await bundle(`export { ${name} } from "${file}";`, own);
    const share = alone.bytes / ownFull.bytes;
    const isEntryPoint = ENTRY_POINTS[entry]?.includes(name) ?? false;
    const ok = alone.bytes <= SMALL_EXPORT_BYTES || share <= MAX_SHARE;
    rows.push({ name, bytes: alone.bytes, share, ok, exempt: !ok && isEntryPoint });
    if (!ok && !isEntryPoint)
      problems.push(`${name}: ${alone.bytes} B = ${(share * 100).toFixed(0)} % of the entry (limit ${MAX_SHARE * 100} % or ${SMALL_EXPORT_BYTES} B)`);
  }
  return { entry, fullBytes: full.bytes, ownBytes: ownFull.bytes, rows, problems };
}

let failed = 0;
for (const target of packageDirs().flatMap(entriesOf)) {
  const result = await checkEntry(target);
  console.log(
    `\n${result.problems.length === 0 ? "✅" : "❌"} ${result.entry} — entry ${result.ownBytes ?? 0} B own code, ${result.fullBytes} B with dependencies, ${result.rows.length} exports`,
  );
  for (const row of result.rows) {
    const mark = row.ok ? " " : row.exempt ? "≈" : "✗";
    console.log(
      `   ${mark} ${row.name.padEnd(32)} ${String(row.bytes).padStart(7)} B  ${(row.share * 100).toFixed(0).padStart(3)} %${row.exempt ? "  (entry point)" : ""}`,
    );
  }
  for (const problem of result.problems) console.log(`   ❌ ${problem}`);
  failed += result.problems.length;
}
console.log(`\ntreeshake: ${failed === 0 ? "ok" : `${failed} problem(s)`}`);
if (failed > 0) process.exitCode = 1;
