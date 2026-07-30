# @querykitjs/prisma-pg

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
