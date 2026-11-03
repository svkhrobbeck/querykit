import { DEFAULT_MAX_OFFSET, DEFAULT_MAX_PER_PAGE, DEFAULT_MAX_SORT_FIELDS, DEFAULT_PER_PAGE } from "@querykitjs/core";

import { buildListParams, clampInt } from "./query";
import type { FieldDescriptor, ListSchema } from "./schema";
import type { FieldCondition, Filter, FilterNode, FilterValue, ListParams, ListPayload, Sort, SortDirection, SortInput } from "./types";

/** URL param nomlari (sahifa/o'lcham/sort) — sozlanadigan. */
export interface UrlConfig {
  pageParam?: string;
  sizeParam?: string;
  sortParam?: string;
}

const URL_DEFAULTS: Required<UrlConfig> = {
  pageParam: "page",
  sizeParam: "size",
  sortParam: "sortType",
};

/**
 * `"-createdAt,id,-appNumber"` → `[{ key, direction }, …]` — comma-separated,
 * order preserved, `-` prefix = `desc` (else `asc`). Empty → `undefined`.
 */
export function decodeSort(value: string | null | undefined): Sort | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(tok => {
      const desc = tok.startsWith("-");
      return { key: desc ? tok.slice(1) : tok, direction: (desc ? "desc" : "asc") as SortDirection };
    })
    .filter(i => i.key); // drop empty keys (e.g. a lone "-")
  return items.length ? items : undefined;
}

/** `[{ key, direction }, …]` (or `"-field"` shorthand strings) → `"-createdAt,id,-appNumber"` (empty → `""`). */
export function encodeSort(sort: SortInput): string {
  return sort
    .map(i => (typeof i === "string" ? i.trim() : i && i.key ? (i.direction === "desc" ? "-" : "") + i.key : ""))
    .filter(Boolean)
    .join(",");
}

/**
 * Schema + searchParams → filter. Applies `range`/`between`/`search`/`split`/
 * `default`/`trim`; empty/absent params are dropped. Returns a flat
 * `FieldCondition[]` (implicit AND), or a tree when a `search` OR-group is
 * present (`{ and: [orGroup, …conditions] }`).
 */
export function schemaToFilter(schema: ListSchema, searchParams: URLSearchParams): Filter {
  const conditions: FieldCondition[] = [];
  const groups: FilterNode[] = [];

  for (const [param, d] of Object.entries(schema) as [string, FieldDescriptor][]) {
    const key = d.key ?? param;

    // range → two inclusive conditions (>= , <=)
    if (d.range) {
      const from = searchParams.get(d.range[0]);
      const to = searchParams.get(d.range[1]);
      if (from) conditions.push(cond(key, ">=", from));
      if (to) conditions.push(cond(key, "<=", to));
      continue;
    }

    // between → one condition with a 2-tuple value
    if (d.between) {
      const from = searchParams.get(d.between[0]);
      const to = searchParams.get(d.between[1]);
      if (from && to) conditions.push(cond(key, "between", [from, to]));
      continue;
    }

    // read value, falling back to `default` only when the param is ABSENT
    // (an empty `?x=` means the user cleared the filter → prune, don't default).
    const raw = searchParams.get(param);
    let value: FilterValue | undefined = raw !== null ? raw : d.default;
    if (typeof value === "string" && d.trim) value = value.trim();
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    // search → OR of `contains` across the listed fields (needs a string)
    if (d.search && typeof value === "string") {
      groups.push({ or: d.search.map(field => cond(field, "%_%", value as string)) });
      continue;
    }

    // split → comma-string → array (for `in`/`notIn`); guarded against empties
    if (d.split && typeof value === "string") {
      const delimiter = d.split === true ? "," : d.split;
      const parts = value
        .split(delimiter)
        .map(s => s.trim())
        .filter(Boolean);
      if (parts.length === 0) continue;
      value = parts;
    }

    conditions.push(cond(key, d.operation ?? "=", value));
  }

  return groups.length === 0 ? conditions : { and: [...groups, ...conditions] };
}

function cond(key: string, operation: FieldCondition["operation"], value: FilterValue): FieldCondition {
  return { key, operation, value };
}

/**
 * The bounds the URL readers clamp to — the builder's own (`createRegistry`
 * `defaults`); an absent one is the core default.
 */
export interface UrlLimits {
  perPage?: number;
  maxPerPage?: number;
  maxOffset?: number;
  maxSortFields?: number;
}

/** {@link ListParams} read from a URL. `clamped` — the URL's page or sort was cut to the limits. */
export type UrlListParams = ListParams & { clamped: boolean };

