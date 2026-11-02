/**
 * Release check for `/miq:deployer npm` — read-only, never publishes.
 *
 *   node scripts/release-check.mjs             every package: local version == npm `latest`? exit 0 only when all are
 *   node scripts/release-check.mjs --pending   packages waiting for a publish (local > npm, or not on npm yet); exit 0
 *   node scripts/release-check.mjs --registry  does the registry answer? exit 0 / 1
 */
import { writeSync } from "node:fs";

import { latestVersion, publishablePackages, REGISTRY } from "./lib/registry.mjs";

// `process.exit` right after a write can lose output on Windows pipes; write synchronously.
const print = text => writeSync(1, `${text}\n`);

/** `a > b` for plain `X.Y.Z` versions (a pre-release suffix is ignored). */
function isNewer(a, b) {
  const parts = version => version.split("-")[0].split(".").map(Number);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index];
  return false;
}

/** Local and npm version of every publishable package, in folder order. */
async function versions() {
  const packages = publishablePackages();
  const npm = await Promise.all(packages.map(pkg => latestVersion(pkg.name)));
  return packages.map((pkg, index) => ({ name: pkg.name, local: pkg.version, npm: npm[index] }));
}

function table(rows, status) {
  print("| name | local | npm | status |");
  print("| --- | --- | --- | --- |");
  for (const row of rows) print(`| ${row.name} | ${row.local} | ${row.npm ?? "—"} | ${status(row)} |`);
}

async function check() {
  const rows = await versions();
  table(rows, row => (row.npm === row.local ? "ok" : "not ok"));
  const bad = rows.filter(row => row.npm !== row.local).length;
  print(bad === 0 ? `\nrelease-check: all ${rows.length} packages match npm` : `\nrelease-check: ${bad}/${rows.length} packages differ from npm`);
  return bad === 0 ? 0 : 1;
}

async function pending() {
  const rows = (await versions()).filter(row => row.npm === undefined || isNewer(row.local, row.npm));
  if (rows.length === 0) print("release-check --pending: nothing waiting for a publish");
  else table(rows, () => "pending");
  return 0;
}

/** One small request is enough to know the registry answers. */
async function registry() {
  const [first] = publishablePackages();
  try {
    await latestVersion(first.name);
    print(`registry ok: ${REGISTRY}`);
    return 0;
  } catch (error) {
    print(`registry unreachable: ${REGISTRY} — ${error.message}`);
    return 1;
  }
}

const MODES = { "--pending": pending, "--registry": registry };
const mode = process.argv[2];
if (mode !== undefined && !(mode in MODES)) {
  print(`unknown option ${mode} — use --pending, --registry or nothing`);
  process.exitCode = 2;
} else {
  process.exitCode = await (MODES[mode] ?? check)();
}
