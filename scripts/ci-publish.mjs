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
import { planPublish, publishablePackages, publishPlanned, releaseFirstCommand } from "./lib/registry.mjs";

if (process.env.CI !== "true") {
  console.log("[ci-publish] not CI — skipping (publishing happens in CI via OIDC).");
  process.exit(0);
}

// A 0.0.0 placeholder is skipped before the registry is asked; a name npm has never seen is
// left out so the other packages still publish (lib/registry.mjs planPublish).
const { publish, firstByHand } = await planPublish(publishablePackages());

if (publish.length === 0) console.log("Nothing new to publish — release is a no-op.");
else {
  publishPlanned(publish);
  console.log(`\nPublished ${publish.length} package(s).`);
}

if (firstByHand.length > 0) {
  const skipped = firstByHand.map(pkg => `${pkg.name}@${pkg.version} (${releaseFirstCommand(pkg)})`);
  console.log(`\nSkipped (first publish by hand): ${skipped.join(", ")}`);
}
