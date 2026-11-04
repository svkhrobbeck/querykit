# @querykitjs/prisma-pg

## 2.0.1

### Patch Changes

- 14ca0d6: Fixed rows repeating or going missing between `findList` and `findInfinite` pages when the sort column holds equal values. Both methods now end the order on the primary key, in the first key's direction, unless the sort already holds it. The key does not count against `maxSortFields` and need not be in `sortable`. A table with no primary key keeps its order. `findAll`, `findOne` and `findCursor` do not change.
  
  ⚠️ An index on `(col)` alone no longer serves this order directly. PostgreSQL may use an incremental sort, and MongoDB sorts in memory without a compound `(col, _id)` index. On a large table add a compound index on `(col, primary key)`, the one `findCursor` already needs.
- Updated dependencies [7a9c0f8]
- Updated dependencies [0f5bd25]
  - @querykitjs/core@2.1.0

## 2.0.0

### Major Changes

- 307c14c: Request policy in prisma-pg, and branded raw filters (R19).
  
  - **prisma-pg** (breaking): repository options `filterable` (field → operators or `"*"`; relation fields as `"relation.field"`), `sortable` and `limits` (also on the registry) — the same names, defaults, reasons and sites as drizzle-pg. Without `filterable` a client may filter only by `allowedColumns` (else the `forcedColumns` keys, else the `@id` field) with `=` and `in`, and sort only by `@id` and `createdAt`. A refused filter, sort, `cursorKey`, offset or aggregate field throws `QueryKitError` before Prisma is called. A raw Prisma `where` must now be branded with `raw()`; an unbranded one throws `forbidden-key` (README "Migrating to 2.0").
  - **core**: `raw(value)` brands a driver-native filter object with a `Symbol` (a JSON body cannot carry one); `@querykitjs/core/internal` gets `isRaw`, and the policy refuses an unbranded driver object as `forbidden-key`.
  - **drizzle-pg**: a JSON-shaped object that is not a condition or a group is now refused as `forbidden-key` instead of being skipped; drizzle `SQL` fragments are accepted as before.
- 7b341d3: Require Node.js `>=22.12` (`engines`; Node 20 reached end of life) and declare peer ranges as the last two majors, both ends tested by `bun run test:matrix`: `zod ^4` · `mongoose ^8.24 || ^9.11` · `drizzle-orm >=0.44 <0.46` · `class-validator >=0.14 <0.16`, `class-transformer ^0.5`, `reflect-metadata ^0.1.13 || ^0.2` · `react ^18.3 || ^19.2.7`. See each README's Requirements section.
- c365edb: Support Prisma 7 alongside Prisma 6.19: the peer is now `@prisma/client ^6.19 || ^7.10` (was `>=5`; Prisma 5 and older 6.x are no longer supported). Both ends are tested with the `prisma-client` generator and `@prisma/adapter-pg`. The package's types now come from `@prisma/client/runtime/client` (Prisma 7 has no `runtime/library`). Repository code does not change; see the README section "Prisma 7 and Prisma 6" for client setup.

### Patch Changes

