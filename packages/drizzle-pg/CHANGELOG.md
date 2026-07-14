# @querykitjs/drizzle-pg

## 1.1.0

### Minor Changes

- Parity fixes (align with the mongoose adapter):

  - `buildOrderBy` now adds a deterministic `id DESC` fallback after `createdAt`, so offset/keyset pagination is stable even when a table has no `createdAt` column (previously arbitrary order).
  - `pickColumns` is now inclusion-only — a selection drops `false` keys, so `{a:true,b:false}` includes only `a` and an all-`false`/empty object returns the full row (matches `Pick<Row,K>`).
