# @querykitjs/web

## 3.1.0

### Minor Changes

- fc6a514: Safe-by-default request validation, with the pagination cap shared across packages.

  `@querykitjs/zod` only exported constant schemas, so every app patched the same
  two holes by hand: `perPage` had no upper bound, and `columns` / `with` /
  `withDeleted` were accepted from the client — meaning a request could ask for
  `{ password: true }`, pull arbitrary relations, or switch off the soft-delete
  guard.

  - `makeOffsetParamsSchema` / `makeInfiniteParamsSchema` / `makeCursorParamsSchema`,
    each taking `ParamsSchemaOptions`.
  - Capped at core's `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200) by default,
    and the three server-owned fields are absent from the schema, so a client that
    sends them has them stripped.
  - `allow: ["withDeleted"]` opts a field back in, in the type as well as at
    runtime — an untyped `allow` would leave callers believing `columns` arrives
    when it does not, which is the same footgun.
  - Named schema/param types are exported (`OffsetParamsSchema<TAllow>`,
    `MadeOffsetParams<TAllow>`, …), because `ReturnType<typeof
makeOffsetParamsSchema>` silently resolves to `any` for a function with a
    `const` type parameter.

  The existing constants are untouched, so this is additive; smoke cases now pin
  that they still have no cap and still accept all three fields.

  `core` gains `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` as the single source for
  the cap, and `@querykitjs/web` clamps from the same constant (configurable on both `createQuery`
  and `createRegistry`) — so the frontend
  never sends a request the server will reject.

### Patch Changes

- fc6a514: Apply the REVIEW.md follow-ups (retroactive changeset for a change that shipped
  to `main` without one).

  The param building blocks shared by every adapter — `Scope`, `UpsertOptions`,
  `AggregateSpec` — moved into `@querykitjs/core`; the adapters now re-specialize
  them over their own key type instead of declaring their own copies. `web`'s
  payload type declares `withDeleted`, and the cursor schema no longer inherits an
  unused `sort`.

  Type-level only: no runtime behaviour changed.

- Updated dependencies [fc6a514]
- Updated dependencies [fc6a514]
- Updated dependencies [fc6a514]
- Updated dependencies [fc6a514]
  - @querykitjs/core@1.2.0

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
