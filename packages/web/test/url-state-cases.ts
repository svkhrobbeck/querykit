/**
 * Shared list URL-state cases: every implementation (the framework-free core, React, Vue,
 * Angular) runs the same set and must read the same `params` and write the same next URL
 * (REQUIREMENTS R11). A driver adapts one implementation to the two questions asked here.
 */
import { deepStrictEqual } from "node:assert";

import { createRegistry, defineListSchema } from "../src/index";
import type { ListPayload, SortInput } from "../src/index";

interface User {
  id: number;
  name: string;
  status: string;
  createdAt: string;
}

export const users = createRegistry({ adapter: "drizzle-pg" }).resource<User>("users");
export const usersSchema = defineListSchema({
  status: { operation: "=" },
  name: { operation: "%_%" },
  ids: { operation: "in", split: true },
});

/** The setters every implementation exposes; a setter's return value is ignored by the framework drivers. */
export interface ListSetters {
  setParam(name: string, value: string | null | undefined): unknown;
  setPage(page: number): unknown;
  setSize(size: number): unknown;
  setSort(sort: SortInput): unknown;
  reset(keep?: string[]): unknown;
}

export interface ListStateRead {
  params: ListPayload;
  clamped: boolean;
}

export interface ListStateDriver {
  /** `params` and `clamped` for the URL query `search` (no leading `?`). */
  read(search: string): Promise<ListStateRead>;
  /** The URL query after `action` runs on `search` (`URLSearchParams.toString()`). */
  act(search: string, action: (setters: ListSetters) => unknown): Promise<string>;
}

interface UrlStateCase {
  name: string;
  search: string;
  action?: (setters: ListSetters) => unknown;
  /** The next URL query after `action`. */
  next?: string;
  /** Fields of the read that must hold (on top of all drivers agreeing). */
  expect?: Partial<{ page: number; perPage: number; clamped: boolean; sort: SortInput }>;
}

export const URL_STATE_CASES: UrlStateCase[] = [
  { name: "empty URL", search: "", expect: { page: 1, clamped: false } },
  { name: "filter param", search: "status=active" },
  { name: "two filter params", search: "status=active&name=ali" },
  { name: "split in-filter", search: "ids=1,2,3" },
  { name: "page", search: "page=3", expect: { page: 3 } },
  { name: "size", search: "size=50", expect: { perPage: 50 } },
  {
    name: "sort",
    search: "sortType=-createdAt,name",
    expect: {
      sort: [
        { key: "createdAt", direction: "desc" },
        { key: "name", direction: "asc" },
      ],
    },
  },
  { name: "clamp ?page=9999&size=20", search: "page=9999&size=20", expect: { page: 501, clamped: true } },
  { name: "repeated key", search: "status=a&status=b" },
  { name: "empty value", search: "q=&status=active" },
  {
    name: "setParam sets and resets page",
    search: "status=active&page=4",
    action: s => s.setParam("name", "ali"),
    next: "status=active&name=ali",
  },
  { name: "setParam null clears", search: "status=active&name=ali&page=2", action: s => s.setParam("name", null), next: "status=active" },
  { name: "setParam empty string clears", search: "status=active&name=ali", action: s => s.setParam("name", ""), next: "status=active" },
  { name: "setPage keeps filters", search: "status=active", action: s => s.setPage(2), next: "status=active&page=2" },
  { name: "setSize resets page", search: "status=active&page=3", action: s => s.setSize(50), next: "status=active&size=50" },
  {
    name: "setSort encodes and resets page",
    search: "status=active&page=3",
    action: s => s.setSort([{ key: "name", direction: "desc" }]),
    next: "status=active&sortType=-name",
  },
  { name: "setSort [] clears sort", search: "sortType=name&page=2", action: s => s.setSort([]), next: "" },
  { name: "reset", search: "status=active&page=3&sortType=name", action: s => s.reset(), next: "" },
  { name: "reset keeps keys", search: "status=active&tab=open&page=3", action: s => s.reset(["tab"]), next: "tab=open" },
  { name: "setPage keeps a repeated key", search: "status=a&status=b", action: s => s.setPage(2), next: "status=a&status=b&page=2" },
  { name: "setPage keeps an empty value", search: "q=&status=active", action: s => s.setPage(2), next: "q=&status=active&page=2" },
];

function equal(actual: unknown, expected: unknown): string {
  try {
    deepStrictEqual(actual, expected);
    return "";
  } catch {
    return `${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`;
  }
}

/**
 * Runs every case on `driver` and compares it with `reference` (the plain `url.ts` functions).
 * Returns the failures; prints one line per case.
 */
export async function runUrlStateCases(label: string, driver: ListStateDriver, reference: ListStateDriver): Promise<number> {
  let failed = 0;
  for (const testCase of URL_STATE_CASES) {
    const problems: string[] = [];
    const [read, expected] = await Promise.all([driver.read(testCase.search), reference.read(testCase.search)]);
    const readDiff = equal(read, expected);
    if (readDiff) problems.push(`params ${readDiff}`);
    for (const [field, value] of Object.entries(testCase.expect ?? {})) {
      const actual = field === "clamped" ? read.clamped : read.params[field as keyof ListPayload];
      const diff = equal(actual, value);
      if (diff) problems.push(`${field} ${diff}`);
    }
    if (testCase.action) {
      const next = await driver.act(testCase.search, testCase.action);
      if (next !== testCase.next) problems.push(`next URL "${next}" ≠ "${testCase.next}"`);
    }
    console.log(`${problems.length === 0 ? "✅" : "❌"} [${label}] ${testCase.name}${problems.length ? ` — ${problems.join("; ")}` : ""}`);
    if (problems.length > 0) failed++;
  }
  return failed;
}