- 3d784f3: Adapter parity (task 021): `contains` / `startsWith` / `endsWith` match their value literally (drizzle-pg escapes `%`, `_`, `\`); every filter value is cast to its field type and a mismatch is `invalid-value` instead of a driver error (all three); prisma-pg refuses an unescaped `_` in `like` / `ilike` as `invalid-value`; mongoose `not` follows SQL three-valued logic; NULL sorts first on `asc` and last on `desc` on every adapter (drizzle-pg `NULLS FIRST` / `NULLS LAST`, prisma-pg `{ sort, nulls }` where the field is known optional — runtime model or the `fields` override, which now patches fields by name); a malformed sort item is reported as `invalid-value` (`site: "sort"`).
- b7da794: Each adapter now ships its agent skill in the npm tarball: `skills/querykit-<pkg>/SKILL.md`. It holds the safety rules (`filterable`, `sortable`, `raw()`, `relations`, limits, `strict`, `{ all: true }`, `cursorSecret`), setup, typechecked examples for the common tasks and the shared request contract.
- a60c564: Cursor pagination with a non-unique `cursorKey` (task 012): `findCursor` seeks on `(cursorKey, primary key)` — `(k > v) OR (k = v AND id > i)`, ordered by both — so rows that share a value (for example one `createdAt`) are never skipped or repeated; a primary-key cursor keeps the one-field seek.
  
  - Cursor tokens are v2 (`{ v: 2, k, id }`): only scalar values, cast to the field type; an object, an array, a value that does not fit or an old v1 token is refused with `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` before the driver runs. Start paging from the first page after the upgrade (README "Migrating").
  - New registry option `cursorSecret`: tokens are signed with HMAC-SHA256 (Web Crypto) and an unsigned or altered token is `invalid-value`.
  - **core** (`@querykitjs/core/internal`): `encodeCursorToken` / `decodeCursorToken` and type `CursorToken`; `cursorPage` is async and takes `idField` and `secret`.
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
- b92d749: Use the shared `@querykitjs/core/internal` helpers (cursor tokens, skip diagnostics, transaction context, sort normalization, pagination metas) and split the repository into modules. The public API, the cursor token format and every result are unchanged.
- 02210b4: Scope lists, timestamp names, a `with` allow-list, legacy schemas deprecated (task 014).
  
  - **scope `in`** (all three adapters): a scope value may be `{ in: [...] }`; an empty list matches no row (not an error). `create` / `upsert` fill in the equality scopes only.
  - **`timestamps`** registry option `{ createdAt?, deletedAt? }` (default `createdAt`, `deletedAt`): the default sort and the default `sortable` use that createdAt, soft delete (`softDelete`, `restore`, `withDeleted`) uses that deletedAt.
  - **`relations`** repository option (R21): a client `with` opens only listed relations — `{ columns: [...] | "*", filterable?, nested? }` (mongoose also `model?`). An unlisted relation, column, relation filter field (prisma `where`, mongoose `match`) or nested relation is `QueryKitError` `forbidden-key`, `site: "with"`, before the driver runs; `with: { rel: true }` selects only the listed columns. Breaking: `with` on a repository without `relations` is refused; the mongoose shorthand `{ author: User }` still types `with` but no longer opens it (README "Migrating").
  - **zod / class-validator**: the constant schemas (`baseParamsSchema`, `offsetParamsSchema`, `infiniteParamsSchema`, `cursorParamsSchema`) and DTOs (`BaseParamsDto`, `OffsetParamsDto`, `InfiniteParamsDto`, `CursorParamsDto`) are `@deprecated` — use the `make*` factories; removed in the next major.
  - **core**: `Scope` accepts `ScopeIn`, `SkipSite` `with`, types `RelationRule` / `Relations`; `@querykitjs/core/internal` gets `scopeConditions`, `scopeDefaults`, `checkWith`, `WithDialect`.
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

## 1.0.1

**Fix: `notBetween` matched nothing.** It compiled to a field-level
`{ age: { not: { gte, lte } } }`, but Prisma distributes a field-level negation
over each key and ANDs the results — so `NOT (10 <= age <= 26)` became
`age < 10 AND age > 26`, which is never true. It now emits a where-level
`{ NOT: { age: { gte, lte } } }`, which negates the conjunction as SQL
`NOT BETWEEN` does (and drops NULL rows, matching drizzle-pg).

Found by the real-Postgres smoke test, which now runs green end to end (60
checks) — including the exact-LIKE cases (interior `%`, `_`, escaped literals)
that confirm Prisma passes wildcards through a filter value unescaped.


## 1.0.0

Initial release — a Prisma (PostgreSQL) backend adapter for querykit, at parity
with `@querykitjs/drizzle-pg` and `@querykitjs/mongoose`.

- `createRegistry(prisma)` → `registry.repository("user")`, addressed by Prisma's
  own camelCase delegate key. Row / `select` / `include` types are inferred from
  the delegate, so the package never imports a generated client and builds
  without one.
- Full `@querykitjs/core` filter DSL: nested `and`/`or`/`not`, 27 operators, a raw
  Prisma `where` escape hatch, and `createFilters` for typed field names.
- Three pagination modes (`findList` / `findInfinite` / `findCursor`) returning
  core's snake_case `*Meta`. Cursor tokens are byte-identical to the other
  adapters', so a token survives a backend ORM swap.
- Writes: `create`/`createMany`, `upsert`/`upsertMany`, `updateById`/`updateWhere`,
  `deleteById`/`deleteWhere`, `softDelete`/`restore` with an automatic `updatedAt`
  bump.
- Guards: `scope`, `forcedColumns`/`allowedColumns`, `maxPerPage`/`maxLimit`
  clamps, `strict` mode and the `onSkippedCondition` hook.
- Ambient transactions via `registry.transaction()`.
- Framework-agnostic: no HTTP, Nest or DI imports — Express, Hono, NestJS and
  background jobs all use the same repository.

Cross-adapter behaviour is enforced by `test/contract.ts` (37 checks), which
drives prisma-pg, drizzle-pg and mongoose from the real `@querykitjs/web`
builders and asserts they agree.
