/**
 * npm registry reads shared by `ci-publish.mjs` and `release-check.mjs`: the
 * publishable packages of this repo and plain public GETs against the registry
 * (no auth, no npm CLI — reliable in OIDC CI and on a dev machine alike), plus the
 * publish plan and the publish loop of `ci-publish.mjs`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The registry base URL; `QK_NPM_REGISTRY` overrides it (tests point it at a dead host). */
export const REGISTRY = (process.env.QK_NPM_REGISTRY ?? "https://registry.npmjs.org").replace(/\/+$/, "");

const PACKAGES_DIR = fileURLToPath(new URL("../../packages/", import.meta.url));
const REQUEST_TIMEOUT_MS = 15_000;

/** Every `packages/*` manifest that is not `private`, with its folder. */
export function publishablePackages() {
  return readdirSync(PACKAGES_DIR)
    .filter(dir => existsSync(join(PACKAGES_DIR, dir, "package.json")))
    .map(dir => ({ dir: join(PACKAGES_DIR, dir), ...JSON.parse(readFileSync(join(PACKAGES_DIR, dir, "package.json"), "utf8")) }))
    .filter(pkg => !pkg.private);
}

/** GET `<registry>/<name>/<suffix>`: the JSON body on 200, `undefined` on 404, an error otherwise. */
async function getPackageJson(name, suffix) {
  const url = `${REGISTRY}/${name.replace("/", "%2F")}/${suffix}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (res.status === 200) return res.json();
  if (res.status === 404) return undefined;
  throw new Error(`Unexpected ${res.status} from npm registry for ${name}/${suffix}`);
}

/**
 * `0.0.0` (or no version) marks a package that was never released: its first version comes
 * from the changeset bump. Publishing it would burn a version npm never lets you reuse.
 */
export function isPlaceholderVersion(version) {
  return version === undefined || version === "0.0.0";
}

/** The command that publishes the first version of a package npm has never seen (`scripts/first-publish.mjs`). */
export function releaseFirstCommand(pkg) {
  return `bun run release:first ${basename(pkg.dir)}`;
}

/**
 * The packages `ci-publish.mjs` publishes (`publish`): not a placeholder, a name npm
 * already knows, a version not on npm yet. A name npm has never seen goes to
 * `firstByHand`: OIDC trusted publishing can be set up only for an existing package.
 * `isPublished`, `isNewName` and `log` are injected so the plan can be tested offline.
 */
export async function planPublish(pkgs, { isPublished: published = isPublished, isNewName: newName = isNewName, log = console.log } = {}) {
  const publish = [];
  const firstByHand = [];
  for (const pkg of pkgs) {
    if (isPlaceholderVersion(pkg.version)) log(`⚠ ${pkg.name}@${pkg.version ?? "—"} is an unreleased placeholder — skip`);
    else if (await newName(pkg.name)) {
      log(`⚠ ${pkg.name}@${pkg.version} is new on npm — CI cannot publish a new name (OIDC); first publish by hand: ${releaseFirstCommand(pkg)}`);
      firstByHand.push(pkg);
    } else if (await published(pkg.name, pkg.version)) log(`✓ ${pkg.name}@${pkg.version} already on npm — skip`);
    else {
      log(`→ ${pkg.name}@${pkg.version} not on npm — will publish`);
      publish.push(pkg);
    }
  }
  return { publish, firstByHand };
}

function npmPublish(pkg) {
  execFileSync("npm", ["publish", "--access", "public"], { cwd: pkg.dir, stdio: "inherit" });
}

/**
 * `npm publish` every planned package, `@querykitjs/core` first (the others depend on it).
 * The first failure throws and stops the run. `publish` and `log` are injected for the test.
 */
export function publishPlanned(pkgs, { publish = npmPublish, log = console.log } = {}) {
  const ordered = [...pkgs].sort((a, b) => (a.name.endsWith("/core") ? -1 : b.name.endsWith("/core") ? 1 : 0));
  for (const pkg of ordered) {
    log(`\nPublishing ${pkg.name}@${pkg.version} ...`);
    publish(pkg);
    // changesets/action greps the publish command's stdout for these lines and,
    // for each, creates the git tag and a GitHub Release from the CHANGELOG.
    log(`New tag: ${pkg.name}@${pkg.version}`);
  }
}

/** Whether `name@version` is on the registry. */
export async function isPublished(name, version) {
  return (await getPackageJson(name, version)) !== undefined;
}

/** The `latest` dist-tag version of `name`, or `undefined` for a package never published. */
export async function latestVersion(name) {
  return (await getPackageJson(name, "latest"))?.version;
}

/** Whether npm has never seen `name` (no `latest` version). */
export async function isNewName(name) {
  return (await latestVersion(name)) === undefined;
}
