import type { Filter, FieldCondition, FilterNode } from "../types";
import { coerceCondition, INVALID_VALUE, isDatePath, isTextOperator } from "./coerce";
import { QueryKitError } from "@querykitjs/core";
import { isRaw, reportSkip, type Diagnostics } from "@querykitjs/core/internal";
import { operators } from "./operators";
import { resolveField, type AnyModel } from "./fields";

/** A Mongo filter query object. */
export type Query = Record<string, unknown>;

const isObject = (n: unknown): n is Record<string, unknown> => typeof n === "object" && n !== null;

const isFieldCondition = (n: unknown): n is FieldCondition => isObject(n) && "key" in n && !("and" in n) && !("or" in n) && !("not" in n);

/** Combine parts (dropping `undefined`): 0 → undefined, 1 → the part, else `$and`/`$or`. */
function combine(kind: "$and" | "$or", parts: (Query | undefined)[]): Query | undefined {
  const valid = parts.filter((p): p is Query => p !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return { [kind]: valid };
}

function buildCondition(model: AnyModel, cond: FieldCondition, diag?: Diagnostics): Query | undefined {
  const operator = cond.operation ?? "=";
  const build = operators[operator];
  if (!build) throw new Error(`Unsupported filter operator: "${operator}"`);

  const field = resolveField(model, cond.key);
  if (!field) {
    // Unknown field → skip. Usually a typo, and a dropped filter widens the
    // result set rather than narrowing it, so it is worth reporting.
    reportSkip(diag, { site: "filter", key: cond.key, operation: operator, reason: "unknown-key" });
    return undefined;
  }

  // A text pattern cannot be matched against a Date path: Mongo rejects
  // `$regex`/`$options` on a Date ("Can't use $options with Date"), which used to
  // surface as a 500. Drizzle can do it (Postgres renders the timestamp as text
  // and ILIKEs it), so exact result parity is not reachable here — the rendered
  // forms differ. Skipping keeps both adapters non-crashing and makes the
  // difference observable via `onSkippedCondition` instead of a stack trace.
  if (isTextOperator(operator) && isDatePath(model, field)) {
    reportSkip(diag, { site: "filter", key: cond.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }

  // Cast wire (JSON) values to the path's type first, matching the drizzle
  // adapter — text-pattern operators keep their raw string.
  const value = coerceCondition(model, field, operator, cond.value);
  if (value === INVALID_VALUE) {
    reportSkip(diag, { site: "filter", key: cond.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }

  const fragment = build(value);
  if (fragment === undefined) {
    // The operator rejected the value shape (a non-array `in`, a non-2-tuple
    // `between`) — same class of problem as an uncastable value.
    reportSkip(diag, { site: "filter", key: cond.key, operation: operator, reason: "invalid-value" });
    return undefined;
  }
  return { [field]: fragment };
}

function buildNode(model: AnyModel, node: FilterNode, diag?: Diagnostics): Query | undefined {
  if (isFieldCondition(node)) return buildCondition(model, node, diag);
  if (isObject(node)) {
    if ("and" in node)
      return combine(
        "$and",
        (node.and as FilterNode[]).map(n => buildNode(model, n, diag)),
      );
    if ("or" in node)
      return combine(
        "$or",
        (node.or as FilterNode[]).map(n => buildNode(model, n, diag)),
      );
    if ("not" in node) return buildFalse(model, node.not as FilterNode, diag);
    // Raw escape hatch — a Mongo filter object, used as-is only when server code
    // branded it with core `raw()` (R19). A plain object can come from a JSON body
    // (`{ $where: … }`), so it is refused whatever `strict` says — mutations included.
    if (isRaw(node)) return node as Query;
    throw new QueryKitError({ source: model.modelName, site: "filter", key: Object.keys(node as object)[0] ?? "", reason: "forbidden-key" });
  }
  return undefined;
}

/**
 * The rows where `node` is FALSE — SQL three-valued logic, so drizzle-pg and
 * prisma-pg agree (task 021 B10). MongoDB's `$nor` is two-valued: it also keeps
 * rows where the predicate is UNKNOWN (a null / missing field). So:
 * `isFalse(and(…))` = `or(isFalse(…))`, `isFalse(or(…))` = `and(isFalse(…))`,
 * `isFalse(not(q))` = `isTrue(q)`, and a comparison is FALSE only on a non-null
 * field. `isNull` / `isNotNull` are two-valued (never UNKNOWN) and need no guard.
 */
function buildFalse(model: AnyModel, node: FilterNode, diag?: Diagnostics): Query | undefined {
  if (isFieldCondition(node)) {
    const inner = buildCondition(model, node, diag);
    if (!inner) return undefined;
    const op = node.operation ?? "=";
    const field = op === "isNull" || op === "isNotNull" ? undefined : resolveField(model, node.key);
    return field ? { $and: [{ [field]: { $ne: null } }, { $nor: [inner] }] } : { $nor: [inner] };
  }
  if (isObject(node)) {
    if ("and" in node)
      return combine(
        "$or",
        (node.and as FilterNode[]).map(n => buildFalse(model, n, diag)),
      );
    if ("or" in node)
      return combine(
        "$and",
        (node.or as FilterNode[]).map(n => buildFalse(model, n, diag)),
      );
    if ("not" in node) return buildNode(model, node.not as FilterNode, diag);
  }
  // A branded raw node (or a refusal for an unbranded one) — its own truth value.
  const inner = buildNode(model, node, diag);
  return inner ? { $nor: [inner] } : undefined;
}

/**
 * Translate a filter (tree / node / flat array / raw) into a single Mongo query.
 *
 * `diag` is optional: without it, unresolvable conditions are dropped silently
 * exactly as before; with it they are reported (or, in strict mode, throw).
 */
export function buildWhere(model: AnyModel, filter?: Filter, diag?: Diagnostics): Query | undefined {
  if (filter === undefined) return undefined;
  // Array elements go through buildNode (not buildCondition) so a flat array may
  // also hold logical groups / raw nodes (implicit AND), matching drizzle-pg.
  if (Array.isArray(filter))
    return combine(
      "$and",
      filter.map(c => buildNode(model, c, diag)),
    );
  return buildNode(model, filter, diag);
}
