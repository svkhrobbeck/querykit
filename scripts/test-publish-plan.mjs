/**
 * Offline test of the CI publish plan (`scripts/lib/registry.mjs`): which packages
 * `ci-publish.mjs` publishes, which it leaves for a first publish by hand, that a failed
 * `npm publish` stays fatal, and what `release-check.mjs` reports for a name npm has never
 * seen. The registry is stubbed (an injected function or a local HTTP server) — no network, no npm.
 *
 *   bun run test:publish-plan
 */
import { spawn } from "node:child_process";
import { writeSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { isPlaceholderVersion, planPublish, publishablePackages, publishPlanned } from "./lib/registry.mjs";

const REGISTRY_LIB = new URL("./lib/registry.mjs", import.meta.url).href;
const RELEASE_CHECK = fileURLToPath(new URL("./release-check.mjs", import.meta.url));

const print = text => writeSync(1, `${text}\n`);
let failed = 0;
function check(label, ok, extra = "") {
  print(`${ok ? "✅" : "❌"} ${label}${!ok && extra ? ` — ${extra}` : ""}`);
  if (!ok) failed++;
}

/** Runs `node <args>` and resolves with its exit code and stdout (a non-zero exit is a result, not an error). */
function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout }));
  });
}

// The plan: placeholder → new name → version already on npm → publish.
const ON_NPM = new Set(["@querykitjs/core@1.2.0", "@querykitjs/zod@3.0.0"]);
const KNOWN_NAMES = new Set(["@querykitjs/core", "@querykitjs/web", "@querykitjs/zod"]);
const askedNewName = [];
const stubIsPublished = async (name, version) => ON_NPM.has(`${name}@${version}`);
const stubIsNewName = async name => {
  askedNewName.push(name);
  return !KNOWN_NAMES.has(name);
};
const pkg = (name, version) => ({ name: `@querykitjs/${name}`, version, dir: `/repo/packages/${name}` });
const pkgs = [pkg("x", "0.0.0"), pkg("mongodb", undefined), pkg("standard-schema", "1.0.0"), pkg("web", "4.1.0"), pkg("core", "2.1.0"), pkg("zod", "3.0.0")];
const lines = [];
const plan = await planPublish(pkgs, { isPublished: stubIsPublished, isNewName: stubIsNewName, log: line => lines.push(line) });
const names = plan.publish.map(p => p.name);

check("0.0.0 is a placeholder", isPlaceholderVersion("0.0.0") && isPlaceholderVersion(undefined) && !isPlaceholderVersion("1.0.0"));
check("plan = [core, web]", [...names].sort().join() === "@querykitjs/core,@querykitjs/web", names.join());
check("0.0.0 is not published and says why", lines.includes("⚠ @querykitjs/x@0.0.0 is an unreleased placeholder — skip"), lines.join(" | "));
check("a package without a version is not published", !names.includes("@querykitjs/mongodb"));
check("a placeholder never asks the registry", !askedNewName.includes("@querykitjs/x") && !askedNewName.includes("@querykitjs/mongodb"), askedNewName.join());
check(
  "a new name is left for a first publish by hand",
  plan.firstByHand.map(p => p.name).join() === "@querykitjs/standard-schema" &&
    lines.includes(
      "⚠ @querykitjs/standard-schema@1.0.0 is new on npm — CI cannot publish a new name (OIDC); first publish by hand: bun run release:first standard-schema",
    ),
  lines.join(" | "),
);
check("a version already on npm is skipped", !names.includes("@querykitjs/zod") && lines.includes("✓ @querykitjs/zod@3.0.0 already on npm — skip"));

// Publishing: core first; the first failed `npm publish` stops the run.
const published = [];
const failOnWeb = p => {
  if (p.name === "@querykitjs/web") throw new Error("npm publish failed: E403");
  published.push(p.name);
};
let thrown;
try {
  publishPlanned(plan.publish, { publish: failOnWeb, log: () => {} });
} catch (error) {
  thrown = error;
}
check("core is published first", published[0] === "@querykitjs/core", published.join());
check("a failed npm publish throws", thrown?.message === "npm publish failed: E403", String(thrown));
const failingRun = await runNode([
  "--input-type=module",
  "-e",
  `import { publishPlanned } from ${JSON.stringify(REGISTRY_LIB)};
   publishPlanned([{ name: "@querykitjs/web", version: "4.1.0" }], { publish: () => { throw new Error("E403"); }, log: () => {} });`,
]);
check("…and the process exits non-zero", failingRun.code !== 0, `exit ${failingRun.code}`);

// release-check against a local registry: every released package matches, core is a new name.
const local = new Map(publishablePackages().map(p => [p.name, p.version]));
const NEW_NAME = "@querykitjs/core";
const server = createServer((req, res) => {
  const [, encodedName, suffix] = req.url.split("/");
  const name = decodeURIComponent(encodedName);
  const version = local.get(name);
  if (suffix !== "latest" || name === NEW_NAME || version === undefined || isPlaceholderVersion(version)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name, version }));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const env = { QK_NPM_REGISTRY: `http://127.0.0.1:${server.address().port}` };
try {
  const checkRun = await runNode([RELEASE_CHECK], env);
  const coreRow = `| ${NEW_NAME} | ${local.get(NEW_NAME)} | — | not ok — new on npm, first publish by hand (bun run release:first core) |`;
  check("release-check: a new name is its own status", checkRun.stdout.includes(coreRow), checkRun.stdout);
  check(
    "release-check: a new name is not «all match», exit 1",
    checkRun.code === 1 && !/all \d+ packages match/.test(checkRun.stdout),
    `exit ${checkRun.code}`,
  );
  const placeholders = [...local].filter(([, version]) => isPlaceholderVersion(version)).map(([name]) => name);
  check(
    "release-check: a placeholder row is unchanged",
    placeholders.every(name => checkRun.stdout.includes(`| ${name} | ${local.get(name)} | — | not ok — placeholder, waiting for the version bump |`)),
    placeholders.join(),
  );
  const pendingRun = await runNode([RELEASE_CHECK, "--pending"], env);
  check(
    "release-check --pending: first publish by hand",
    pendingRun.code === 0 && pendingRun.stdout.includes(`| ${NEW_NAME} | ${local.get(NEW_NAME)} | — | first publish by hand |`),
    pendingRun.stdout,
  );
} finally {
  server.close();
}

print(`\npublish plan: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exitCode = 1;
