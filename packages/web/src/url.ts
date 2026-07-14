import { buildListParams } from "./query";
import type { FieldDescriptor, ListSchema } from "./schema";
import type { FieldCondition, Filter, FilterNode, FilterValue, ListParams, ListPayload, Sort, SortInput } from "./types";

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

/** `"-createdAt"` → `{ name, direction }` (bo'sh bo'lsa `undefined`). */
export function decodeSort(value: string | null | undefined): Sort | undefined {
  if (!value) return undefined;
  const desc = value.startsWith("-");
  return { name: desc ? value.slice(1) : value, direction: desc ? "desc" : "asc" };
}

/** `{ name, direction }` → `"-createdAt"` / `"createdAt"` (nomsiz bo'lsa `""`). */
export function encodeSort(sort: Sort): string {
  if (!sort.name) return "";
  return (sort.direction === "desc" ? "-" : "") + sort.name;
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

/** searchParams → normalizatsiyalanmagan {@link ListParams} (filter/sort/page/perPage). */
export function readListParams(schema: ListSchema, searchParams: URLSearchParams, url: UrlConfig = {}): ListParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const size = searchParams.get(cfg.sizeParam);
  return {
    filter: schemaToFilter(schema, searchParams),
    sort: searchParams.get(cfg.sortParam) ?? undefined,
    page: Number(searchParams.get(cfg.pageParam)) || 1,
    perPage: size ? Number(size) : undefined,
  };
}

/** searchParams → to'liq, yuborishga tayyor {@link ListPayload}. */
export function searchParamsToPayload(schema: ListSchema, searchParams: URLSearchParams, url?: UrlConfig): ListPayload {
  return buildListParams(readListParams(schema, searchParams, url));
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

/** Sortni o'rnatadi (`"-createdAt"` yoki `{name,direction}`) va `page`ni reset qiladi. */
export function setSort(searchParams: URLSearchParams, sort: SortInput, url: UrlConfig = {}): URLSearchParams {
  const cfg = { ...URL_DEFAULTS, ...url };
  const next = clone(searchParams);
  next.delete(cfg.pageParam);
  const encoded = typeof sort === "string" ? sort : encodeSort(sort);
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
