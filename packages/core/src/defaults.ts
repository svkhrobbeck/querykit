/**
 * Umumiy pagination default'lari — yagona manba. Backend adapter (`createRegistry`
 * options) va frontend (`createQuery` config) shu qiymatlarni fallback sifatida
 * ishlatadi, shuning uchun ular hech qachon bir-biridan farq qilmaydi.
 */

/** Offset (list) sahifa o'lchami default'i. */
export const DEFAULT_PER_PAGE = 20;

/** Infinite/cursor `limit` default'i. */
export const DEFAULT_LIMIT = 20;

/**
 * `perPage` uchun yuqori chegara — cap'siz paginatsiya DoS yuzasi. Validatsiya
 * (`@querykitjs/zod` factory'lari), backend repositorylari va frontend `createQuery`
 * shu bitta qiymatga tayanadi, shuning uchun ular hech qachon farq qilmaydi.
 */
export const DEFAULT_MAX_PER_PAGE = 200;

/** Infinite/cursor `limit` uchun yuqori chegara. Qarang: {@link DEFAULT_MAX_PER_PAGE}. */
export const DEFAULT_MAX_LIMIT = 200;

/* ----------------------------- request limits ------------------------------ */
/* Parse-time size limits for every filter and pagination request. The
 * validators (`@querykitjs/zod`, `@querykitjs/class-validator`) reject a payload
 * past any of them; `@querykitjs/web` refuses to build one past the offset or
 * sort limit. Raise one per schema/DTO with `limits`, never globally. */

/** Longest root-to-leaf path of a filter tree, in nodes: the root is level 1, every `and`/`or`/`not` and the condition itself add one. */
export const DEFAULT_MAX_FILTER_DEPTH = 5;

/** Field conditions (leaves) in one filter, across all groups. */
export const DEFAULT_MAX_CONDITIONS = 30;

/** Items in one array filter value (`in`, `notIn`, …). */
export const DEFAULT_MAX_IN_ITEMS = 200;

/** Characters in one string filter value, also inside an array value. */
export const DEFAULT_MAX_STRING_LENGTH = 256;

/** Rows skipped before a page: `(page - 1) × perPage` for offset pagination, `offset` for infinite. Deeper pages need a cursor. */
export const DEFAULT_MAX_OFFSET = 10_000;

/** Fields in one `sort` array. */
export const DEFAULT_MAX_SORT_FIELDS = 3;

/** The six request limits, by the option name every package uses. */
export interface QueryLimits {
  maxDepth: number;
  maxConditions: number;
  maxInItems: number;
  maxStringLength: number;
  maxOffset: number;
  maxSortFields: number;
}

/** The core defaults as one object. */
export const DEFAULT_QUERY_LIMITS: Readonly<QueryLimits> = Object.freeze({
  maxDepth: DEFAULT_MAX_FILTER_DEPTH,
  maxConditions: DEFAULT_MAX_CONDITIONS,
  maxInItems: DEFAULT_MAX_IN_ITEMS,
  maxStringLength: DEFAULT_MAX_STRING_LENGTH,
  maxOffset: DEFAULT_MAX_OFFSET,
  maxSortFields: DEFAULT_MAX_SORT_FIELDS,
});

/**
 * The defaults with the given limits on top; an `undefined` entry keeps the
 * default. `Infinity` turns a limit off (⚠️ a DoS surface).
 *
 * @example
 * ```ts
 * resolveLimits({ maxInItems: 50 }); // { maxDepth: 5, …, maxInItems: 50, … }
 * ```
 */
export function resolveLimits(limits: Partial<QueryLimits> = {}): QueryLimits {
  const resolved = { ...DEFAULT_QUERY_LIMITS };
  for (const name of Object.keys(DEFAULT_QUERY_LIMITS) as (keyof QueryLimits)[]) {
    const value = limits[name];
    if (value !== undefined) resolved[name] = value;
  }
  return resolved;
}
