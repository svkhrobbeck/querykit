# @querykitjs/web

## 3.0.0

### Major Changes

- Standardize sort on one canonical shape: `{ key, direction }[]` — always an array, multi-field capable.

  - **core:** adds shared `SortItem<TKey>` / `Sort<TKey>` types (used by every package).
  - **web:** `Sort`/`SortInput` are now `{ key, direction }[]`; `SortInput` also accepts a `["-field"]` shorthand that `normalizeSort` maps for you. `encodeSort`/`decodeSort` handle multi-field URL sync (`sortType=-createdAt,id`). **BREAKING:** the single `"-createdAt"` string and `{ name, direction }` sort forms are removed.
  - **drizzle-pg:** `Sort` is `{ key, direction }[]`. **BREAKING:** the `{ name }` and single-object sort shapes are removed. `buildOrderBy` also gains an `id DESC` fallback for deterministic pagination when no `createdAt` exists.
  - **zod:** `sortSchema` validates `{ key, direction }[]` only. **BREAKING:** string and `{ name }` sort inputs are now rejected.

### Patch Changes

- Updated dependencies
  - @querykitjs/core@1.1.0

## 2.0.1

### Patch Changes

- Docs: add npm/license badges to the README (en + uz).

## 2.0.0

### Major Changes

- 212e437: Registry API + adapter-aware querying, with a reshaped standalone surface.

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
