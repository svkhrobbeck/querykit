import type { FieldCondition, Filter, FilterNode } from "../types";
import { coerceCondition, INVALID_VALUE, isTextOperator } from "./coerce";
import { reportSkip, type Diagnostics } from "./diagnostics";
import { isStringField, resolveField, type ModelMeta } from "./fields";
import { operators } from "./operators";

/** A Prisma `where` object (`Prisma.<Model>WhereInput` at the type level). */
export type Where = Record<string, unknown>;

const isObject = (node: unknown): node is Record<string, unknown> => typeof node === "object" && node !== null;

const isFieldCondition = (node: unknown): node is FieldCondition => isObject(node) && "key" in node && !("and" in node) && !("or" in node) && !("not" in node);

/** Combine parts (dropping `undefined`): 0 → undefined, 1 → the part, else `AND`/`OR`. */
function combine(kind: "AND" | "OR", parts: Array<Where | undefined>): Where | undefined {
  const valid = parts.filter((part): part is Where => part !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return { [kind]: valid };
}

function buildCondition(meta: ModelMeta, condition: FieldCondition, diag?: Diagnostics): Where | undefined {
  const operator = condition.operation ?? "=";
  const build = operators[operator];
  if (!build) throw new Error(`Unsupported filter operator: "${operator}"`);

  const field = resolveField(meta, condition.key);
  if (!field) {
    // Unknown field → skip. Usually a typo, and a dropped filter widens the
    // result set rather than narrowing it, so it is worth reporting.
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "unknown-key" });
    return undefined;
  }

  const isString = isStringField(meta, field);

  // A text pattern cannot be matched against a non-String field: Prisma rejects
  // `contains`/`mode` on `Int`/`DateTime`, which would surface as a 500. Postgres
  // (via drizzle) *can* do it by rendering the value as text, so exact parity is
  // not reachable here — skipping keeps the adapter non-crashing and makes the
  // difference observable through `onSkippedCondition` instead of a stack trace.
  // (Same trade-off the mongoose adapter makes for `$regex` on a Date path.)
  if (isTextOperator(operator) && !isString) {
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }

  // Wire values are always JSON (no Date), so cast to the field's type first.
  // Covers scalars, `in` arrays and `between` tuples at once.
  const value = coerceCondition(meta, field, operator, condition.value);
  if (value === INVALID_VALUE) {
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }

  const fragment = build(value, { isString });
  if (fragment === undefined) {
    // The operator rejected the value shape (a non-array `in`, a non-2-tuple
    // `between`, a LIKE pattern with no Prisma equivalent) — same class of
    // problem as an uncastable value.
    reportSkip(diag, { site: "filter", key: condition.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }
  return { [field]: fragment };
}

function buildNode(meta: ModelMeta, node: FilterNode, diag?: Diagnostics): Where | undefined {
  if (isFieldCondition(node)) return buildCondition(meta, node, diag);
  if (!isObject(node)) return undefined;

  if ("and" in node) {
    return combine(
      "AND",
      (node.and as FilterNode[]).map(child => buildNode(meta, child, diag)),
    );
  }
  if ("or" in node) {
    return combine(
      "OR",
      (node.or as FilterNode[]).map(child => buildNode(meta, child, diag)),
    );
  }
  if ("not" in node) {
    const inner = buildNode(meta, node.not as FilterNode, diag);
    // No extra NULL guard: SQL `NOT(pred)` already drops NULL rows under
    // three-valued logic, so this matches drizzle-pg natively. (mongoose needs a
    // `$ne: null` guard only because Mongo's `$nor` keeps null/missing.)
    return inner ? { NOT: inner } : undefined;
  }

  // Raw escape hatch — a plain Prisma `where` object, used as-is.
  return node as Where;
}

/**
 * Compile a public {@link Filter} into a single Prisma `where` object.
 * A flat array is treated as implicit AND (db-service compatibility).
 * Returns `undefined` when nothing meaningful remains (an empty `where`).
 *
 * `diag` is optional: without it, unresolvable conditions are dropped silently;
 * with it they are reported (or, in strict mode, throw).
 */
export function buildWhere(meta: ModelMeta, filter?: Filter, diag?: Diagnostics): Where | undefined {
  if (filter === undefined) return undefined;
  // Array elements go through buildNode (not buildCondition) so a flat array may
  // also hold logical groups / raw nodes (implicit AND), matching drizzle/mongoose.
  if (Array.isArray(filter)) {
    return combine(
      "AND",
      filter.map(node => buildNode(meta, node as FilterNode, diag)),
    );
  }
  return buildNode(meta, filter as FilterNode, diag);
}

/** Merge parts into one `where` with AND (used by the repository's composeWhere). */
export function andWhere(parts: Array<Where | undefined>): Where | undefined {
  return combine("AND", parts);
}
