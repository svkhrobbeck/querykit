# @querykitjs/drizzle-pg

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
