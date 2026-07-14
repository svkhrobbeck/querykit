/**
 * CI-only: pin internal `workspace:*` deps to the concrete published version
 * (`^<version>`) across all packages, right before `changeset publish`.
 *
 * Why: `changeset publish` falls back to `npm publish` (bun.lock is the only
 * lockfile), and npm does NOT understand the `workspace:` protocol — it would
 * publish a literal `workspace:*` range and break installs. `bun publish`
 * converts it, but changesets doesn't call bun. This script guarantees concrete
 * ranges regardless of the publisher.
 *
 * Local runs are skipped (guarded on CI) so dev keeps using `workspace:*` for
 * bun's workspace linking.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.CI !== "true") {
  console.log("[pin-workspace-deps] not CI — skipping (workspace:* kept for local linking)");
  process.exit(0);
}

const packagesDir = new URL("../packages/", import.meta.url).pathname;

// name -> version, for every workspace package
const versions = new Map();
const pkgDirs = readdirSync(packagesDir).filter(d => existsSync(join(packagesDir, d, "package.json")));
for (const d of pkgDirs) {
  const pkg = JSON.parse(readFileSync(join(packagesDir, d, "package.json"), "utf8"));
  versions.set(pkg.name, pkg.version);
}

const DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];
let changed = 0;

for (const d of pkgDirs) {
  const file = join(packagesDir, d, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  let touched = false;
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === "string" && range.startsWith("workspace:") && versions.has(name)) {
        deps[name] = `^${versions.get(name)}`;
        console.log(`[pin-workspace-deps] ${pkg.name}: ${name} ${range} -> ${deps[name]}`);
        touched = true;
      }
    }
  }
  if (touched) {
    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    changed++;
  }
}

console.log(`[pin-workspace-deps] done — ${changed} package.json file(s) updated`);
