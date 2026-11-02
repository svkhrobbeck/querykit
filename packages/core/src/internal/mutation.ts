/**
 * Bulk-mutation guards shared by every adapter (task 013): a filterless
 * `updateWhere` / `deleteWhere` runs only on an explicit `{ all: true }`.
 */
import { QueryKitError } from "../errors";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** `{ all: true }` — and nothing else — asks for every row (the scope still applies). */
export function isAllRows(filter: unknown): boolean {
  return isPlainObject(filter) && filter.all === true && Object.keys(filter).length === 1;
}

/** `undefined`, `null`, `[]` or `{}`: no condition at all. */
export function isEmptyFilter(filter: unknown): boolean {
  return (
    filter === undefined || filter === null || (Array.isArray(filter) && filter.length === 0) || (isPlainObject(filter) && Object.keys(filter).length === 0)
  );
}

/** A mutation without a condition — also one whose every condition was skipped. */
export function refuseEmptyFilter(source: string, method: "updateWhere" | "deleteWhere"): never {
  throw new QueryKitError({ source, site: "mutation", key: method, reason: "empty-filter" });
}
