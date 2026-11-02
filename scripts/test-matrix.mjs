/**
 * Peer-range matrix: every adapter is typechecked and tested on **both ends**
 * of its peer range, and every published `.d.ts` is compiled by the oldest and
 * the newest supported TypeScript.
 *
 *   bun run test:matrix
 *
 * New end: the versions installed in this repo (the packages' devDependencies).
 * Old end: a throw-away workspace under the OS temp folder — the package and
 * `core` are copied there, the old peer versions are installed with a real
 * `bun install`, so the peer graph is exactly what a consumer gets (an npm
 * alias in this repo cannot do that: an aliased `react-router@7` still links
 * the repo's React 19 as its peer). Nothing in the repo or its lockfile changes.
 *
 * TypeScript: a consumer file imports each package's built `dist` and is
 * compiled by `typescript-59` (TS 5.9) and `typescript` (TS 6).
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = { 5.9: join(ROOT, "node_modules", "typescript-59", "bin", "tsc"), "6.0": join(ROOT, "node_modules", "typescript", "bin", "tsc") };
const WORK = join(tmpdir(), "qk-matrix");
const MONGO_SHIM = "../mongoose/test/bun-v8-shim.ts";
const SKIP_DIRS = new Set(["node_modules", "dist", ".cache", "generated"]);

/** `script:<name>` runs a package.json script; anything else is a test file run with bun. */
const PRISMA_RUNS = ["script:test:generate", "script:test:query", "script:test:types", "script:test:contract", "test/conformance.ts"];

/**
 * One end of one package's peer range: versions to install (old end), what to run,
 * the peers to report, and `extra` packages a test imports from (test:contract
 * drives drizzle-pg, mongoose and web from source).
 */
const EDGES = [
  { pkg: "drizzle-pg", label: "drizzle-orm 0.44.7", deps: { "drizzle-orm": "0.44.7" }, runs: ["test/sql.ts", "test/conformance.ts"] },
  { pkg: "drizzle-pg", label: "drizzle-orm 0.45.4", runs: ["test/sql.ts", "test/conformance.ts"] },
  {
    pkg: "mongoose",
    label: "mongoose 8.24.7",
    deps: { mongoose: "8.24.7" },
    runs: ["test/conformance.ts", "test/smoke.ts"],
    preload: "./test/bun-v8-shim.ts",
  },
  { pkg: "mongoose", label: "mongoose 9.11.4", runs: ["test/conformance.ts", "test/smoke.ts"], preload: "./test/bun-v8-shim.ts" },
  // mongodb's conformance reuses the mongoose adapter's in-memory matcher (test/fake-mongo.ts).
  {
    pkg: "mongodb",
    label: "mongodb 6.21.0",
    deps: { mongodb: "6.21.0" },
    runs: ["test/conformance.ts", "test/where.ts", "test/policy.ts"],
    preload: "./test/bun-v8-shim.ts",
    extra: ["mongoose"],
  },
  {
    pkg: "mongodb",
    label: "mongodb 7.7.0",
    runs: ["test/conformance.ts", "test/where.ts", "test/policy.ts"],
    preload: "./test/bun-v8-shim.ts",
    extra: ["mongoose"],
  },
  {
    pkg: "class-validator",
    label: "class-validator 0.14.4 + reflect-metadata 0.1.14",
    deps: { "class-validator": "0.14.4", "reflect-metadata": "0.1.14" },
    runs: ["../smoke.ts"],
    cwd: "test/.bun",
  },
  { pkg: "class-validator", label: "class-validator 0.15.1 + reflect-metadata 0.2.2", runs: ["../smoke.ts"], cwd: "test/.bun" },
  {
    pkg: "web",
    label: "react 18.3.1 + react-router 7.18.5",
    deps: { react: "18.3.1", "react-dom": "18.3.1", "@types/react": "18.3.31", "@types/react-dom": "18.3.7", "react-router": "7.18.5" },
    runs: ["test/smoke.ts", "test/hook.ts"],
  },
  { pkg: "web", label: "react 19.3.1 + react-router 8.5.1", runs: ["test/smoke.ts", "test/hook.ts"] },
  { pkg: "zod", label: "zod 4.6.7", runs: ["test/smoke.ts"] },
  {
    pkg: "prisma-pg",
    label: "Prisma 6.19.3",
    deps: { "@prisma/client": "6.19.3", prisma: "6.19.3", "@prisma/adapter-pg": "6.19.3" },
    peers: ["@prisma/client", "prisma", "@prisma/adapter-pg"],
    extra: ["drizzle-pg", "mongoose", "web"],
    // Prisma 6 requires the datasource `url` in the schema; Prisma 7 rejects it (prisma.config.ts).
    prepare: dir => {
      const schema = join(dir, "packages", "prisma-pg", "test", "prisma", "schema.prisma");
      const datasource = 'provider = "postgresql"';
      writeFileSync(schema, readFileSync(schema, "utf8").replace(datasource, `${datasource}\n  url      = env("DATABASE_URL")`));
    },
    runs: PRISMA_RUNS,
  },
  { pkg: "prisma-pg", label: "Prisma 7.10.1", peers: ["@prisma/client", "prisma", "@prisma/adapter-pg"], runs: PRISMA_RUNS },
];

