import { DEFAULT_LIMIT, DEFAULT_PER_PAGE } from "@querykit/core";

import type {
  CursorParams,
  CursorPayload,
  FieldCondition,
  Filter,
  FilterNode,
  FilterValue,
  InfiniteParams,
  InfinitePayload,
  ListParams,
  ListPayload,
  Params,
  QueryPayload,
  Sort,
  SortInput,
} from "./types";

/** {@link createQuery} sozlamalari — wire field nomlari va default qiymatlar. */
export interface QueryConfig {
  filterField?: string;
  sortField?: string;
  columnsField?: string;
  withField?: string;
  withDeletedField?: string;
  pageField?: string;
  perPageField?: string;
  limitField?: string;
  offsetField?: string;
  cursorField?: string;
  defaultPerPage?: number;
  defaultLimit?: number;
  defaultSort?: Sort;
  /** Bo'sh qiymatli filterlarni tashlash (default `true`). */
  pruneEmpty?: boolean;
}

const DEFAULTS: Required<QueryConfig> = {
  filterField: "filter",
  sortField: "sort",
  columnsField: "columns",
  withField: "with",
  withDeletedField: "withDeleted",
  pageField: "page",
  perPageField: "perPage",
  limitField: "limit",
  offsetField: "offset",
  cursorField: "cursor",
  defaultPerPage: DEFAULT_PER_PAGE,
  defaultLimit: DEFAULT_LIMIT,
  defaultSort: { name: "createdAt", direction: "desc" },
  pruneEmpty: true,
};

/** Bo'sh (yuborilmaydigan) qiymatmi: undefined/null/""/[] . `false`/`0` — bo'sh emas. */
function isEmptyValue(value: FilterValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

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
  const operation = condition.operation ?? "=";
  const noValue = operation === "isNull" || operation === "isNotNull";
  const value = condition.value as FilterValue;

  if (!noValue && prune && isEmptyValue(value)) return undefined;

  const out: FieldCondition = { key: condition.key, operation };
  if (!noValue) out.value = value;
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

/** Filterni normalizatsiya qiladi: bo'sh shartlarni prune. Massiv → flat massiv. */
export function normalizeFilter(filter: Filter | undefined, prune: boolean): FieldCondition[] | FilterNode {
  if (!filter) return [];
  if (Array.isArray(filter)) {
    return filter.map(c => normalizeCondition(c, prune)).filter((c): c is FieldCondition => !!c);
  }
  return normalizeNode(filter, prune) ?? [];
}

/** Umumiy qism: filter/columns/with (+ withDeleted). Sort qo'shilmaydi. */
function buildBase(input: Params, cfg: Required<QueryConfig>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    [cfg.filterField]: normalizeFilter(input.filter, cfg.pruneEmpty),
    [cfg.columnsField]: input.columns ?? {},
    [cfg.withField]: input.with ?? {},
  };
  if (input.withDeleted !== undefined) base[cfg.withDeletedField] = input.withDeleted;
  return base;
}

function clampInt(value: number | undefined, fallback: number): number {
  return value === undefined || value < 1 || Number.isNaN(value) ? fallback : Math.trunc(value);
}

function build(input: Params, cfg: Required<QueryConfig>): Record<string, unknown> {
  return { ...buildBase(input, cfg), [cfg.sortField]: normalizeSort(input.sort, cfg.defaultSort) };
}

function buildList(input: ListParams, cfg: Required<QueryConfig>): Record<string, unknown> {
  return {
    ...build(input, cfg),
    [cfg.pageField]: clampInt(input.page, 1), // page >= 1 (kasr/0/manfiy → 1)
    [cfg.perPageField]: clampInt(input.perPage, cfg.defaultPerPage),
  };
}

function buildInfinite(input: InfiniteParams, cfg: Required<QueryConfig>): Record<string, unknown> {
  return {
    ...build(input, cfg),
    [cfg.limitField]: clampInt(input.limit, cfg.defaultLimit),
    [cfg.offsetField]: input.offset && input.offset > 0 ? Math.trunc(input.offset) : 0,
  };
}

function buildCursor(input: CursorParams, cfg: Required<QueryConfig>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...buildBase(input, cfg),
    [cfg.limitField]: clampInt(input.limit, cfg.defaultLimit),
    [cfg.cursorField]: input.cursor ?? null,
    order: input.order ?? "asc",
    direction: input.direction ?? "forward",
  };
  if (input.cursorKey !== undefined) payload.cursorKey = input.cursorKey;
  return payload;
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
    infinite: (input: InfiniteParams = {}) => buildInfinite(input, cfg),
    cursor: (input: CursorParams = {}) => buildCursor(input, cfg),
  };
}

/**
 * Params'ni normalizatsiya qiladi (paginatsiyasiz): filter prune, sort decode,
 * `with`/`columns` pass-through. Default querykit wire-format.
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
 * {@link buildParams} + `page`/`perPage` (default `perPage = 20`, `@querykit/core`).
 *
 * @example
 * ```ts
 * const payload = buildListParams({ filter, sort: "-createdAt", page: 2, perPage: 20 });
 * // -> { filter, sort:{name,direction}, columns, with, page, perPage }
 * ```
 */
export function buildListParams(input: ListParams = {}): ListPayload {
  return buildList(input, DEFAULTS) as unknown as ListPayload;
}

/**
 * Infinite-scroll payload — {@link buildParams} + `limit`/`offset` (default
 * `limit = 20`).
 *
 * @example
 * ```ts
 * const payload = buildInfiniteParams({ filter, limit: 20, offset: 40 });
 * // -> { filter, sort, columns, with, limit, offset }
 * ```
 */
export function buildInfiniteParams(input: InfiniteParams = {}): InfinitePayload {
  return buildInfinite(input, DEFAULTS) as unknown as InfinitePayload;
}

/**
 * Cursor (keyset) payload — `sort` o'rniga `order`/`direction`. `cursor`
 * oldingi javob meta'sidagi `next_cursor`/`prev_cursor` tokeni.
 *
 * @example
 * ```ts
 * const payload = buildCursorParams({ filter, limit: 20, cursor, order: "asc" });
 * // -> { filter, columns, with, limit, cursor, order, direction }
 * ```
 */
export function buildCursorParams(input: CursorParams = {}): CursorPayload {
  return buildCursor(input, DEFAULTS) as unknown as CursorPayload;
}
