import { coerceValue, isEmptyValue } from "./internal/coerce";
import type { FieldCondition, Filter, FilterNode, FilterValue, ListParams, ListPayload, Params, QueryPayload, Sort, SortInput } from "./types";

/** {@link createQuery} sozlamalari — wire field nomlari va default qiymatlar. */
export interface QueryConfig {
  filterField?: string;
  sortField?: string;
  columnsField?: string;
  withField?: string;
  pageField?: string;
  perPageField?: string;
  defaultPerPage?: number;
  defaultSort?: Sort;
  /** Bo'sh qiymatli filterlarni tashlash (default `true`). */
  pruneEmpty?: boolean;
}

const DEFAULTS: Required<QueryConfig> = {
  filterField: "filter",
  sortField: "sort",
  columnsField: "columns",
  withField: "with",
  pageField: "page",
  perPageField: "per_page",
  defaultPerPage: 15,
  defaultSort: { name: "createdAt", direction: "desc" },
  pruneEmpty: true,
};

/** `"-createdAt"` yoki `{ name, direction }` → `{ name, direction }`. */
export function normalizeSort(input: SortInput | undefined, fallback: Sort): Sort {
  if (input === undefined || input === "") return fallback;
  if (typeof input === "string") {
    const desc = input.startsWith("-");
    return { name: desc ? input.slice(1) : input, direction: desc ? "desc" : "asc" };
  }
  return { name: input.name ?? fallback.name, direction: input.direction ?? fallback.direction };
}

function normalizeCondition(condition: FieldCondition, prune: boolean): FieldCondition | undefined {
  const operation = condition.operation ?? condition.op ?? "=";
  const noValue = operation === "isNull" || operation === "isNotNull";
  const value = coerceValue(condition.type, condition.value as FilterValue);

  if (!noValue && prune && isEmptyValue(value)) return undefined;

  const out: FieldCondition = { key: condition.key, operation };
  if (!noValue) out.value = value;
  if (condition.type) out.type = condition.type;
  return out;
}

function normalizeNode(node: FilterNode, prune: boolean): FilterNode | undefined {
  if ("and" in node) {
    const kids = node.and.map(n => normalizeNode(n, prune)).filter((n): n is FilterNode => !!n);
    return kids.length ? { and: kids } : undefined;
  }
  if ("or" in node) {
    const kids = node.or.map(n => normalizeNode(n, prune)).filter((n): n is FilterNode => !!n);
    return kids.length ? { or: kids } : undefined;
  }
  if ("not" in node) {
    const inner = normalizeNode(node.not, prune);
    return inner ? { not: inner } : undefined;
  }
  return normalizeCondition(node, prune);
}

/** Filterni normalizatsiya qiladi: coerce + bo'shlarni prune. Massiv → flat massiv. */
export function normalizeFilter(filter: Filter | undefined, prune: boolean): FieldCondition[] | FilterNode {
  if (!filter) return [];
  if (Array.isArray(filter)) {
    return filter.map(c => normalizeCondition(c, prune)).filter((c): c is FieldCondition => !!c);
  }
  return normalizeNode(filter, prune) ?? [];
}

function build(input: Params, cfg: Required<QueryConfig>): Record<string, unknown> {
  return {
    [cfg.filterField]: normalizeFilter(input.filter, cfg.pruneEmpty),
    [cfg.sortField]: normalizeSort(input.sort, cfg.defaultSort),
    [cfg.columnsField]: input.columns ?? {},
    [cfg.withField]: input.with ?? {},
  };
}

function buildList(input: ListParams, cfg: Required<QueryConfig>): Record<string, unknown> {
  const perPage = input.perPage;
  const validPerPage = perPage === undefined || perPage < 1 || Number.isNaN(perPage) ? cfg.defaultPerPage : perPage;
  return {
    ...build(input, cfg),
    [cfg.pageField]: input.page && input.page > 0 ? input.page : 1,
    [cfg.perPageField]: validPerPage,
  };
}

/**
 * Config bilan bog'langan query quruvchilarni qaytaradi. Boshqa backend field
 * nomlari (masalan `perPage`, `withPopulates`) uchun.
 *
 * @example
 * ```ts
 * const q = createQuery({ withField: "withPopulates", defaultPerPage: 20 });
 * const params = q.list({ filter, page, perPage });
 * ```
 */
export function createQuery(config: QueryConfig = {}) {
  const cfg = { ...DEFAULTS, ...config };
  return {
    params: (input: Params = {}) => build(input, cfg),
    list: (input: ListParams = {}) => buildList(input, cfg),
  };
}

/**
 * Params'ni normalizatsiya qiladi (paginatsiyasiz): filter coerce + prune, sort
 * decode, `with`/`columns` pass-through. Default querykit wire-format.
 *
 * @example
 * ```ts
 * const payload = buildParams({
 *   filter: [{ key: "name", operation: "%_%", value: s }],
 *   sort: "-createdAt",
 *   with: { supervisor: true },
 * });
 * ```
 */
export function buildParams(input: Params = {}): QueryPayload {
  return build(input, DEFAULTS) as unknown as QueryPayload;
}

/**
 * {@link buildParams} + `page`/`per_page` (default `per_page = 15`).
 *
 * @example
 * ```ts
 * const payload = buildListParams({ filter, sort: "-createdAt", page: 2, perPage: 20 });
 * // -> { filter, sort:{name,direction}, columns, with, page, per_page }
 * ```
 */
export function buildListParams(input: ListParams = {}): ListPayload {
  return buildList(input, DEFAULTS) as unknown as ListPayload;
}
