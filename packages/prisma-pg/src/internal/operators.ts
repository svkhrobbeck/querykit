import type { FilterOperator, FilterValue } from "../types";

/**
 * A field-level Prisma filter fragment, e.g. `{ gte: 18 }` or
 * `{ contains: "ali", mode: "insensitive" }`. `undefined` = drop the condition.
 */
export type Fragment = Record<string, unknown> | undefined;

/**
 * Some conditions cannot be expressed as a single field fragment — an exact
 * `LIKE` translation may need two predicates on the same field, and Prisma has
 * no field-level `AND`. Such a builder returns this instead, and `where.ts`
 * expands it into a full `where` node once the field name is known.
 */
export interface WhereFragment {
  buildFor(field: string): Record<string, unknown>;
}

export const isWhereFragment = (value: unknown): value is WhereFragment => typeof (value as WhereFragment | undefined)?.buildFor === "function";

/** Per-condition facts the builders need (see `where.ts`). */
export interface OperatorContext {
  /** Whether the target field is a `String` — `mode: "insensitive"` is only valid there. */
  isString: boolean;
}

type Builder = (value: FilterValue | undefined, ctx: OperatorContext) => Fragment | WhereFragment;

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
 * Patterns Prisma has no direct filter for — an interior `%`, a `_` wildcard, or
 * an escaped literal `%`/`_` inside a substring match — are still translated
 * **exactly**, via {@link rawLikePlan}, so every SQL `LIKE` pattern drizzle-pg
 * accepts returns the same rows here.
 */
export interface LikeShape {
  op: "equals" | "contains" | "startsWith" | "endsWith";
  value: string;
}

/** One character of a LIKE pattern: a wildcard, or a literal (possibly escaped). */
interface LikeToken {
  kind: "any" | "one" | "lit";
  char: string;
}

/** Split a SQL LIKE pattern into tokens, resolving `\` escapes. */
function tokenizeLike(pattern: string): LikeToken[] | undefined {
  const tokens: LikeToken[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return undefined; // dangling escape — not a valid pattern
      tokens.push({ kind: "lit", char: next });
      i++;
      continue;
    }
    if (ch === "%") tokens.push({ kind: "any", char: "%" });
    else if (ch === "_") tokens.push({ kind: "one", char: "_" });
    else tokens.push({ kind: "lit", char: ch });
  }
  return tokens;
}

/** Render tokens back to a SQL LIKE pattern, re-escaping literal `%`, `_` and `\`. */
const renderPattern = (tokens: LikeToken[]): string =>
  tokens.map(t => (t.kind === "lit" && (t.char === "%" || t.char === "_" || t.char === "\\") ? `\\${t.char}` : t.char)).join("");

/**
 * The simple shape of a pattern whose wildcards are only leading/trailing `%`
 * and whose literal part contains no `%`/`_` — i.e. the forms that map onto a
 * plain `equals`/`contains`/`startsWith`/`endsWith`. Returns `undefined` when
 * the pattern needs the exact construction in {@link rawLikePlan}.
 *
 * This path is preferred because it never relies on how Prisma treats wildcard
 * characters inside a filter value.
 */
export function parseLikePattern(pattern: string): LikeShape | undefined {
  const tokens = tokenizeLike(pattern);
  if (!tokens) return undefined;

  let start = 0;
  let end = tokens.length;
  let leading = false;
  let trailing = false;
  while (start < end && tokens[start]!.kind === "any") {
    leading = true;
    start++;
  }
  while (end > start && tokens[end - 1]!.kind === "any") {
    trailing = true;
    end--;
  }

  const core = tokens.slice(start, end);
  if (core.some(t => t.kind !== "lit")) return undefined; // interior wildcard

  const value = core.map(t => t.char).join("");
  const op = leading && trailing ? "contains" : leading ? "endsWith" : trailing ? "startsWith" : "equals";

  // A literal `%`/`_` would be re-read as a wildcard by LIKE, so anything but a
  // pure `equals` has to go through the exact construction instead.
  if (op !== "equals" && /[%_]/.test(value)) return undefined;

  return { op, value };
}

