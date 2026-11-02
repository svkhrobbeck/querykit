/**
 * The filter-limit walk shared by the validators (task 008). It runs on the raw,
 * unvalidated payload **before** any recursive schema sees it, so it is
 * iterative — no recursion at all, whatever the payload's depth — and a
 * 10 000-level `not` chain is rejected after `maxDepth + 1` steps.
 *
 * Only size is judged here. Shape errors (a missing `key`, a bad operator) are
 * the validator's job — a malformed node is skipped, not reported.
 */
import { DEFAULT_PER_PAGE, type QueryLimits } from "../defaults";

/** Where in the filter a limit was crossed — object keys and array indexes, from the root. */
export type LimitPath = (string | number)[];

export interface LimitViolation {
  limit: keyof QueryLimits;
  max: number;
  path: LimitPath;
}

/** The limits the walk checks. */
export type FilterLimits = Pick<QueryLimits, "maxDepth" | "maxConditions" | "maxInItems" | "maxStringLength">;

/** A node still to visit: the node, its level (the root is 1) and its path. */
type Pending = [node: unknown, depth: number, path: LimitPath];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `maxInItems (200)` — the form every package's error text uses. */
export const formatLimit = (limit: keyof QueryLimits, max: number): string => `${limit} (${max})`;

/**
 * The first limit the filter crosses, depth-first in document order, or
 * `undefined` when it is within all four. A flat array (implicit AND) puts its
 * conditions at level 1. Key order mirrors the validators: `key` first, then
 * `and`, `or`, `not`.
 */
export function findFilterLimitViolation(filter: unknown, limits: FilterLimits): LimitViolation | undefined {
  const hit = (limit: keyof FilterLimits, path: LimitPath): LimitViolation => ({ limit, max: limits[limit], path });
  const pending: Pending[] = [];
  /* Children go on the stack last-first, so they pop in document order. */
  const push = (children: readonly unknown[], depth: number, path: LimitPath) => {
    for (let index = children.length - 1; index >= 0; index--) pending.push([children[index], depth, [...path, index]]);
  };
  if (Array.isArray(filter)) push(filter, 1, []);
  else if (filter !== undefined) pending.push([filter, 1, []]);

  let conditions = 0;
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [node, depth, path] = next;
    if (depth > limits.maxDepth) return hit("maxDepth", path);
    if (!isRecord(node)) continue;

    if ("key" in node) {
      if (++conditions > limits.maxConditions) return hit("maxConditions", path);
      const { value } = node;
      const valuePath = [...path, "value"];
      if (Array.isArray(value) && value.length > limits.maxInItems) return hit("maxInItems", valuePath);
      const items: unknown[] = Array.isArray(value) ? value : [value];
      const tooLong = items.findIndex(item => typeof item === "string" && item.length > limits.maxStringLength);
      if (tooLong >= 0) return hit("maxStringLength", Array.isArray(value) ? [...valuePath, tooLong] : valuePath);
      continue;
    }

    const group = "and" in node ? "and" : "or" in node ? "or" : undefined;
    if (group) {
      const children = node[group];
      if (Array.isArray(children)) push(children, depth + 1, [...path, group]);
    } else if ("not" in node) pending.push([node.not, depth + 1, [...path, "not"]]);
  }
  return undefined;
}

const LIKE_OPERATORS: ReadonlySet<string> = new Set(["like", "ilike", "notLike"]);

/** Whether an operator takes a SQL LIKE pattern. */
export const isLikeOperator = (operation: string): boolean => LIKE_OPERATORS.has(operation);

/**
 * Unescaped wildcards in a LIKE pattern, a run of `%` counted once (`%%a%` ⇒ 2).
 * A backslash escapes the next character, as in the adapters' LIKE translation.
 */
export function likeWildcards(pattern: string): number {
  let count = 0;
  let previous = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === "\\") {
      index++;
      previous = "";
      continue;
    }
    if (char === "_" || (char === "%" && previous !== "%")) count++;
    previous = char;
  }
  return count;
}

/** Rows an offset-paginated request skips: `(page - 1) × perPage`, with the core default page size. */
export const offsetOf = (page: number | undefined, perPage: number | undefined): number => ((page ?? 1) - 1) * (perPage ?? DEFAULT_PER_PAGE);
