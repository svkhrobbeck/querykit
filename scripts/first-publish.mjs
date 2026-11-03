/**
 * First publish of a package name npm has never seen. Trusted publishing (OIDC)
 * can be set up only for a package that already exists, so its first version
 * is published by hand — from the tarball this script prepares. It never
 * publishes and never calls the registry.
 *
 *   bun run release:first <pkg>          e.g. standard-schema or @querykitjs/standard-schema
 *   node scripts/first-publish.mjs --self-test
 *
 * 1. Copies the package's `files` and its `package.json` to a temp folder, with every
 *    `workspace:` dependency pinned to `^<that package's version>` (the same rule as
 *    `pin-workspace-deps.mjs`, which only runs on CI).
 * 2. `npm pack` there (registry unreachable, scripts off), into a new temp folder.
 * 3. Reads `package/package.json` back out of the tarball: a `workspace:` range left ⇒ exit 1.
 * 4. Prints the commands the user runs: `npm publish <tgz> --access public`, then the
 *    trusted-publisher setup on npmjs.com.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];
/** Nothing listens here: if `npm pack` tried the network, it would fail. */
const NO_REGISTRY = "http://127.0.0.1:9/";
const TAR_BLOCK = 512;

const print = text => writeSync(1, `${text}\n`);
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** Workspace package name → version. */
function workspaceVersions(packagesDir) {
  const versions = new Map();
  for (const dir of readdirSync(packagesDir)) {
    const file = join(packagesDir, dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = readJson(file);
    versions.set(pkg.name, pkg.version);
  }
  return versions;
}

function pinWorkspaceDeps(pkg, versions) {
  for (const field of DEP_FIELDS) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:") && versions.has(name)) pkg[field][name] = `^${versions.get(name)}`;
    }
  }
  return pkg;
}

/** `package/package.json` from a `.tgz`: gunzip, then walk the 512-byte tar headers. */
function readPackedManifest(tarball) {
  const tar = gunzipSync(readFileSync(tarball));
  for (let offset = 0; offset + TAR_BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const size = Number.parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const start = offset + TAR_BLOCK;
    if (name === "package/package.json") return JSON.parse(tar.subarray(start, start + size).toString("utf8"));
    offset = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
  }
  throw new Error(`${tarball}: no package/package.json`);
}

const workspaceRanges = manifest =>
  DEP_FIELDS.flatMap(field =>
    Object.entries(manifest[field] ?? {})
      .filter(([, range]) => String(range).startsWith("workspace:"))
      .map(([name, range]) => `${field}.${name}: ${range}`),
  );

/** npm's own CLI next to this node, run without a shell (no argument concatenation); else `npm` from PATH. */
const NPM_CLI = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function npmPack(cwd, destination) {
  const args = ["pack", "--pack-destination", destination, "--json"];
  const [command, commandArgs] = existsSync(NPM_CLI) ? [process.execPath, [NPM_CLI, ...args]] : ["npm", args];
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_registry: NO_REGISTRY, npm_config_offline: "true", npm_config_ignore_scripts: "true" },
  });
  if (result.status !== 0) throw new Error(`npm pack failed: ${result.stderr || result.stdout}`);
  return join(destination, JSON.parse(result.stdout)[0].filename);
}

/** Prepares the tarball; returns `{ code, tarball?, manifest?, problems }` — never exits. */
export function prepareFirstPublish(pkgArg, { packagesDir = join(ROOT, "packages"), out = mkdtempSync(join(tmpdir(), "querykit-first-publish-")) } = {}) {
  const dir = pkgArg.replace(/^@querykitjs\//, "");
  const pkgDir = join(packagesDir, dir);
  if (!existsSync(join(pkgDir, "package.json"))) return { code: 2, problems: [`no package at ${pkgDir}`] };

  const pkg = pinWorkspaceDeps(readJson(join(pkgDir, "package.json")), workspaceVersions(packagesDir));
  const missing = (pkg.files ?? []).filter(entry => !existsSync(join(pkgDir, entry)));
  if (missing.length) return { code: 2, problems: [`missing ${missing.join(", ")} — run \`bun run build\` first`] };

  const staging = mkdtempSync(join(tmpdir(), "querykit-first-publish-src-"));
  try {
    for (const entry of pkg.files ?? []) cpSync(join(pkgDir, entry), join(staging, entry), { recursive: true });
    writeFileSync(join(staging, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
    mkdirSync(out, { recursive: true });
    const tarball = npmPack(staging, out);
    const manifest = readPackedManifest(tarball);
    const left = workspaceRanges(manifest);
    return { code: left.length ? 1 : 0, tarball, manifest, problems: left.map(range => `workspace range left in the tarball: ${range}`) };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function main(pkgArg) {
  const result = prepareFirstPublish(pkgArg);
  for (const problem of result.problems) print(`❌ ${problem}`);
  if (result.code !== 0) return result.code;

  const { name, version, dependencies = {} } = result.manifest;
  print(`✅ ${name}@${version} packed: ${result.tarball}`);
  for (const [dep, range] of Object.entries(dependencies)) print(`   dependency ${dep} ${range}`);
  if (version === "0.0.0") print(`⚠ version 0.0.0 is the unreleased placeholder — run \`bun run version-packages\` first, then pack again`);
  print("\nNothing was published. To publish this first version yourself:");
  print(`  1. npm publish "${result.tarball}" --access public`);
  print(`  2. npmjs.com → ${name} → Settings → Trusted publishing: GitHub Actions, repository svkhrobbeck/querykit, workflow ci.yaml`);
  print("  3. Later versions are published by CI (OIDC) as for every other package.");
  return 0;
}

/** Runs against the real package and a fake one whose `workspace:` dependency cannot be pinned. */
function selfTest() {
  let failed = 0;
  const check = (label, ok, extra = "") => {
    print(`${ok ? "✅" : "❌"} [first-publish] ${label}${extra ? ` — ${extra}` : ""}`);
    if (!ok) failed++;
  };
  const scratch = mkdtempSync(join(tmpdir(), "querykit-first-publish-test-"));
  try {
    const coreVersion = readJson(join(ROOT, "packages", "core", "package.json")).version;
    const real = prepareFirstPublish("standard-schema", { out: join(scratch, "real") });
    check("standard-schema packs with no workspace range", real.code === 0, real.problems.join("; "));
    check(
      `@querykitjs/core pinned to ^${coreVersion}`,
      real.manifest?.dependencies?.["@querykitjs/core"] === `^${coreVersion}`,
      JSON.stringify(real.manifest?.dependencies),
    );

    const fakePackages = join(scratch, "packages");
    mkdirSync(join(fakePackages, "fake"), { recursive: true });
    writeFileSync(join(fakePackages, "fake", "index.js"), "export {};\n");
    writeFileSync(
      join(fakePackages, "fake", "package.json"),
      JSON.stringify({ name: "@querykitjs/fake", version: "1.0.0", files: ["index.js"], dependencies: { "@querykitjs/not-in-workspace": "workspace:*" } }),
    );
    const fake = prepareFirstPublish("fake", { packagesDir: fakePackages, out: join(scratch, "fake-out") });
    check("a workspace range left in the tarball ⇒ exit 1", fake.code === 1, fake.problems.join("; "));
    check(
      "…and names it",
      fake.problems.some(problem => problem.includes("@querykitjs/not-in-workspace")),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (arg === "--self-test") process.exitCode = selfTest();
  else if (!arg) {
    print("usage: bun run release:first <pkg>");
    process.exitCode = 2;
  } else process.exitCode = main(arg);
}
