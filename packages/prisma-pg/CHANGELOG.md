# @querykitjs/prisma-pg

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

See `PARITY.md` for the cross-adapter audit, including the documented
divergences (LIKE patterns Prisma cannot express, field-name resolution, and the
wider wire-value coercion that keeps results identical to drizzle-pg).