const CONSUMER_ENTRIES = {
  core: ["@querykitjs/core"],
  zod: ["@querykitjs/zod"],
  "class-validator": ["@querykitjs/class-validator"],
  "drizzle-pg": ["@querykitjs/drizzle-pg"],
  "prisma-pg": ["@querykitjs/prisma-pg"],
  mongoose: ["@querykitjs/mongoose"],
  mongodb: ["@querykitjs/mongodb", "@querykitjs/mongodb/testing"],
  web: ["@querykitjs/web", "@querykitjs/web/react"],
};

// `process.exit` right after a write can lose output on Windows pipes; write synchronously.
const print = text => writeSync(1, `${text}\n`);
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

/** `bun` is a `.cmd` shim on Windows, so it needs a shell — as one quoted command line (no unescaped args). */
function run(command, args, cwd) {
  const viaShell = process.platform === "win32" && command === "bun";
  const quoted = [command, ...args].map(part => `"${part.replaceAll('"', '\\"')}"`).join(" ");
  const result = viaShell ? spawnSync(quoted, { cwd, encoding: "utf8", shell: true }) : spawnSync(command, args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** A copy of `core` and the package under test, with the old peer versions as its devDependencies. */
function oldEndWorkspace(edge) {
  const dir = join(WORK, `${edge.pkg}-old`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "packages"), { recursive: true });
  const copy = name =>
    cpSync(join(ROOT, "packages", name), join(dir, "packages", name), { recursive: true, filter: src => !SKIP_DIRS.has(src.split(/[\\/]/).pop()) });
  for (const name of new Set(["core", edge.pkg, ...(edge.extra ?? [])])) copy(name);
  // Adapters import `@querykitjs/core/internal`, which bun resolves through core's
  // package exports (dist) — so the old end gets the dist built at the start of the run.
  cpSync(join(ROOT, "packages", "core", "dist"), join(dir, "packages", "core", "dist"), { recursive: true });
  if (!(edge.extra ?? []).includes("mongoose") && (edge.pkg === "mongoose" || edge.pkg === "drizzle-pg"))
    cpSync(join(ROOT, "packages", "mongoose", "test", "bun-v8-shim.ts"), join(dir, MONGO_SHIM.replace("..", "packages")));
  cpSync(join(ROOT, "tsconfig.base.json"), join(dir, "tsconfig.base.json"));

  const manifestPath = join(dir, "packages", edge.pkg, "package.json");
  const manifest = readJson(manifestPath);
  manifest.devDependencies = { ...manifest.devDependencies, ...edge.deps };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const rootManifest = readJson(join(ROOT, "package.json"));
  const typesNode = rootManifest.devDependencies["@types/node"];
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "qk-matrix", private: true, workspaces: ["packages/*"], devDependencies: { "@types/node": typesNode } }, null, 2),
  );

  edge.prepare?.(dir);
  const install = run("bun", ["install", "--ignore-scripts"], dir);
  if (!install.ok) throw new Error(`bun install failed for ${edge.label}:\n${install.output}`);
  return dir;
}

/** The versions the package under test actually resolves — proof of which end ran. */
function resolvedVersions(pkgDir, names) {
  return names
    .map(name => {
      const file = [join(pkgDir, "node_modules", name, "package.json"), join(pkgDir, "..", "..", "node_modules", name, "package.json")].find(existsSync);
      return `${name}@${file ? readJson(file).version : "?"}`;
    })
    .join(", ");
}

