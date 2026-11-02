/**
 * Postgres smoke "playground": runs the drizzle-pg and prisma-pg real-DB smoke
 * tests against a throw-away PostgreSQL cluster — no database or password of yours.
 *
 *   bun run test:smoke:pg
 *
 * The cluster lives in a fresh OS temp folder, on a free local port, with a random
 * user and password that are never printed or written by this script. Order:
 * drizzle-pg → prisma-pg (Prisma 7, this repo) → prisma-pg (Prisma 6, the
 * `test:matrix` old-end workspace, rebuilt so it matches the current sources).
 * The cluster is stopped and its folder removed even when a step fails.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import EmbeddedPostgres from "embedded-postgres";

import { EDGES, oldEndWorkspace } from "./test-matrix.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const DATABASE = "querykit_smoke";
// An identifier cannot be a bind parameter, so the statement is a fixed string (SEC-06).
const CREATE_DATABASE_SQL = "CREATE DATABASE querykit_smoke";
const OUTPUT_TAIL_LINES = 30;
const PG_CTL_TIMEOUT_MS = 60_000;

// `process.exit` right after a write can lose output on Windows pipes; write synchronously.
const print = text => writeSync(1, `${text}\n`);

/** A port nobody listens on right now (the OS picks it). */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** Whether something still accepts connections on `port`. */
function portInUse(port) {
  return new Promise(resolveUse => {
    const server = createServer();
    server.once("error", () => resolveUse(true));
    server.listen(port, HOST, () => server.close(() => resolveUse(false)));
  });
}

/** `bun` is a `.cmd` shim on Windows, so it needs a shell — as one quoted command line. */
function bun(args, cwd, env) {
  const quoted = ["bun", ...args].map(part => `"${part.replaceAll('"', '\\"')}"`).join(" ");
  const result = spawnSync(quoted, { cwd, env: { ...process.env, ...env }, encoding: "utf8", shell: true });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** The `N passed, M failed` summary both smoke tests print last. */
function counts(output) {
  const match = [...output.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  return match ? `${match[1]} passed, ${match[2]} failed` : "no summary";
}

/** Runs a setup command; a failure stops that smoke step with the command's output. */
function mustRun(what, args, cwd) {
  const result = bun(args, cwd);
  if (!result.ok) throw new Error(`${what} failed:\n${result.output}`);
}

const PRISMA6 = EDGES.find(candidate => candidate.pkg === "prisma-pg" && candidate.deps);

/** Each smoke step: `prepare()` returns the folder to run `args` in. */
const SMOKE_STEPS = [
  { label: "drizzle-pg", prepare: () => ROOT, args: ["run", "--filter", "@querykitjs/drizzle-pg", "test:smoke"] },
  {
    label: "prisma-pg · Prisma 7 (repo)",
    prepare: () => {
      const pkgDir = join(ROOT, "packages", "prisma-pg");
      mustRun("Prisma 7 generate", ["run", "test:generate"], pkgDir);
      return pkgDir;
    },
    args: ["run", "test:smoke"],
  },
  {
    // The `test:matrix` old end, recreated from the current sources.
    label: `prisma-pg · ${PRISMA6.label}`,
    prepare: () => {
      // The old-end workspace resolves `@querykitjs/core/internal` through core's dist.
      mustRun("core build", ["run", "--filter", "@querykitjs/core", "build"], ROOT);
      const pkgDir = join(oldEndWorkspace(PRISMA6), "packages", "prisma-pg");
      mustRun("Prisma 6 generate", ["run", "test:generate"], pkgDir);
      return pkgDir;
    },
    args: ["run", "test/smoke.ts"],
  },
];

/** Every smoke step against the running cluster; a failed one does not stop the rest. */
function runSmokes(env) {
  return SMOKE_STEPS.map(step => {
    let cwd;
    try {
      cwd = step.prepare();
    } catch (error) {
      return { label: step.label, ok: false, summary: "setup failed", output: error.message };
    }
    const run = bun(step.args, cwd, env);
    return { label: step.label, ok: run.ok, summary: counts(run.output), output: run.output };
  });
}

/** `pg_ctl` from the platform binaries package that `embedded-postgres` installed. */
async function pgCtlBinary() {
  const os = process.platform === "win32" ? "windows" : process.platform;
  const requireFromLib = createRequire(import.meta.resolve("embedded-postgres"));
  const binaries = await import(pathToFileURL(requireFromLib.resolve(`@embedded-postgres/${os}-${process.arch}`)).href);
  return binaries.pg_ctl;
}

/**
 * `embedded-postgres` stops a cluster on Windows with `taskkill /f`, which leaves
 * PostgreSQL 18 I/O workers behind, so the cluster is started and stopped with
 * `pg_ctl` (a clean `fast` shutdown); the library only creates it.
 */
function pgCtl(binary, args) {
  const result = spawnSync(binary, args, { stdio: "ignore", timeout: PG_CTL_TIMEOUT_MS });
  if (result.status !== 0) throw new Error(`pg_ctl ${args[0]} failed (exit ${result.status ?? result.signal ?? result.error?.message})`);
}

/** The library's own `createDatabase` needs a cluster it started itself. */
async function createDatabase(client) {
  await client.connect();
  try {
    await client.query(CREATE_DATABASE_SQL);
  } finally {
    await client.end();
  }
}

async function main() {
  const user = `qk_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  const mask = text => text.replaceAll(password, "***").replaceAll(user, "***");
  const workDir = mkdtempSync(join(tmpdir(), "qk-smoke-pg-"));
  const databaseDir = join(workDir, "data");
  const port = await freePort();
  const clusterLog = [];
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user,
    password,
    onLog: message => clusterLog.push(String(message)),
    onError: message => clusterLog.push(String(message)),
  });
  const pgCtlPath = await pgCtlBinary();
  let started = false;
  const results = [];
  try {
    await pg.initialise();
    pgCtl(pgCtlPath, ["start", "-D", databaseDir, "-w", "-l", join(workDir, "server.log"), "-o", `-p ${port} -h ${HOST}`]);
    started = true;
    await createDatabase(pg.getPgClient("postgres", HOST));
    print(`Postgres ready: postgres://***@${HOST}:${port}/${DATABASE}`);
    results.push(...runSmokes({ DATABASE_URL: `postgres://${user}:${password}@${HOST}:${port}/${DATABASE}` }));
  } catch (error) {
    results.push({ label: "cluster", ok: false, summary: "start failed", output: `${clusterLog.join("\n")}\n${error.message}` });
  } finally {
    try {
      if (started) pgCtl(pgCtlPath, ["stop", "-D", databaseDir, "-m", "fast", "-w"]);
    } catch (error) {
      results.push({ label: "cluster stop", ok: false, summary: "stop failed", output: error.message });
    }
    rmSync(workDir, { recursive: true, force: true, maxRetries: 5 });
  }

  const cleaned = !existsSync(workDir) && !(await portInUse(port));
  results.push({ label: "cleanup (temp folder removed, port free)", ok: cleaned, summary: cleaned ? "clean" : "left behind" });

  report(results, mask);
}

/** One row per step, then the masked output tail of every failed one; exit 1 on any failure. */
function report(results, mask) {
  print("");
  for (const result of results) print(`${result.ok ? "✅" : "❌"} ${result.label} — ${result.summary}`);
  for (const result of results.filter(failed => !failed.ok && failed.output))
    print(`\n--- ${result.label}:\n${mask(result.output).split("\n").slice(-OUTPUT_TAIL_LINES).join("\n")}`);
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

await main();
