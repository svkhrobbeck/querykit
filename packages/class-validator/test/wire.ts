/**
 * The shared wire table (`cases-wire.ts`) on the pure core of this package:
 * every filter and sort row must report exactly the table's `{ path, key }`
 * (prefixed with the root), and the full `ValidationIssue[]` — path string,
 * key, message, args — must equal `wire-snapshot.json` byte for byte, so the
 * public output never drifts. `bun ../wire.ts --write` (from `test/.bun`)
 * rewrites the snapshot. Imported by `smoke.ts`; sets `process.exitCode` on failure.
 */
import "reflect-metadata";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WIRE_FILTER_CASES, WIRE_SORT_CASES, type WireExpectedIssue } from "../../core/test/conformance/cases-wire";
import { validateFilter, validateSort, type ValidationIssue } from "../src/index";

const SNAPSHOT = fileURLToPath(new URL("./wire-snapshot.json", import.meta.url));

const joinPath = (root: string, path: WireExpectedIssue["path"]): string =>
  path.reduce<string>((joined, part) => (typeof part === "number" ? `${joined}[${part}]` : `${joined}.${part}`), root);

const actual: Record<string, ValidationIssue[]> = {};
const problems: string[] = [];

const judge = (name: string, issues: ValidationIssue[], root: string, expect: WireExpectedIssue[]): void => {
  actual[name] = issues;
  const got = JSON.stringify(issues.map(({ path, key }) => ({ path, key })));
  const want = JSON.stringify(expect.map(({ path, key }) => ({ path: joinPath(root, path), key })));
  if (got !== want) problems.push(`${name}: got ${got}, want ${want}`);
};

for (const testCase of WIRE_FILTER_CASES) {
  judge(testCase.name, validateFilter(testCase.value, { ...testCase.options, ...testCase.limits }), "filter", testCase.expect);
}
for (const testCase of WIRE_SORT_CASES) {
  judge(testCase.name, validateSort(testCase.value, { allowedKeys: testCase.allowedKeys, ...testCase.limits }), "sort", testCase.expect);
}

const serialized = `${JSON.stringify(actual, null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(SNAPSHOT, serialized);
  console.log(`wire snapshot written: ${Object.keys(actual).length} cases`);
} else if (JSON.stringify(JSON.parse(readFileSync(SNAPSHOT, "utf8"))) !== JSON.stringify(actual)) {
  problems.push("validateFilter / validateSort output differs from wire-snapshot.json");
}

for (const problem of problems) console.log(`❌ [class-validator wire] ${problem}`);
console.log(`${problems.length ? "❌" : "✅"} [class-validator wire] ${Object.keys(actual).length} cases`);
if (problems.length) process.exitCode = 1;
