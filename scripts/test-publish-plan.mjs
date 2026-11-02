/**
 * Offline test of the CI publish plan (`scripts/lib/registry.mjs` `planPublish`): which
 * packages `ci-publish.mjs` would publish. The registry is stubbed — no network, no npm.
 *
 *   bun run test:publish-plan
 */
import { writeSync } from "node:fs";

import { isPlaceholderVersion, planPublish } from "./lib/registry.mjs";

const print = text => writeSync(1, `${text}\n`);
let failed = 0;
function check(label, ok, extra = "") {
  print(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

const ON_NPM = new Set(["@querykitjs/core@1.2.0"]);
const stubIsPublished = async (name, version) => ON_NPM.has(`${name}@${version}`);
const pkgs = [
  { name: "@querykitjs/mongodb", version: "0.0.0" },
  { name: "@querykitjs/zod", version: "1.0.0" },
  { name: "@querykitjs/core", version: "1.2.0" },
  { name: "@querykitjs/web" },
];
const lines = [];
const toPublish = await planPublish(pkgs, { isPublished: stubIsPublished, log: line => lines.push(line) });
const names = toPublish.map(pkg => pkg.name);

check("0.0.0 is a placeholder", isPlaceholderVersion("0.0.0") && isPlaceholderVersion(undefined) && !isPlaceholderVersion("1.0.0"));
check("0.0.0 is not published", !names.includes("@querykitjs/mongodb"), names.join());
check("…and says why", lines.includes("⚠ @querykitjs/mongodb@0.0.0 is an unreleased placeholder — skip"), lines.join(" | "));
check("a package without a version is not published", !names.includes("@querykitjs/web"), names.join());
check("a version missing on npm is published", names.includes("@querykitjs/zod"), names.join());
check("a version already on npm is skipped", !names.includes("@querykitjs/core") && lines.includes("✓ @querykitjs/core@1.2.0 already on npm — skip"));

print(`\npublish plan: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
