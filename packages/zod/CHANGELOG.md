# @querykitjs/zod

## 3.0.0

### Major Changes

- 7b341d3: Require Node.js `>=22.12` (`engines`; Node 20 reached end of life) and declare peer ranges as the last two majors, both ends tested by `bun run test:matrix`: `zod ^4` · `mongoose ^8.24 || ^9.11` · `drizzle-orm >=0.44 <0.46` · `class-validator >=0.14 <0.16`, `class-transformer ^0.5`, `reflect-metadata ^0.1.13 || ^0.2` · `react ^18.3 || ^19.2.7`. See each README's Requirements section.
- 0eedc06: Request limits: every filter and pagination request is bounded in size at parse time.
  
  - **core**: `DEFAULT_MAX_FILTER_DEPTH` (5), `DEFAULT_MAX_CONDITIONS` (30), `DEFAULT_MAX_IN_ITEMS` (200), `DEFAULT_MAX_STRING_LENGTH` (256), `DEFAULT_MAX_OFFSET` (10 000), `DEFAULT_MAX_SORT_FIELDS` (3), the `QueryLimits` type, `DEFAULT_QUERY_LIMITS` and `resolveLimits(partial)`. `@querykitjs/core/internal` gets the iterative `findFilterLimitViolation` walk the validators share.
  - **zod** (breaking): the factories take `limits` and the constant schemas apply the core defaults. A payload past a limit is rejected (`filter exceeds maxInItems (200)`); a 10 000-level `not` chain is rejected before the recursive schema runs, without a stack overflow. `offsetParamsSchema` and `makeOffsetParamsSchema()` carry an object-level check, so zod 4 refuses `.pick()` / `.omit()` on them.
  - **class-validator**: `validateFilter`, `validateSort`, the DTOs and the DTO factories (`limits`) apply the same limits; new `IsWithinMaxOffset` decorator; new message key `querykit.limit.exceeded` in en/uz/ru; `querykit.filter.max_depth` now names `maxDepth (5)`.
  - **web**: the list and infinite builders throw an `Error` for an offset past `maxOffset` or more than `maxSortFields` sort fields instead of building the payload (`QueryConfig` / registry `defaults`: `maxOffset`, `maxSortFields`). Filter limits stay with the server.

### Minor Changes

- a363017: The web package follows the 012–014 backend contract (task 015).
  
  - **`timestamps`** registry option `{ createdAt? }`: names the default `list` / `infinite` sort field (`[{ key: createdAt, direction: "desc" }]`), like the backend registry; `defaults.sort` still wins.
  - **`withTotal`**: `buildListParams` / `resource.list` send `withTotal` when given; `parseList` keeps a server `null` total — `Meta.totalCount` / `Meta.totalPages` are typed `number | null` (an absent total is still `0`). zod (`makeOffsetParamsSchema`, `offsetParamsSchema`) and class-validator (`makeOffsetParamsDto`, `OffsetParamsDto`) accept `withTotal`.
  - **`isQueryKitError(body)`** and `QueryKitErrorBody`: recognise the `QueryKitError.info` shape (`reason`, `site`, `key`) in a 400 response.
  - **`resource.search(term, fields, { operation })`**: `contains` (default, unchanged), `startsWith` or `endsWith`.
  - **URL readers clamp instead of throwing**: `readListParams`, `searchParamsToPayload`, `resource.fromSearchParams` and the hooks cut a URL `page` past `maxOffset` to the last allowed page and a sort past `maxSortFields` to its first fields, with `clamped: true` (non-enumerable on payloads — never sent); the hooks return `clamped`. Direct builder calls still throw.

### Patch Changes

- f5639d8: Smaller bundles: every export tree-shakes on its own (task 016).
  
  - **core**: `@querykitjs/core/internal` no longer imports `node:async_hooks` statically (it is loaded when an adapter creates its context store), so `@querykitjs/zod` and `@querykitjs/class-validator` bundle for the browser; the build no longer uses `keepNames`, and `f` is marked pure — importing one constant now costs ~180 B instead of ~850 B.
  - **zod**: importing one schema no longer keeps every schema (`sortSchema` alone: ~9 % of the entry instead of 76 %).
  - **class-validator**: the deprecated static DTOs and the load-time decorators are split into their own chunks, so importing a constant or a message catalog no longer carries every decorator (one constant: ~9 KB → ~0.5 KB minified).
  - All packages: minified builds (class names kept where they are public), `exports` with separate `import` / `require` types (`.d.ts` / `.d.cts`) and node10 `typesVersions` for subpaths — `publint` and `attw` report no problems. Public API and types are unchanged.
- 02210b4: Scope lists, timestamp names, a `with` allow-list, legacy schemas deprecated (task 014).
  
  - **scope `in`** (all three adapters): a scope value may be `{ in: [...] }`; an empty list matches no row (not an error). `create` / `upsert` fill in the equality scopes only.
  - **`timestamps`** registry option `{ createdAt?, deletedAt? }` (default `createdAt`, `deletedAt`): the default sort and the default `sortable` use that createdAt, soft delete (`softDelete`, `restore`, `withDeleted`) uses that deletedAt.
  - **`relations`** repository option (R21): a client `with` opens only listed relations — `{ columns: [...] | "*", filterable?, nested? }` (mongoose also `model?`). An unlisted relation, column, relation filter field (prisma `where`, mongoose `match`) or nested relation is `QueryKitError` `forbidden-key`, `site: "with"`, before the driver runs; `with: { rel: true }` selects only the listed columns. Breaking: `with` on a repository without `relations` is refused; the mongoose shorthand `{ author: User }` still types `with` but no longer opens it (README "Migrating").
  - **zod / class-validator**: the constant schemas (`baseParamsSchema`, `offsetParamsSchema`, `infiniteParamsSchema`, `cursorParamsSchema`) and DTOs (`BaseParamsDto`, `OffsetParamsDto`, `InfiniteParamsDto`, `CursorParamsDto`) are `@deprecated` — use the `make*` factories; removed in the next major.
  - **core**: `Scope` accepts `ScopeIn`, `SkipSite` `with`, types `RelationRule` / `Relations`; `@querykitjs/core/internal` gets `scopeConditions`, `scopeDefaults`, `checkWith`, `WithDialect`.
- 0249ba2: Both validators now ship an agent skill in the npm tarball: `skills/querykit-<pkg>/SKILL.md`. It holds the safety rules (factories, server-owned `columns` / `with` / `withDeleted`, limits, `allowedKeys` / `maxDepth`), setup, typechecked examples and the shared request contract.
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

## 2.1.0

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
