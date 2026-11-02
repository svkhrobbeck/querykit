---
"@querykitjs/drizzle-pg": patch
"@querykitjs/prisma-pg": patch
"@querykitjs/mongoose": patch
"@querykitjs/zod": patch
"@querykitjs/class-validator": patch
"@querykitjs/core": minor
---

Scope lists, timestamp names, a `with` allow-list, legacy schemas deprecated (task 014).

- **scope `in`** (all three adapters): a scope value may be `{ in: [...] }`; an empty list matches no row (not an error). `create` / `upsert` fill in the equality scopes only.
- **`timestamps`** registry option `{ createdAt?, deletedAt? }` (default `createdAt`, `deletedAt`): the default sort and the default `sortable` use that createdAt, soft delete (`softDelete`, `restore`, `withDeleted`) uses that deletedAt.
- **`relations`** repository option (R21): a client `with` opens only listed relations — `{ columns: [...] | "*", filterable?, nested? }` (mongoose also `model?`). An unlisted relation, column, relation filter field (prisma `where`, mongoose `match`) or nested relation is `QueryKitError` `forbidden-key`, `site: "with"`, before the driver runs; `with: { rel: true }` selects only the listed columns. Breaking: `with` on a repository without `relations` is refused; the mongoose shorthand `{ author: User }` still types `with` but no longer opens it (README "Migrating").
- **zod / class-validator**: the constant schemas (`baseParamsSchema`, `offsetParamsSchema`, `infiniteParamsSchema`, `cursorParamsSchema`) and DTOs (`BaseParamsDto`, `OffsetParamsDto`, `InfiniteParamsDto`, `CursorParamsDto`) are `@deprecated` — use the `make*` factories; removed in the next major.
- **core**: `Scope` accepts `ScopeIn`, `SkipSite` `with`, types `RelationRule` / `Relations`; `@querykitjs/core/internal` gets `scopeConditions`, `scopeDefaults`, `matchesNothing`, `checkWith`, `WithDialect`.