/**
 * Exact translation for every remaining pattern.
 *
 * Prisma renders `startsWith: X` as `LIKE 'X%'`, `endsWith: X` as `LIKE '%X'`
 * and `contains: X` as `LIKE '%X%'`, and it does **not** escape `%`/`_` inside
 * the value — so a raw pattern can be pushed through. Two identities then make
 * an arbitrary pattern expressible:
 *
 * - `LIKE 'A%S'` ≡ `LIKE 'A%S%' AND LIKE '%S'` — where `S` is the (fixed-length)
 *   tail after the last `%`. Anchoring the tail pins the final `S` to the end of
 *   the string, so nothing over-matches.
 * - `LIKE 'P'` with no `%` at all ≡ `LIKE 'P%' AND NOT LIKE 'P_%'` — the first
 *   fixes the prefix and a minimum length, the second forbids any extra
 *   character, which together pin the length exactly.
 *
 * A pattern that already ends in `%` needs neither: `startsWith` alone is exact.
 */
export function rawLikePlan(pattern: string, ctx: OperatorContext, caseInsensitive: boolean): WhereFragment | undefined {
  const tokens = tokenizeLike(pattern);
  if (!tokens) return undefined;

  const mode = (fragment: Record<string, unknown>) => (caseInsensitive ? insensitive(fragment, ctx) : fragment);
  const raw = renderPattern(tokens);

  return {
    buildFor(field: string) {
      // `LIKE 'X%'` — the trailing wildcard is already there, so one filter does it.
      if (tokens[tokens.length - 1]?.kind === "any") {
        return { [field]: mode({ startsWith: raw.replace(/%$/, "") }) };
      }

      const lastAny = tokens.map(t => t.kind).lastIndexOf("any");
      if (lastAny >= 0) {
        // …%S  →  LIKE 'pattern%'  AND  LIKE '%S'
        const tail = renderPattern(tokens.slice(lastAny + 1));
        return { AND: [{ [field]: mode({ startsWith: raw }) }, { [field]: mode({ endsWith: tail }) }] };
      }

      // No `%` at all: pin the length with `NOT LIKE 'pattern_%'`.
      return { AND: [{ [field]: mode({ startsWith: raw }) }, { NOT: { [field]: mode({ startsWith: `${raw}_` }) } }] };
    },
  };
}

const likeFragment = (value: FilterValue | undefined, ctx: OperatorContext, caseInsensitive: boolean): Fragment | WhereFragment => {
  const pattern = text(value);
  const shape = parseLikePattern(pattern);
  if (shape) {
    const fragment: Record<string, unknown> = { [shape.op]: shape.value };
    return caseInsensitive ? insensitive(fragment, ctx) : fragment;
  }
  return rawLikePlan(pattern, ctx, caseInsensitive);
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
    if (!inner) return undefined;
    // Negation lives at the `where` level when the positive form needed more
    // than one predicate. SQL `NOT (…)` drops NULL rows either way, matching
    // drizzle-pg's `NOT LIKE`.
    if (isWhereFragment(inner)) return { buildFor: (field: string) => ({ NOT: inner.buildFor(field) }) };
    return { not: inner };
  },

  in: v => (Array.isArray(v) ? { in: v } : undefined),
  notIn: v => (Array.isArray(v) ? { notIn: v } : undefined),

  between: v => {
    const t = asTuple(v);
    return t ? { gte: t[0], lte: t[1] } : undefined;
  },
  notBetween: v => {
    const t = asTuple(v);
    if (!t) return undefined;
    // ⚠️ Must be a where-level `NOT`, not a field-level `not`. Prisma distributes
    // a field-level negation over each key and ANDs the results, so
    // `{ age: { not: { gte: 10, lte: 26 } } }` becomes `age < 10 AND age > 26` —
    // never true. `{ NOT: { age: { gte, lte } } }` negates the conjunction as a
    // whole, which is what SQL `NOT BETWEEN` means (and it drops NULL rows too,
    // matching drizzle-pg). Verified against a real Postgres.
    return { buildFor: (field: string) => ({ NOT: { [field]: { gte: t[0], lte: t[1] } } }) };
  },

  isNull: () => ({ equals: null }),
  isNotNull: () => ({ not: null }),
};
