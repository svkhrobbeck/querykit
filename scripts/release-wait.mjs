/**
 * Waits for the CI run of the current commit (`.github/workflows/ci.yaml`, whose
 * `release` job publishes to npm) and exits with its result — for `/miq:deployer npm`
 * after the push. Read-only: it only asks GitHub (`gh`) about the run.
 *
 *   node scripts/release-wait.mjs
 *
 * Exit 0 — the run succeeded · 1 — it failed, or no run appeared within 15 minutes ·
 * 2 — `gh` is missing or not logged in.
 */
import { spawnSync } from "node:child_process";
import { writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = "ci.yaml";
const POLL_INTERVAL_MS = 30_000;
const FIND_RUN_TIMEOUT_MS = 15 * 60_000;

// `process.exit` right after a write can lose output on Windows pipes; write synchronously.
const print = text => writeSync(1, `${text}\n`);

function gh(args, options = {}) {
  return spawnSync("gh", args, { cwd: ROOT, encoding: "utf8", ...options });
}

/** The CI run id for `sha`, or `undefined` while GitHub has not created it yet. */
function findRun(sha) {
  const result = gh(["run", "list", "--commit", sha, "--workflow", WORKFLOW, "--json", "databaseId,status", "--limit", "1"]);
  if (result.status !== 0) throw new Error(`gh run list failed: ${(result.stderr ?? "").trim()}`);
  return JSON.parse(result.stdout)[0]?.databaseId;
}

async function main() {
  const auth = gh(["auth", "status"]);
  if (auth.error || auth.status !== 0) {
    print(auth.error ? "gh is not installed — install the GitHub CLI, then run `gh auth login`" : "gh is not logged in — run `gh auth login`");
    return 2;
  }

  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (head.status !== 0) throw new Error(`git rev-parse HEAD failed: ${(head.stderr ?? "").trim()}`);
  const sha = head.stdout.trim();
  const deadline = Date.now() + FIND_RUN_TIMEOUT_MS;
  let runId = findRun(sha);
  while (runId === undefined && Date.now() < deadline) {
    print(`no ${WORKFLOW} run for ${sha.slice(0, 7)} yet — checking again in ${POLL_INTERVAL_MS / 1000} s`);
    await sleep(POLL_INTERVAL_MS);
    runId = findRun(sha);
  }
  if (runId === undefined) {
    print(`no ${WORKFLOW} run for ${sha.slice(0, 7)} within ${FIND_RUN_TIMEOUT_MS / 60_000} min — was the commit pushed?`);
    return 1;
  }

  print(`watching ${WORKFLOW} run ${runId} for ${sha.slice(0, 7)}`);
  const watch = gh(["run", "watch", String(runId), "--exit-status"], { stdio: "inherit" });
  return watch.status === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  print(`release-wait: ${error.message}`);
  process.exitCode = 1;
}
