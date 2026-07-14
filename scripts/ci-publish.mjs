/**
 * CI publish — publishes ONLY packages whose current version is not yet on npm,
 * via `npm publish` (OIDC trusted publishing provides auth; provenance via the
 * NPM_CONFIG_PROVENANCE env). Runs after scripts/pin-workspace-deps.mjs so the
 * internal deps are concrete versions (npm doesn't understand `workspace:*`).
 *
 * Why not `changeset publish`: in the OIDC CI environment its "is this version
 * already published" check false-negatives and it tries to re-publish existing
 * versions, which npm rejects ("cannot publish over the previously published
 * versions"). So the release job went red on every push even though there was
 * nothing new to release. Here we do our own unauthenticated registry check
 * (reliable — a plain public GET) and publish only what is genuinely new.
 *
 * CI-only: locally this is a no-op so `bun run release` never publishes from a
 * dev machine (and pin-workspace-deps also skips locally, so deps would still
 * be `workspace:*` anyway).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

if (process.env.CI !== "true") {
  console.log("[ci-publish] not CI — skipping (publishing happens in CI via OIDC).");
  process.exit(0);
}

const packagesDir = new URL("../packages/", import.meta.url).pathname;

const pkgs = readdirSync(packagesDir)
  .filter(d => existsSync(join(packagesDir, d, "package.json")))
  .map(d => ({ dir: join(packagesDir, d), ...JSON.parse(readFileSync(join(packagesDir, d, "package.json"), "utf8")) }))
  .filter(p => !p.private);

async function isPublished(name, version) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`Unexpected ${res.status} from npm registry for ${name}@${version}`);
}

const toPublish = [];
for (const p of pkgs) {
  if (await isPublished(p.name, p.version)) {
    console.log(`✓ ${p.name}@${p.version} already on npm — skip`);
  } else {
    console.log(`→ ${p.name}@${p.version} not on npm — will publish`);
    toPublish.push(p);
  }
}

if (toPublish.length === 0) {
  console.log("Nothing new to publish — release is a no-op.");
  process.exit(0);
}

// @querykitjs/core has no internal deps and the others depend on it — first.
toPublish.sort((a, b) => (a.name.endsWith("/core") ? -1 : b.name.endsWith("/core") ? 1 : 0));

for (const p of toPublish) {
  console.log(`\nPublishing ${p.name}@${p.version} ...`);
  execFileSync("npm", ["publish", "--access", "public"], { cwd: p.dir, stdio: "inherit" });
}
console.log(`\nPublished ${toPublish.length} package(s).`);
