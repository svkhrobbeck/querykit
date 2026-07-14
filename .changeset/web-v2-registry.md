---
"@querykitjs/web": major
---

Registry API + adapter-aware querying, with a reshaped standalone surface.

**Added**

- `createRegistry({ adapter, defaults, pruneEmpty })` — configure the backend adapter + defaults once; `resource<T>(name)` yields entity-typed, adapter-aware builders (`list`/`infinite`/`cursor`/`params`), a field-typed filter builder (`f`), a `search` preset, a URL↔filter `schema`, `fromSearchParams` (SSR), stable query `keys`, and `parse*` meta mappers (`ListResult`/`InfiniteResult`/`CursorResult`).
- Adapter-aware, wire-safe `with` typing for `mongoose` / `drizzle-pg` / `drizzle-sqlite` / `prisma-pg` — only JSON-serializable per-relation options are suggested; function/SQL forms are never offered.
- Operator-per-field-type filters — string-match operators (`contains`/`like`/…) only on string fields, comparison (`gt`/`between`/…) only on comparable fields.
- `useListParams(resource, { schema })` (uses `react-router-dom` internally) + router-agnostic `useListParamsBase(resource, { schema, searchParams, setSearchParams })`.
- Schema modes `default` / `split` / `range` / `between` / `search`, mutually exclusive at compile time.

**Breaking**

- `mapMeta` / `mapInfiniteMeta` / `mapCursorMeta` are no longer exported — meta mapping is now `registry.parseList/parseInfinite/parseCursor` (and the entity-typed `resource.parse*`).
- `useListParams` signature changed to `useListParams(resource, { schema })` (was `useListParams({ searchParams, setSearchParams, schema })`); `react-router-dom` is a new optional peer.
- `createFilters<T>()` now restricts operators by field type (e.g. `contains` only on string fields).
- `defineListSchema`'s `FieldDescriptor` was reshaped into mutually-exclusive modes and the `type` coercion option was removed.
