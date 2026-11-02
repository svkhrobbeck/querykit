/**
 * npm registry reads shared by `ci-publish.mjs` and `release-check.mjs`: the
 * publishable packages of this repo and plain public GETs against the registry
 * (no auth, no npm CLI — reliable in OIDC CI and on a dev machine alike).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * The packages `ci-publish.mjs` publishes: not a placeholder and not on npm yet.
 * `isPublished` and `log` are injected so the plan can be tested offline.
 */
export async function planPublish(pkgs, { isPublished: published = isPublished, log = console.log } = {}) {
  const toPublish = [];
  for (const pkg of pkgs) {
    if (isPlaceholderVersion(pkg.version)) log(`⚠ ${pkg.name}@${pkg.version ?? "—"} is an unreleased placeholder — skip`);
    else if (await published(pkg.name, pkg.version)) log(`✓ ${pkg.name}@${pkg.version} already on npm — skip`);
    else {
      log(`→ ${pkg.name}@${pkg.version} not on npm — will publish`);
      toPublish.push(pkg);
    }
  }
  return toPublish;
}

/** Whether `name@version` is on the registry. */
export async function isPublished(name, version) {
  return (await getPackageJson(name, version)) !== undefined;
}

/** The `latest` dist-tag version of `name`, or `undefined` for a package never published. */
export async function latestVersion(name) {
  return (await getPackageJson(name, "latest"))?.version;
}
