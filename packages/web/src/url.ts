import { buildListParams } from "./query";
import type { FieldDescriptor, ListSchema } from "./schema";
import type { FieldCondition, ListParams, ListPayload, Sort, SortInput } from "./types";

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

/** Schema + searchParams → `FieldCondition[]` (bo'sh param'lar tashlanadi). */
export function schemaToFilter(schema: ListSchema, searchParams: URLSearchParams): FieldCondition[] {
  const out: FieldCondition[] = [];

  for (const [param, descriptor] of Object.entries(schema) as [string, FieldDescriptor][]) {
    const key = descriptor.key ?? param;

    if (descriptor.range) {
      const [fromParam, toParam] = descriptor.range;
      const from = searchParams.get(fromParam);
      const to = searchParams.get(toParam);
      if (from) out.push(cond(key, ">=", from, descriptor.type));
      if (to) out.push(cond(key, "<=", to, descriptor.type));
      continue;
    }

    let value = searchParams.get(param);
    if (value === null || value === "") continue;
    if (descriptor.trim) value = value.trim();
    if (value === "") continue;
    out.push(cond(key, descriptor.operation ?? "=", value, descriptor.type));
  }

  return out;
}

function cond(key: string, operation: FieldCondition["operation"], value: string, type?: FieldDescriptor["type"]): FieldCondition {
  return type === undefined ? { key, operation, value } : { key, operation, value, type };
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
