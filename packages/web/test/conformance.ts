/**
 * Web ↔ backend conformance — **no database required**.
 *
 *   bun --preload ./packages/mongoose/test/bun-v8-shim.ts packages/web/test/conformance.ts
 *
 * Every table case is rebuilt with the `@querykitjs/web` builder for its
 * pagination mode (`buildListParams` / `buildInfiniteParams` /
 * `buildCursorParams`; a plain `findAll` case becomes a one-page list), sent
 * through `JSON.parse(JSON.stringify(...))` (the wire), checked against the
 * table input, and then run on all three adapter harnesses — the rows must be
 * the ones the table expects.
 */
import type { Call, ConformanceCase } from "../../core/test/conformance/cases";
import { CASES } from "../../core/test/conformance/cases";
import { CURSOR_CASES } from "../../core/test/conformance/cases-cursor";
import { MUTATION_CASES } from "../../core/test/conformance/cases-mutation";
import { POLICY_CASES } from "../../core/test/conformance/cases-policy";
import { SCOPE_CASES } from "../../core/test/conformance/cases-scope";
import { runConformance, type Harness } from "../../core/test/conformance/runner";
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE } from "../../core/src/defaults";
import type { FieldCondition, Filter, FilterNode, SortItem } from "../../core/src/types";
import { buildCursorParams, buildInfiniteParams, buildListParams } from "../src/query";
import { createRegistry } from "../src/registry";

/** One page large enough for the whole fixture, so a `findAll` case keeps all its rows. */
const ONE_PAGE = 50;

const overTheWire = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

/** The table input in the canonical form the builders emit: explicit `operation`, explicit `direction`. */
function canonicalNode(node: FilterNode): FilterNode {
  if ("and" in node) return { and: node.and.map(canonicalNode) };
  if ("or" in node) return { or: node.or.map(canonicalNode) };
  if ("not" in node) return { not: canonicalNode(node.not) };
  const { key, operation = "=", value } = node as FieldCondition;
  return value === undefined ? { key, operation } : { key, operation, value };
}
const canonicalFilter = (filter: Filter | undefined) => (filter === undefined ? [] : Array.isArray(filter) ? filter.map(canonicalNode) : canonicalNode(filter));
/** Items without a `key` (`null`, `{}`) are dropped by the builder, as by every adapter. */
const canonicalSort = (sort: SortItem[]) => sort.filter(item => item && item.key).map(item => ({ key: item.key, direction: item.direction ?? "asc" }));

/** What the builder must emit for one table field: canonical filter/sort, page sizes capped like the backend caps them. */
function expectedField(key: string, value: unknown): unknown {
  if (key === "filter") return canonicalFilter(value as Filter);
  if (key === "sort") return canonicalSort(value as SortItem[]);
  if (key === "perPage") return Math.min(value as number, DEFAULT_MAX_PER_PAGE);
  if (key === "limit") return Math.min(value as number, DEFAULT_MAX_LIMIT);
  return value;
}

/** Fields of the table input the payload must carry. */
function payloadMismatches(input: Record<string, unknown>, payload: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const want = expectedField(key, value);
    if (JSON.stringify(payload[key]) !== JSON.stringify(want)) problems.push(`${key}: payload ${JSON.stringify(payload[key])}, table ${JSON.stringify(want)}`);
  }
  return problems;
}

/**
 * The list builder for a case: a case with registry `timestamps` is built by a registry
 * configured the same way, so its default sort names the same createdAt field (task 015).
 */
function listBuilderFor(testCase: ConformanceCase): (params: never) => unknown {
  const createdAt = testCase.options?.timestamps?.createdAt;
  if (!createdAt) return buildListParams;
  const resource = createRegistry({ adapter: "drizzle-pg", timestamps: { createdAt } }).resource("conformance");
  return params => resource.list(params);
}

type WebCase = { testCase: ConformanceCase; builder: string; input: Record<string, unknown>; payload: Record<string, unknown> };

function toWebCase(testCase: ConformanceCase): WebCase {
  const { call } = testCase;
  switch (call.method) {
    case "findList":
      return {
        testCase,
        builder: "buildListParams",
        input: call.params as Record<string, unknown>,
        payload: overTheWire(listBuilderFor(testCase)(call.params as never)) as never,
      };
    case "findInfinite":
      return {
        testCase,
        builder: "buildInfiniteParams",
        input: call.params as Record<string, unknown>,
        payload: overTheWire(buildInfiniteParams(call.params as never)) as never,
      };
    case "findCursor":
      return {
        testCase,
        builder: "buildCursorParams",
        input: call.params as Record<string, unknown>,
        payload: overTheWire(buildCursorParams(call.params as never)) as never,
      };
    case "findAll": {
      const input = { ...call.params, page: 1, perPage: ONE_PAGE } as Record<string, unknown>;
      return { testCase, builder: "buildListParams", input, payload: overTheWire(listBuilderFor(testCase)(input as never)) as never };
    }
    default:
      throw new Error(`web conformance: ${call.method} is not built by web (mark it notBuiltByWeb)`);
  }
}

/** The table case re-pointed at the web payload; a `findAll` case drops its meta (it is now a page). */
function asTableCase({ testCase, builder, payload }: WebCase): ConformanceCase {
  const call = { ...testCase.call, method: testCase.call.method === "findAll" ? "findList" : testCase.call.method, params: payload } as Call;
  const expect = testCase.call.method === "findAll" ? { ...testCase.expect, meta: undefined } : testCase.expect;
  return { ...testCase, name: `${builder}: ${testCase.name}`, call, expect };
}

/**
 * Harness modules are loaded by a computed path so this package's typecheck
 * does not pull in the adapters' ORMs and the generated Prisma client.
 */
async function loadHarness(path: string, exportName: string): Promise<Harness> {
  const module = (await import(new URL(path, import.meta.url).href)) as Record<string, Harness>;
  return module[exportName]!;
}

const webCases = CASES.filter(testCase => !testCase.notBuiltByWeb).map(toWebCase);
let shapeFailures = 0;
for (const webCase of webCases) {
  const problems = payloadMismatches(webCase.input, webCase.payload);
  if (problems.length > 0) {
    shapeFailures++;
    console.log(`❌ [web] ${webCase.builder}: ${webCase.testCase.name} — ${problems.join("; ")}`);
  }
}
const builders = new Set(webCases.map(webCase => webCase.builder));
console.log(`web payloads: ${webCases.length - shapeFailures}/${webCases.length} equal the table input (${[...builders].join(", ")})`);

/** Cases added by tasks 008–014 (limits under a policy, policy, cursor, mutations, scope). */
const HARDENING_CASES = [...POLICY_CASES, ...CURSOR_CASES, ...MUTATION_CASES, ...SCOPE_CASES];
const hardeningOnWeb = HARDENING_CASES.filter(testCase => !testCase.notBuiltByWeb).length;
console.log(
  `008–014 cases: ${hardeningOnWeb} built by web × 3 adapters, ${HARDENING_CASES.length - hardeningOnWeb} repository-only (mutations, multi-page walks, keyless payloads)`,
);

const harnesses = await Promise.all([
  loadHarness("../../drizzle-pg/test/conformance.ts", "drizzleHarness"),
  loadHarness("../../prisma-pg/test/conformance.ts", "prismaHarness"),
  loadHarness("../../mongoose/test/conformance.ts", "mongooseHarness"),
]);
const tableCases = webCases.map(asTableCase);
console.log("web payloads through each adapter:");
let failed = shapeFailures;
for (const harness of harnesses) failed += (await runConformance(harness, tableCases)).failed;
if (failed > 0) process.exitCode = 1;
