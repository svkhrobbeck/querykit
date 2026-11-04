/**
 * Evaluates a cast MongoDB filter, sort and projection against fixture
 * documents with MongoDB semantics: `null` matches null/missing, comparisons
 * only between values of the same type, `$not`/`$nor` match when the inner
 * condition does not, null sorts lowest. Test-only.
 */
import { recordOrder } from "../../core/test/conformance/fixtures";
import { compareValues, mongoOrder, pick, sortRows, type Direction } from "../../core/test/conformance/semantics";

type Doc = Record<string, unknown>;
type Condition = Record<string, unknown>;

const isNullish = (value: unknown) => value === null || value === undefined;
const isOperatorObject = (value: unknown): value is Condition =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof RegExp) &&
  Object.keys(value).every(key => key.startsWith("$"));

const sameType = (a: unknown, b: unknown) => (a instanceof Date ? b instanceof Date : typeof a === typeof b && !(b instanceof Date));

function equals(stored: unknown, operand: unknown): boolean {
  if (operand === null) return isNullish(stored);
  if (isNullish(stored) || !sameType(stored, operand)) return false;
  return compareValues(stored, operand) === 0;
}

function compare(stored: unknown, operand: unknown, test: (order: number) => boolean): boolean {
  if (isNullish(stored) || isNullish(operand) || !sameType(stored, operand)) return false;
  return test(compareValues(stored, operand));
}

function matchesField(stored: unknown, condition: unknown): boolean {
  if (condition instanceof RegExp) return typeof stored === "string" && condition.test(stored);
  if (!isOperatorObject(condition)) return equals(stored, condition);
  const options = typeof condition.$options === "string" ? condition.$options : "";
  return Object.entries(condition).every(([operator, operand]) => {
    switch (operator) {
      case "$options":
        return true;
      case "$eq":
        return equals(stored, operand);
      case "$ne":
        return !equals(stored, operand);
      case "$gt":
        return compare(stored, operand, order => order > 0);
      case "$gte":
        return compare(stored, operand, order => order >= 0);
      case "$lt":
        return compare(stored, operand, order => order < 0);
      case "$lte":
        return compare(stored, operand, order => order <= 0);
      case "$in":
        return (operand as unknown[]).some(item => equals(stored, item));
      case "$nin":
        return !(operand as unknown[]).some(item => equals(stored, item));
      case "$regex": {
        const regex = operand instanceof RegExp ? operand : new RegExp(String(operand), options);
        return typeof stored === "string" && regex.test(stored);
      }
      case "$not":
        return !matchesField(stored, operand);
      case "$exists":
        return Boolean(operand) === !isNullish(stored);
      default:
        throw new Error(`fake-mongo: unsupported operator "${operator}"`);
    }
  });
}

export function matches(filter: Condition | undefined, doc: Doc): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$and") return (value as Condition[]).every(part => matches(part, doc));
    if (key === "$or") return (value as Condition[]).some(part => matches(part, doc));
    if (key === "$nor") return !(value as Condition[]).some(part => matches(part, doc));
    return matchesField(doc[key], value);
  });
}

export interface FindOptions {
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
}

/** `find(filter, projection).sort().skip().limit()` on fixture documents. */
export function find(docs: readonly Doc[], filter: Condition | undefined, options: FindOptions, projection?: Record<string, unknown>): Doc[] {
  const keys = Object.entries(options.sort ?? {}).map(([key, value]) => ({ key, direction: (value === -1 ? "desc" : "asc") as Direction }));
  recordOrder(keys);
  const ordered = sortRows(
    docs.filter(doc => matches(filter, doc)),
    keys,
    mongoOrder,
  );
  const skip = options.skip ?? 0;
  const page = ordered.slice(skip, options.limit === undefined ? undefined : skip + options.limit);
  const included = Object.keys(projection ?? {}).filter(key => projection![key] === 1 || projection![key] === true);
  if (included.length === 0) return page;
  const withId = projection!._id !== 0 && projection!._id !== false;
  return page.map(doc => pick(doc, withId ? [...new Set(["_id", ...included])] : included));
}
