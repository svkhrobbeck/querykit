/**
 * `@querykit/web` — frontend query-building for querykit.
 *
 * Filter/sort/pagination payloadini **tipli** quradi, javob meta'sini map qiladi
 * va URL-state sync uchun toza yordamchilar beradi. **So'rov yubormaydi** — chiqqan
 * payload'ni o'z `fetch`/`axios`ingizga uzatasiz. Zero-dependency.
 *
 * React hook'lar uchun: `import { useListParams } from "@querykit/web/react"`.
 *
 * @example
 * ```ts
 * import { buildListParams, f, mapMeta } from "@querykit/web";
 *
 * const params = buildListParams({
 *   filter: f.and(f.contains("name", search), f.eq("status", status)),
 *   sort: "-createdAt",
 *   page, perPage: 20,
 * });
 * const { data, meta } = (await http.post("/buyers/list", params)).data;
 * setMeta(mapMeta(meta));
 * ```
 */
export { createFilters, f } from "./filters";
export { buildParams, buildListParams, buildInfiniteParams, buildCursorParams, createQuery, normalizeFilter, normalizeSort, type QueryConfig } from "./query";
export { mapMeta, mapInfiniteMeta, mapCursorMeta } from "./meta";
export { defineListSchema, type FieldDescriptor, type ListSchema } from "./schema";
export {
  decodeSort,
  encodeSort,
  readListParams,
  resetParams,
  schemaToFilter,
  searchParamsToPayload,
  setPage,
  setParam,
  setSize,
  setSort,
  type UrlConfig,
} from "./url";
export * from "./types";
