/**
 * The filter-limit walk shared by the validators (task 008). It runs on the raw,
 * unvalidated payload **before** any recursive schema sees it, so it is
 * iterative: memory grows with the depth limit, never with the payload's depth,
 * and a 10 000-level `not` chain is rejected after `maxDepth + 1` steps.
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

/** Siblings still to visit: one group's children (or the single `not` child) at one depth. */
interface Frame {
  items: readonly unknown[];
  next: number;
  depth: number;
  path: LimitPath;
  /** `false` for a `not` child, whose path has no index. */
  indexed: boolean;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

/** `maxInItems (200)` — the form every package's error text uses. */
export const formatLimit = (limit: keyof QueryLimits, max: number): string => `${limit} (${max})`;

/** The first value of one condition that crosses `maxInItems` or `maxStringLength`. */
function valueViolation(value: unknown, limits: FilterLimits, path: LimitPath): LimitViolation | undefined {
  const valuePath = [...path, "value"];
  if (typeof value === "string") {
    return value.length > limits.maxStringLength ? { limit: "maxStringLength", max: limits.maxStringLength, path: valuePath } : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  if (value.length > limits.maxInItems) return { limit: "maxInItems", max: limits.maxInItems, path: valuePath };
  const index = value.findIndex(item => typeof item === "string" && item.length > limits.maxStringLength);
  return index < 0 ? undefined : { limit: "maxStringLength", max: limits.maxStringLength, path: [...valuePath, index] };
}

/** The children frame of a group node, or `undefined` for a condition / malformed node. Key order mirrors the validators: `key` first. */
function childrenOf(node: UnknownRecord, depth: number, path: LimitPath): Frame | undefined {
  if ("key" in node) return undefined;
  if ("and" in node) return Array.isArray(node.and) ? { items: node.and, next: 0, depth: depth + 1, path: [...path, "and"], indexed: true } : undefined;
  if ("or" in node) return Array.isArray(node.or) ? { items: node.or, next: 0, depth: depth + 1, path: [...path, "or"], indexed: true } : undefined;
  if ("not" in node) return { items: [node.not], next: 0, depth: depth + 1, path: [...path, "not"], indexed: false };
  return undefined;
}

/**
 * The first limit the filter crosses, depth-first, or `undefined` when it is
 * within all four. A flat array (implicit AND) puts its conditions at level 1.
 */
export function findFilterLimitViolation(filter: unknown, limits: FilterLimits): LimitViolation | undefined {
  if (filter === undefined) return undefined;
  const stack: Frame[] = [
    Array.isArray(filter) ? { items: filter, next: 0, depth: 1, path: [], indexed: true } : { items: [filter], next: 0, depth: 1, path: [], indexed: false },
  ];
  let conditions = 0;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.next >= frame.items.length) {
      stack.pop();
      continue;
    }
    const index = frame.next++;
    const node = frame.items[index];
    const path = frame.indexed ? [...frame.path, index] : frame.path;

    if (frame.depth > limits.maxDepth) return { limit: "maxDepth", max: limits.maxDepth, path };
    if (!isRecord(node)) continue;

    const children = childrenOf(node, frame.depth, path);
    if (children) {
      stack.push(children);
      continue;
    }
    if (!("key" in node)) continue;

    conditions++;
    if (conditions > limits.maxConditions) return { limit: "maxConditions", max: limits.maxConditions, path };
    const violation = valueViolation(node.value, limits, path);
    if (violation) return violation;
  }
  return undefined;
}

/** Rows an offset-paginated request skips: `(page - 1) × perPage`, with the core default page size. */
export const offsetOf = (page: number | undefined, perPage: number | undefined): number => ((page ?? 1) - 1) * (perPage ?? DEFAULT_PER_PAGE);
