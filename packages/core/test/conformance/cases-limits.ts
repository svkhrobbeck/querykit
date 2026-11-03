/**
 * Request-limit table: one wire payload per case and whether a
 * validator must accept or reject it under the core default limits (or the
 * case's own `limits` override). Pure data — `@querykitjs/zod`,
 * `@querykitjs/class-validator` and `@querykitjs/web` each run it with their own
 * judge (`limits-runner.ts`). The adapters get the same limits server-side in
 * 009–011; until then this table is not part of the adapter `CASES`.
 */
import type { FieldCondition, FilterNode, SortItem, WireInfiniteParams, WireOffsetParams } from "../../src/types";

export type LimitName = "maxDepth" | "maxConditions" | "maxInItems" | "maxStringLength" | "maxOffset" | "maxSortFields";

/** Which part of the request the case exercises — `infinite` is the only one sent as infinite params. */
export type LimitKind = "filter" | "sort" | "offset" | "infinite";

export interface LimitCase {
  name: string;
  limit: LimitName;
  kind: LimitKind;
  params: WireOffsetParams | WireInfiniteParams;
  /** Override of the core defaults for this case only. */
  limits?: Partial<Record<LimitName, number>>;
  verdict: "ok" | "reject";
}

/** A tree whose longest root-to-leaf path has exactly `depth` nodes: `depth - 1` × `not`, then a condition. */
export function notChain(depth: number): FilterNode {
  let node: FilterNode = { key: "name", operation: "=", value: "a" };
  for (let level = 1; level < depth; level++) node = { not: node };
  return node;
}

/** The same depth built from one-element `and` groups. */
function andChain(depth: number): FilterNode {
  let node: FilterNode = { key: "name", operation: "=", value: "a" };
  for (let level = 1; level < depth; level++) node = { and: [node] };
  return node;
}

const conditions = (count: number): FieldCondition[] => Array.from({ length: count }, (_, index) => ({ key: "age", operation: ">", value: index }));
const ids = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);
const text = (length: number): string => "a".repeat(length);
const sortFields = (count: number): SortItem[] => ["name", "age", "createdAt", "id", "status"].slice(0, count).map(key => ({ key, direction: "asc" }));

const filterCase = (
  name: string,
  limit: LimitName,
  filter: WireOffsetParams["filter"],
  verdict: LimitCase["verdict"],
  limits?: LimitCase["limits"],
): LimitCase => ({
  name,
  limit,
  kind: "filter",
  params: { filter },
  verdict,
  ...(limits ? { limits } : {}),
});

const DEPTH_CASES: LimitCase[] = [
  filterCase("depth 5 (not chain) passes", "maxDepth", notChain(5), "ok"),
  filterCase("depth 6 (not chain) is rejected", "maxDepth", notChain(6), "reject"),
  filterCase("depth 5 (and chain) passes", "maxDepth", andChain(5), "ok"),
  filterCase("depth 6 (and chain) is rejected", "maxDepth", andChain(6), "reject"),
  filterCase("depth override 3: depth 4 is rejected", "maxDepth", notChain(4), "reject", { maxDepth: 3 }),
];

const CONDITION_CASES: LimitCase[] = [
  filterCase("30 conditions (flat) pass", "maxConditions", conditions(30), "ok"),
  filterCase("31 conditions (flat) are rejected", "maxConditions", conditions(31), "reject"),
  filterCase("31 conditions across nested groups are rejected", "maxConditions", { and: [{ or: conditions(16) }, { not: { and: conditions(15) } }] }, "reject"),
  filterCase("30 conditions across nested groups pass", "maxConditions", { and: [{ or: conditions(15) }, { not: { and: conditions(15) } }] }, "ok"),
  filterCase("override maxConditions 2: 3 conditions are rejected", "maxConditions", conditions(3), "reject", { maxConditions: 2 }),
];

const IN_CASES: LimitCase[] = [
  filterCase("in with 200 items passes", "maxInItems", [{ key: "id", operation: "in", value: ids(200) }], "ok"),
  filterCase("in with 201 items is rejected", "maxInItems", [{ key: "id", operation: "in", value: ids(201) }], "reject"),
  filterCase("override maxInItems 50: 50 items pass", "maxInItems", [{ key: "id", operation: "in", value: ids(50) }], "ok", { maxInItems: 50 }),
  filterCase("override maxInItems 50: 51 items are rejected", "maxInItems", [{ key: "id", operation: "in", value: ids(51) }], "reject", { maxInItems: 50 }),
];

const STRING_CASES: LimitCase[] = [
  filterCase("256-char string passes", "maxStringLength", [{ key: "name", operation: "%_%", value: text(256) }], "ok"),
  filterCase("257-char string is rejected", "maxStringLength", [{ key: "name", operation: "%_%", value: text(257) }], "reject"),
  filterCase("257-char string inside an in array is rejected", "maxStringLength", [{ key: "name", operation: "in", value: ["a", text(257)] }], "reject"),
  filterCase("override maxStringLength 10: 11 chars are rejected", "maxStringLength", [{ key: "name", operation: "=", value: text(11) }], "reject", {
    maxStringLength: 10,
  }),
];

const SORT_CASES: LimitCase[] = [
  { name: "3 sort fields pass", limit: "maxSortFields", kind: "sort", params: { sort: sortFields(3) }, verdict: "ok" },
  { name: "4 sort fields are rejected", limit: "maxSortFields", kind: "sort", params: { sort: sortFields(4) }, verdict: "reject" },
  {
    name: "override maxSortFields 1: 2 fields are rejected",
    limit: "maxSortFields",
    kind: "sort",
    params: { sort: sortFields(2) },
    limits: { maxSortFields: 1 },
    verdict: "reject",
  },
];

const OFFSET_CASES: LimitCase[] = [
  { name: "page 501 × perPage 20 (offset 10 000) passes", limit: "maxOffset", kind: "offset", params: { page: 501, perPage: 20 }, verdict: "ok" },
  { name: "page 502 × perPage 20 (offset 10 020) is rejected", limit: "maxOffset", kind: "offset", params: { page: 502, perPage: 20 }, verdict: "reject" },
  { name: "page 1000 × perPage 20 (audit test) is rejected", limit: "maxOffset", kind: "offset", params: { page: 1000, perPage: 20 }, verdict: "reject" },
  { name: "page 502 with the default perPage (20) is rejected", limit: "maxOffset", kind: "offset", params: { page: 502 }, verdict: "reject" },
  {
    name: "override maxOffset 100: page 7 × perPage 20 (offset 120) is rejected",
    limit: "maxOffset",
    kind: "offset",
    params: { page: 7, perPage: 20 },
    limits: { maxOffset: 100 },
    verdict: "reject",
  },
  { name: "infinite offset 10 000 passes", limit: "maxOffset", kind: "infinite", params: { offset: 10_000 }, verdict: "ok" },
  { name: "infinite offset 10 001 is rejected", limit: "maxOffset", kind: "infinite", params: { offset: 10_001 }, verdict: "reject" },
];

export const LIMIT_CASES: readonly LimitCase[] = [...DEPTH_CASES, ...CONDITION_CASES, ...IN_CASES, ...STRING_CASES, ...SORT_CASES, ...OFFSET_CASES];

export const LIMIT_NAMES: readonly LimitName[] = ["maxDepth", "maxConditions", "maxInItems", "maxStringLength", "maxOffset", "maxSortFields"];

/** The attack payload: `{"not":{"not":…}}` this many levels deep. */
export const HOSTILE_DEPTH = 10_000;
