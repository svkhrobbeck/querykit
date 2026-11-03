/**
 * Filter hot path benchmark — informational, not in the gate.
 *
 *   bun --preload ./packages/mongoose/test/bun-v8-shim.ts packages/core/test/bench.ts  (mongodb shares the shim)
 *
 * One `findAll` with a 30-condition tree (the `maxConditions` limit, depth 4) through
 * each adapter's conformance harness: limit check, policy check, filter compilation
 * and the fake driver, as one repository call. Prints calls per second.
 */
import type { Call } from "./conformance/cases";
import type { Harness } from "./conformance/runner";

const DURATION_MS = 1000;
const WARMUP_CALLS = 200;

const conditions = (count: number, offset: number) => Array.from({ length: count }, (_, index) => ({ key: "age", operation: ">=", value: offset + index }));

/** 30 conditions: 10 in the root `and`, 10 under `or`, 10 under `not` → `and`. */
const TREE = { and: [...conditions(10, 0), { or: conditions(10, 10) }, { not: { and: conditions(10, 20) } }] };
const CALL = { method: "findAll", params: { filter: TREE } } as unknown as Call;

/** Harness modules by computed path, so core's typecheck does not pull in the adapters' ORMs. */
async function loadHarness(path: string, exportName: string): Promise<Harness> {
  const module = (await import(new URL(path, import.meta.url).href)) as Record<string, Harness>;
  return module[exportName]!;
}

async function callsPerSecond(harness: Harness): Promise<number> {
  const ignoreSkipped = () => {};
  for (let i = 0; i < WARMUP_CALLS; i++) await harness.run(CALL, {}, ignoreSkipped);
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < DURATION_MS) {
    await harness.run(CALL, {}, ignoreSkipped);
    calls++;
  }
  return Math.round(calls / ((performance.now() - start) / 1000));
}

const harnesses = await Promise.all([
  loadHarness("../../drizzle-pg/test/conformance.ts", "drizzleHarness"),
  loadHarness("../../prisma-pg/test/conformance.ts", "prismaHarness"),
  loadHarness("../../mongoose/test/conformance.ts", "mongooseHarness"),
  loadHarness("../../mongodb/test/conformance.ts", "mongodbHarness"),
]);
console.log(`bench: findAll, 30-condition tree, ${DURATION_MS} ms per adapter (fake drivers)`);
for (const harness of harnesses) console.log(`  ${harness.name.padEnd(10)} ${String(await callsPerSecond(harness)).padStart(8)} ops/s`);
