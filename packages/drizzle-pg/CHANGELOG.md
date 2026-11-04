# @querykitjs/drizzle-pg

## 4.0.1

### Patch Changes

- d2ef6dd: Fixed `upsert` and `upsertMany` under drizzle's `casing` option: the default `ON CONFLICT` set wrote `excluded."addressText"` for a column with no explicit name, and PostgreSQL rejected the statement under `casing: "snake_case"`. It now uses the name `casing` gives the column. Columns with an explicit name and connections without `casing` keep their meaning.
- 14ca0d6: Fixed rows repeating or going missing between `findList` and `findInfinite` pages when the sort column holds equal values. Both methods now end the order on the primary key, in the first key's direction, unless the sort already holds it. The key does not count against `maxSortFields` and need not be in `sortable`. A table with no primary key keeps its order. `findAll`, `findOne` and `findCursor` do not change.
  
  ⚠️ An index on `(col)` alone no longer serves this order directly. PostgreSQL may use an incremental sort, and MongoDB sorts in memory without a compound `(col, _id)` index. On a large table add a compound index on `(col, primary key)`, the one `findCursor` already needs.
- Updated dependencies [7a9c0f8]
- Updated dependencies [0f5bd25]
  - @querykitjs/core@2.1.0

## 4.0.0

### Major Changes

- cf30c25: Request policy — safe by default.
  
  - **drizzle-pg** (breaking): repository options `filterable` (field → operators or `"*"`), `sortable` and `limits` (also on the registry). Without `filterable` a client may filter only by `allowedColumns` (else the `forcedColumns` keys, else the primary key) with `=` and `in`, and sort only by the primary key and `createdAt`. A refused filter, sort, `cursorKey`, offset or aggregate key throws `QueryKitError` (`forbidden-key`, `forbidden-operator`, `limit-exceeded`) before any SQL runs, whatever `strict` says. A key the table does not have keeps the `unknown-key` behaviour. Restore 3.x per repository with `filterable: { column: "*" }` and a full `sortable` (README "Migrating to 4.0").
  - **core**: `SkipReason` adds `forbidden-key`, `forbidden-operator`, `limit-exceeded`; `SkipSite` adds `page`; new `Filterable` type. `@querykitjs/core/internal` gets `resolvePolicy`, shared by every adapter.
- 307c14c: Request policy in prisma-pg, and branded raw filters (R19).
  
  - **prisma-pg** (breaking): repository options `filterable` (field → operators or `"*"`; relation fields as `"relation.field"`), `sortable` and `limits` (also on the registry) — the same names, defaults, reasons and sites as drizzle-pg. Without `filterable` a client may filter only by `allowedColumns` (else the `forcedColumns` keys, else the `@id` field) with `=` and `in`, and sort only by `@id` and `createdAt`. A refused filter, sort, `cursorKey`, offset or aggregate field throws `QueryKitError` before Prisma is called. A raw Prisma `where` must now be branded with `raw()`; an unbranded one throws `forbidden-key` (README "Migrating to 2.0").
  - **core**: `raw(value)` brands a driver-native filter object with a `Symbol` (a JSON body cannot carry one); `@querykitjs/core/internal` gets `isRaw`, and the policy refuses an unbranded driver object as `forbidden-key`.
  - **drizzle-pg**: a JSON-shaped object that is not a condition or a group is now refused as `forbidden-key` instead of being skipped; drizzle `SQL` fragments are accepted as before.
- 7b341d3: Require Node.js `>=22.12` (`engines`; Node 20 reached end of life) and declare peer ranges as the last two majors, both ends tested by `bun run test:matrix`: `zod ^4` · `mongoose ^8.24 || ^9.11` · `drizzle-orm >=0.44 <0.46` · `class-validator >=0.14 <0.16`, `class-transformer ^0.5`, `reflect-metadata ^0.1.13 || ^0.2` · `react ^18.3 || ^19.2.7`. See each README's Requirements section.

### Patch Changes

