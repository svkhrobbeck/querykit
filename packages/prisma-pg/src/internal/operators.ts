import type { FilterOperator, FilterValue } from "../types";

/**
 * A field-level Prisma filter fragment, e.g. `{ gte: 18 }` or
 * `{ contains: "ali", mode: "insensitive" }`. `undefined` = drop the condition.
 */
export type Fragment = Record<string, unknown> | undefined;

/** Per-condition facts the builders need (see `where.ts`). */
export interface OperatorContext {
  /** Whether the target field is a `String` — `mode: "insensitive"` is only valid there. */
  isString: boolean;
}

type Builder = (value: FilterValue | undefined, ctx: OperatorContext) => Fragment;

const text = (value: FilterValue | undefined): string => String(value ?? "");

const asTuple = (value: FilterValue | undefined): [unknown, unknown] | undefined =>
  Array.isArray(value) && value.length === 2 ? [value[0], value[1]] : undefined;

/** Case-insensitive matching, but only where Prisma accepts it. */
const insensitive = (fragment: Record<string, unknown>, ctx: OperatorContext): Record<string, unknown> =>
  ctx.isString ? { ...fragment, mode: "insensitive" } : fragment;

/* ----------------------------- LIKE patterns ------------------------------ */

/**
 * Prisma has no raw SQL `LIKE` inside `where`, so a `like`/`ilike` pattern is
 * translated into the equivalent `equals`/`contains`/`startsWith`/`endsWith`
 * filter. This keeps exact drizzle-pg parity for the patterns that actually
 * travel over the wire:
 *
 * ```
 * "%ali%" → contains "ali"      "ali%" → startsWith "ali"
 * "%ali"  → endsWith  "ali"     "ali"  → equals     "ali"
 * "%"     → endsWith  ""        (i.e. every non-NULL row, exactly like SQL)
 * ```
 *
 * A pattern that Postgres can express and Prisma cannot — a `_` wildcard, an
 * interior `%`, or an escaped literal `%`/`_` inside a substring match — returns
 * `undefined`. The caller then drops the condition **and reports it**, because
 * silently degrading it to `contains` would *widen* the result set (`"ali%"`
 * would start matching `"vali ali"`), which is exactly the kind of divergence
 * that makes a cross-adapter contract untrustworthy.
 */
export interface LikeShape {
  op: "equals" | "contains" | "startsWith" | "endsWith";
  value: string;
}

export function parseLikePattern(pattern: string): LikeShape | undefined {
  /** Tokens: `{ w: true }` = wildcard `%`, else a literal character. */
  const tokens: Array<{ w: boolean; c: string }> = [];

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return undefined; // dangling escape — not representable
      tokens.push({ w: false, c: next });
      i++;
      continue;
    }
    if (ch === "_") return undefined; // single-character wildcard: no Prisma equivalent
    tokens.push({ w: ch === "%", c: ch });
  }

  let start = 0;
  let end = tokens.length;
  let leading = false;
  let trailing = false;
  while (start < end && tokens[start]!.w) {
    leading = true;
    start++;
  }
  while (end > start && tokens[end - 1]!.w) {
    trailing = true;
    end--;
  }

  const core = tokens.slice(start, end);
  if (core.some(t => t.w)) return undefined; // interior `%`

  const value = core.map(t => t.c).join("");
  const op = leading && trailing ? "contains" : leading ? "endsWith" : trailing ? "startsWith" : "equals";

  // An escaped literal `%`/`_` survives into the search string, and Prisma does
  // not escape those before handing them to LIKE — so a substring match would
  // treat them as wildcards again. `equals` is unaffected (no LIKE involved).
  if (op !== "equals" && /[%_]/.test(value)) return undefined;

  return { op, value };
}

const likeFragment = (value: FilterValue | undefined, ctx: OperatorContext, caseInsensitive: boolean): Fragment => {
  const shape = parseLikePattern(text(value));
  if (!shape) return undefined;
  const fragment: Record<string, unknown> = { [shape.op]: shape.value };
  return caseInsensitive ? insensitive(fragment, ctx) : fragment;
};

/* ------------------------------- operators -------------------------------- */

/**
 * Operator → Prisma fragment map. Mirrors `@querykitjs/drizzle-pg` semantics
 * exactly: both token (`"%_%"`) and name-alias (`"contains"`) forms are handled;
 * `contains`/`startsWith`/`endsWith` are case-**insensitive**, `like` is
 * case-**sensitive**, `ilike` is insensitive; invalid values (a non-array `in`,
 * a non-2-tuple `between`) drop the condition (`undefined`).
 *
 * Negations carry **no** extra NULL guard: Postgres' three-valued logic already
 * excludes NULL rows from `NOT`/`!=`/`NOT IN`, so this matches drizzle-pg
 * natively. (The mongoose adapter's `$ne: null` guards exist only to make
 * MongoDB's two-valued logic behave like SQL.)
 */
export const operators: Record<FilterOperator, Builder> = {
  "=": v => ({ equals: v }),
  eq: v => ({ equals: v }),
  "!=": v => ({ not: v }),
  ne: v => ({ not: v }),
  ">": v => ({ gt: v }),
  gt: v => ({ gt: v }),
  ">=": v => ({ gte: v }),
  gte: v => ({ gte: v }),
  "<": v => ({ lt: v }),
  lt: v => ({ lt: v }),
  "<=": v => ({ lte: v }),
  lte: v => ({ lte: v }),

  contains: (v, ctx) => insensitive({ contains: text(v) }, ctx),
  "%_%": (v, ctx) => insensitive({ contains: text(v) }, ctx),
  startsWith: (v, ctx) => insensitive({ startsWith: text(v) }, ctx),
  "%_": (v, ctx) => insensitive({ startsWith: text(v) }, ctx),
  endsWith: (v, ctx) => insensitive({ endsWith: text(v) }, ctx),
  "_%": (v, ctx) => insensitive({ endsWith: text(v) }, ctx),

  like: (v, ctx) => likeFragment(v, ctx, false),
  ilike: (v, ctx) => likeFragment(v, ctx, true),
  notLike: (v, ctx) => {
    const inner = likeFragment(v, ctx, false);
    return inner ? { not: inner } : undefined;
  },

  in: v => (Array.isArray(v) ? { in: v } : undefined),
  notIn: v => (Array.isArray(v) ? { notIn: v } : undefined),

  between: v => {
    const t = asTuple(v);
    return t ? { gte: t[0], lte: t[1] } : undefined;
  },
  notBetween: v => {
    const t = asTuple(v);
    // Field-level negation uses lowercase `not` (uppercase `NOT` is where-level).
    return t ? { not: { gte: t[0], lte: t[1] } } : undefined;
  },

  isNull: () => ({ equals: null }),
  isNotNull: () => ({ not: null }),
};