function runEdge(edge) {
  const root = edge.deps ? oldEndWorkspace(edge) : ROOT;
  const pkgDir = join(root, "packages", edge.pkg);
  const steps = [["typecheck", run("node", [TSC["6.0"], "--noEmit", "-p", pkgDir], pkgDir)]];
  for (const entry of edge.runs) {
    const script = entry.startsWith("script:") ? entry.slice("script:".length) : undefined;
    const args = script ? ["run", script] : edge.preload ? ["--preload", edge.preload, entry] : [entry];
    steps.push([script ?? entry, run("bun", args, join(pkgDir, edge.cwd ?? ""))]);
  }
  const peers = edge.peers ?? (Object.keys(edge.deps ?? {}).length ? Object.keys(edge.deps) : edge.label.split(" + ").map(part => part.split(" ")[0]));
  const ok = steps.every(([, step]) => step.ok);
  print(
    `${ok ? "✅" : "❌"} ${edge.pkg} · ${edge.label} (resolved ${resolvedVersions(pkgDir, peers)}) — ${steps.map(([name, step]) => `${name} ${step.ok ? "✓" : "✗"}`).join(", ")}`,
  );
  for (const [name, step] of steps) if (!step.ok) print(`   ${name}:\n${step.output.split("\n").slice(-25).join("\n")}`);
  return ok;
}

/** Each package's published `.d.ts`, imported the way a consumer does, compiled by one TypeScript. */
function runConsumers(version) {
  const dir = join(WORK, `consumer-ts-${version}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const paths = {};
  const files = [];
  for (const [pkg, entries] of Object.entries(CONSUMER_ENTRIES)) {
    entries.forEach((entry, index) => {
      const sub = entry.split("/").slice(2).join("/");
      // A subpath builds to `dist/<sub>/index.d.ts` (web/react) or `dist/<sub>.d.ts` (mongodb/testing).
      const nested = join(ROOT, "packages", pkg, "dist", sub, "index.d.ts");
      const types = sub && !existsSync(nested) ? join(ROOT, "packages", pkg, "dist", `${sub}.d.ts`) : nested;
      paths[entry] = [types.split("\\").join("/")];
      const file = `${pkg}-${index}.ts`;
      writeFileSync(
        join(dir, file),
        `import * as surface from "${entry}";\nexport type Surface = typeof surface;\nexport const names: string[] = Object.keys(surface);\n`,
      );
      files.push(file);
    });
  }
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM"],
      types: ["node"],
      typeRoots: [join(ROOT, "node_modules", "@types").split("\\").join("/")],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      paths,
    },
    files,
  };
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  const result = run("node", [TSC[version], "-p", dir], ROOT);
  // Only our published `.d.ts` is judged; a third-party package's own declaration
  // errors (drizzle-orm's sqlite-core under `skipLibCheck: false`) are counted, not failed.
  const errors = result.output.split("\n").filter(line => /error TS\d+/.test(line));
  const ours = errors.filter(line => !line.includes("node_modules"));
  const ok = result.ok || (errors.length > 0 && ours.length === 0);
  const thirdParty = errors.length - ours.length;
  print(
    `${ok ? "✅" : "❌"} consumer .d.ts · TypeScript ${version} (${files.length} entries${thirdParty ? `; ${thirdParty} third-party declaration errors ignored` : ""})`,
  );
  for (const line of ours.slice(0, 25)) print(`   ${line}`);
  if (!result.ok && errors.length === 0) print(result.output.split("\n").slice(-25).join("\n"));
  return ok;
}

mkdirSync(WORK, { recursive: true });
const build = run("bun", ["run", "build"], ROOT);
if (!build.ok) {
  print(`❌ build failed:\n${build.output.split("\n").slice(-25).join("\n")}`);
  process.exitCode = 1;
} else {
  const results = [...EDGES.map(runEdge), runConsumers("5.9"), runConsumers("6.0")];
  const failed = results.filter(ok => !ok).length;
  print(`\ntest:matrix: ${results.length - failed}/${results.length} passed`);
  if (failed > 0) process.exitCode = 1;
}
