/**
 * `@querykitjs/web` — frontend query-building for querykit.
 *
 * Filter/sort/pagination payloadini **tipli** quradi, javob meta'sini map qiladi
 * va URL-state sync uchun toza yordamchilar beradi. **So'rov yubormaydi** — chiqqan
 * payload'ni o'z `fetch`/`axios`ingizga uzatasiz. Zero-dependency.
 *
 * React hook'lar uchun: `import { useListParams } from "@querykitjs/web/react"`.
 *
 * @example
 * ```ts
 * import { buildListParams, f, mapMeta } from "@querykitjs/web";
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
// Meta mapping is exposed through the registry's `parse*` (single public API);
// `mapMeta`/`mapInfiniteMeta`/`mapCursorMeta` stay internal (used by `parse*`).
export {
  createRegistry,
  type Registry,
  type RegistryConfig,
  type RegistryDefaults,
  type Resource,
  type ResourceKeys,
  type ResourceListParams,
  type ResourceInfiniteParams,
  type ResourceCursorParams,
  type ResourceParams,
  type ListResult,
  type InfiniteResult,
  type CursorResult,
} from "./registry";
export type { AdapterName, WithFor, MongoosePopulate, DrizzleWith, PrismaInclude } from "./adapter";
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