- 3d784f3: Adapter parity (task 021): `contains` / `startsWith` / `endsWith` match their value literally (drizzle-pg escapes `%`, `_`, `\`); every filter value is cast to its field type and a mismatch is `invalid-value` instead of a driver error (all three); prisma-pg refuses an unescaped `_` in `like` / `ilike` as `invalid-value`; mongoose `not` follows SQL three-valued logic; NULL sorts first on `asc` and last on `desc` on every adapter (drizzle-pg `NULLS FIRST` / `NULLS LAST`, prisma-pg `{ sort, nulls }` where the field is known optional — runtime model or the `fields` override, which now patches fields by name); a malformed sort item is reported as `invalid-value` (`site: "sort"`).
- b7da794: Each adapter now ships its agent skill in the npm tarball: `skills/querykit-<pkg>/SKILL.md`. It holds the safety rules (`filterable`, `sortable`, `raw()`, `relations`, limits, `strict`, `{ all: true }`, `cursorSecret`), setup, typechecked examples for the common tasks and the shared request contract.
- a60c564: Cursor pagination with a non-unique `cursorKey` (task 012): `findCursor` seeks on `(cursorKey, primary key)` — `(k > v) OR (k = v AND id > i)`, ordered by both — so rows that share a value (for example one `createdAt`) are never skipped or repeated; a primary-key cursor keeps the one-field seek.
  
  - Cursor tokens are v2 (`{ v: 2, k, id }`): only scalar values, cast to the field type; an object, an array, a value that does not fit or an old v1 token is refused with `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` before the driver runs. Start paging from the first page after the upgrade (README "Migrating").
  - New registry option `cursorSecret`: tokens are signed with HMAC-SHA256 (Web Crypto) and an unsigned or altered token is `invalid-value`.
  - **core** (`@querykitjs/core/internal`): `encodeCursorToken` / `decodeCursorToken` and type `CursorToken`; `cursorPage` is async and takes `idField` and `secret`.
- c5e6168: Use the shared `@querykitjs/core/internal` helpers (cursor tokens, skip diagnostics, transaction context, sort normalization, pagination metas) and split the repository into modules. The public API, the cursor token format and every result are unchanged.
  
  One fix for malformed input: a `sort` item without a `key` (`null`, `{}`) is now dropped, as `@querykitjs/prisma-pg` and `@querykitjs/mongoose` already do — before, it threw a `TypeError` (a 500). It is not reported through `onSkippedCondition` and does not throw under `strict`.
- 5e0551f: Request policy in mongoose, LIKE wildcard limit, read time limit.
  
  - **mongoose** (breaking): repository `filterable` / `sortable` / `limits` (also on the registry) — the same names, defaults, reasons and sites as drizzle-pg and prisma-pg (`id` ≡ `_id`). An unbranded raw Mongo filter (`{ $where }`, `{ $expr }`, `{ path: { $regex } }`) is refused as `forbidden-key`; wrap server-side filters in `raw()`. Every read (`find`, `findOne`, `countDocuments`, `aggregate`) runs with `maxTimeMS` (registry / repository option, default 2000); a timeout throws `QueryKitTimeoutError`. A run of `%%` in a LIKE pattern compiles to one `.*`. README "Migrating to 3.0".
  - **core**: `QueryLimits.maxLikeWildcards` (`DEFAULT_MAX_LIKE_WILDCARDS` = 2) checked by the adapter policy for `like` / `ilike` / `notLike`; `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`).
  - **drizzle-pg**, **prisma-pg**: a LIKE pattern with more than `maxLikeWildcards` wildcards is refused as `limit-exceeded` (inside their pending majors).
- 735749f: Bulk mutations and counts (task 013).
  
  - `updateWhere(filter, patch, options?)` / `deleteWhere(filter, options?)` are one write on every adapter (prisma-pg and mongoose no longer read before the write) and return `{ count }`; with `{ returning: { limit } }` they return `{ count, rows }` (README "Bulk update and delete" says which rows are atomic per adapter). Before: `Row[]`.
  - An empty filter (`undefined`, `{}`, `[]`, or every condition skipped) is refused with `QueryKitError` `reason: "empty-filter"`, `site: "mutation"` before the driver runs; `{ all: true }` asks for every row (the scope still applies). A mutation filter passes `filterable` and `limits` like a read's.
  - `findList({ withTotal: false })` runs no count: `perPage + 1` rows, `has_next` from the extra row, `total_items` / `total_pages` `null`.
  - README "Transactions": only database work inside the callback — external effects through an outbox, the driver may retry.
  - **core**: `SkipReason` `empty-filter`, `SkipSite` `mutation`, `OffsetMeta` totals `number | null`, `WireOffsetParams.withTotal`, types `AllRows`, `MutationOptions`, `MutationCount`, `MutationRows`; `@querykitjs/core/internal` gets `isAllRows`, `isEmptyFilter`, `refuseEmptyFilter`, `offsetPageWithoutTotal`.
- 02210b4: Scope lists, timestamp names, a `with` allow-list, legacy schemas deprecated (task 014).
  
  - **scope `in`** (all three adapters): a scope value may be `{ in: [...] }`; an empty list matches no row (not an error). `create` / `upsert` fill in the equality scopes only.
  - **`timestamps`** registry option `{ createdAt?, deletedAt? }` (default `createdAt`, `deletedAt`): the default sort and the default `sortable` use that createdAt, soft delete (`softDelete`, `restore`, `withDeleted`) uses that deletedAt.
  - **`relations`** repository option (R21): a client `with` opens only listed relations — `{ columns: [...] | "*", filterable?, nested? }` (mongoose also `model?`). An unlisted relation, column, relation filter field (prisma `where`, mongoose `match`) or nested relation is `QueryKitError` `forbidden-key`, `site: "with"`, before the driver runs; `with: { rel: true }` selects only the listed columns. Breaking: `with` on a repository without `relations` is refused; the mongoose shorthand `{ author: User }` still types `with` but no longer opens it (README "Migrating").
  - **zod / class-validator**: the constant schemas (`baseParamsSchema`, `offsetParamsSchema`, `infiniteParamsSchema`, `cursorParamsSchema`) and DTOs (`BaseParamsDto`, `OffsetParamsDto`, `InfiniteParamsDto`, `CursorParamsDto`) are `@deprecated` — use the `make*` factories; removed in the next major.
  - **core**: `Scope` accepts `ScopeIn`, `SkipSite` `with`, types `RelationRule` / `Relations`; `@querykitjs/core/internal` gets `scopeConditions`, `scopeDefaults`, `checkWith`, `WithDialect`.
- 33bc073: A text-pattern operator (`contains` / `startsWith` / `endsWith` / `like` / `ilike` / `notLike` and the `%_%` tokens) on a non-text column (timestamp, number, boolean, uuid, enum …) is now `invalid-value`: the condition is skipped and reported through `onSkippedCondition`, a `QueryKitError` under `strict`, and the driver is not called. Before, Postgres rejected `timestamptz ~~* text` and the request failed with a 500. prisma-pg already skips it on a non-String field, mongoose and mongodb on a Date path.
- Updated dependencies [3d784f3]
- Updated dependencies [f5639d8]
- Updated dependencies [4d440e3]
- Updated dependencies [e88d791]
- Updated dependencies [a60c564]
- Updated dependencies [cf30c25]
- Updated dependencies [5e0551f]
- Updated dependencies [307c14c]
- Updated dependencies [735749f]
- Updated dependencies [7b341d3]
- Updated dependencies [0eedc06]
- Updated dependencies [02210b4]
  - @querykitjs/core@2.0.0

## 3.0.0

### Major Changes

- fc6a514: Repository-level projection guards, pagination clamps, and visible (optionally
  fatal) dropped conditions.

  **BREAKING:** `RepoConfig` is gone from both adapters — the type is now
  `RepositoryOptions`, one name across adapters. There is no deprecated alias; pin
  the previous major if you need the old name.

  Protecting a response used to be the route's job: every list endpoint repeated
  `{ ...params, columns: SAFE_COLUMNS }`, where writing the spread the other way
  round leaks the password column. The guard now lives with `scope`, in the
  repository, where it cannot be written wrong.

  - `RepositoryOptions` gains `forcedColumns` (the client's `columns` is ignored)
    and `allowedColumns` (it is intersected). An empty intersection yields the
    allowlist, never the full row — a request for a forbidden column is then merely
    useless instead of catastrophic. An empty guard is refused when the repository
    is built, since "select nothing" means "select everything" downstream.
  - `registry.repository(table, options?, extend?)` — all four arities, the same in
    both adapters. mongoose was dropping its options object on the floor, so
    `scope` only ever worked through `scoped()`; it now reaches `buildRepository`.
  - `findCursor` force-includes the cursor column so tokens work, and `cursorKey`
    comes from the client — under a guard that was a way to read a forbidden
    column. The column stays in the query and is stripped from the returned rows.
  - `aggregate` honours the guard too: `min(password)` or a `groupBy` on a hidden
    column leaks as much as a projection does.
  - `maxPerPage` / `maxLimit` on `createRegistry` (core defaults, 200), clamped in
    `findList`/`findInfinite`/`findCursor` — validation can be bypassed, this cannot.
  - Filter/sort/`cursorKey`/`idKey` keys accept any string (`LooseColumnKey` /
    `LooseFieldKey`), so a validated payload needs no `as` cast; autocomplete is
    preserved. Compile-time asserts pin that core's wire shapes are assignable to
    the repository params.
  - `strict` and `onSkippedCondition` on `createRegistry`. `strict` is `false` by
    default, so existing endpoints behave exactly as before and only the hook fires;
    a filter exists to _narrow_ a result set, so a mistyped key that vanishes
    silently makes an endpoint return more rows than intended. `scope` and
    `cursorKey` keys are always fatal, regardless of `strict`.
  - `buildRepository` looked the table up by object identity and, on failure, said
    only "table was not found in the provided schema". It now distinguishes a
    duplicate schema import (a same-named table under a different instance — by far
    the common cause) from a genuinely absent table, and lists the available ones.

  `core` gains `SkippedCondition` / `SkipReason` / `SkipSite` and the `QueryKitError`
  class both adapters throw, so a backend handles either identically.

### Minor Changes

- fc6a514: Cast wire date values before they reach the driver.

  A JSON body can only carry a date as a string, and a `timestamp`/`date` column in
  drizzle's default `mode: "date"` is mapped through JS — so drizzle called
  `value.toISOString()` on the string and every such filter returned a 500. This
  affected every drizzle-pg user with a timestamp column, which is most of them.

  Coercion now sits in one place, before the operator builder, so scalars, `in`
  arrays and `between` tuples are all covered at once. `findCursor` re-casts the
  decoded cursor as well: a token stores dates as ISO strings, so page 2 of a
  date-keyed feed crashed the same way.

  Text-pattern operators (`like`/`contains`/…) are exempt, or `ilike` on a date
  column would receive `String(Date)` instead of the caller's string. The list lives
  in core as `TEXT_FILTER_OPERATORS` so the two adapters cannot diverge on it.

  A value that cannot be cast now drops the condition instead of reaching the
  driver — the same contract `operators.ts` already used for a non-array `in`. One
  bad element invalidates a whole `in` list, so a half-applied filter cannot
  silently widen a result set. Phase 05's `onSkippedCondition` makes these visible.

  The mongoose adapter gets the same layer with the same function names, scoped to
  `Date` paths so both adapters judge exactly the same set of values. A text pattern
  on a `Date` path is now skipped rather than raising `Can't use $options with
Date` — that crash predates this change.

  Also in core: `createFilters` was missing `notBetween` while both adapters
  implement the operator.

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

## 2.0.0

### Major Changes

- Standardize sort on one canonical shape: `{ key, direction }[]` — always an array, multi-field capable.

  - **core:** adds shared `SortItem<TKey>` / `Sort<TKey>` types (used by every package).
  - **web:** `Sort`/`SortInput` are now `{ key, direction }[]`; `SortInput` also accepts a `["-field"]` shorthand that `normalizeSort` maps for you. `encodeSort`/`decodeSort` handle multi-field URL sync (`sortType=-createdAt,id`). **BREAKING:** the single `"-createdAt"` string and `{ name, direction }` sort forms are removed.
  - **drizzle-pg:** `Sort` is `{ key, direction }[]`. **BREAKING:** the `{ name }` and single-object sort shapes are removed. `buildOrderBy` also gains an `id DESC` fallback for deterministic pagination when no `createdAt` exists.
  - **zod:** `sortSchema` validates `{ key, direction }[]` only. **BREAKING:** string and `{ name }` sort inputs are now rejected.

### Patch Changes

- Updated dependencies
  - @querykitjs/core@1.1.0

## 1.1.0

### Minor Changes

- Parity fixes (align with the mongoose adapter):

  - `buildOrderBy` now adds a deterministic `id DESC` fallback after `createdAt`, so offset/keyset pagination is stable even when a table has no `createdAt` column (previously arbitrary order).
  - `pickColumns` is now inclusion-only — a selection drops `false` keys, so `{a:true,b:false}` includes only `a` and an all-`false`/empty object returns the full row (matches `Pick<Row,K>`).