/**
 * A list payload built from a URL. `clamped` is non-enumerable: readable in code,
 * never serialized, so the wire payload is unchanged.
 */
export type UrlListPayload = ListPayload & { readonly clamped?: boolean };

/** Marks a payload with a non-enumerable `clamped` flag. */
export function withClamped(payload: ListPayload, clamped: boolean): UrlListPayload {
  return Object.defineProperty(payload, "clamped", { value: clamped, enumerable: false });
}

/** The last page the builder accepts: `(page - 1) × perPage ≤ maxOffset`. */
function lastPage(perPage: number | undefined, limits: UrlLimits): number {
  const resolved = clampInt(perPage, limits.perPage ?? DEFAULT_PER_PAGE, limits.maxPerPage ?? DEFAULT_MAX_PER_PAGE);
  return Math.floor((limits.maxOffset ?? DEFAULT_MAX_OFFSET) / resolved) + 1;
}

/**
 * searchParams → normalizatsiyalanmagan {@link ListParams} (filter/sort/page/perPage).
 * The URL is user input: a page past `maxOffset` becomes the last allowed page and a
 * sort past `maxSortFields` keeps its first fields, with `clamped: true` — so a
 * hand-edited `?page=9999` never throws during render. The builders still throw
 * for a direct call.
 */
export function readListParams(schema: ListSchema, searchParams: URLSearchParams, url: UrlConfig = {}, limits: UrlLimits = {}): UrlListParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const size = searchParams.get(cfg.sizeParam);
  const perPage = size ? Number(size) : undefined;
  const page = Math.trunc(Number(searchParams.get(cfg.pageParam))) || 1;
  const sort = decodeSort(searchParams.get(cfg.sortParam));
  const maxPage = lastPage(perPage, limits);
  const maxSortFields = limits.maxSortFields ?? DEFAULT_MAX_SORT_FIELDS;
  const isPageClamped = page > maxPage;
  const isSortClamped = sort !== undefined && sort.length > maxSortFields;
  return {
    filter: schemaToFilter(schema, searchParams),
    sort: isSortClamped ? sort.slice(0, maxSortFields) : sort,
    page: isPageClamped ? maxPage : page,
    perPage,
    clamped: isPageClamped || isSortClamped,
  };
}

/** searchParams → to'liq, yuborishga tayyor {@link ListPayload} (core default limits; clamped like {@link readListParams}). */
export function searchParamsToPayload(schema: ListSchema, searchParams: URLSearchParams, url?: UrlConfig): UrlListPayload {
  const params = readListParams(schema, searchParams, url);
  return withClamped(buildListParams(params), params.clamped);
}

/* ------------------------- URL yozish (immutable) ------------------------- */
/* Har biri YANGI URLSearchParams qaytaradi; filter/sort o'zgarsa `page` reset. */

function clone(searchParams: URLSearchParams): URLSearchParams {
  return new URLSearchParams(searchParams);
}

/** Filter param'ini o'rnatadi/o'chiradi va `page`ni reset qiladi. */
export function setParam(searchParams: URLSearchParams, name: string, value: string | null | undefined, url: UrlConfig = {}): URLSearchParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const next = clone(searchParams);
  next.delete(cfg.pageParam);
  if (value === null || value === undefined || value === "") next.delete(name);
  else next.set(name, value);
  return next;
}

/** Sahifani o'rnatadi (`page` reset qilinmaydi). */
export function setPage(searchParams: URLSearchParams, page: number, url: UrlConfig = {}): URLSearchParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const next = clone(searchParams);
  next.set(cfg.pageParam, String(page));
  return next;
}

/** Sahifa o'lchamini o'rnatadi va `page`ni reset qiladi. */
export function setSize(searchParams: URLSearchParams, size: number, url: UrlConfig = {}): URLSearchParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const next = clone(searchParams);
  next.delete(cfg.pageParam);
  next.set(cfg.sizeParam, String(size));
  return next;
}

/** Sortni o'rnatadi (`[{ key, direction }, …]`) va `page`ni reset qiladi. */
export function setSort(searchParams: URLSearchParams, sort: SortInput, url: UrlConfig = {}): URLSearchParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const next = clone(searchParams);
  next.delete(cfg.pageParam);
  const encoded = encodeSort(sort);
  if (encoded) next.set(cfg.sortParam, encoded);
  else next.delete(cfg.sortParam);
  return next;
}

/** Barcha list param'larini tozalaydi (ixtiyoriy saqlanadigan kalitlar bilan). */
export function resetParams(searchParams: URLSearchParams, keep: string[] = []): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of keep) {
    const value = searchParams.get(key);
    if (value !== null) next.set(key, value);
  }
  return next;
}
