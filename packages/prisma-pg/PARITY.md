# Cross-adapter parity — `prisma-pg` ↔ `drizzle-pg` ↔ `mongoose`

> The whole promise of querykit is that **one wire payload behaves the same on
> every backend**: `@querykitjs/web` builds a filter, `@querykitjs/zod` or
> `@querykitjs/class-validator` validates it, and whichever adapter the server
> runs must return the same rows. If the adapters diverge, the frontend contract
> is a lie.
>
> This file is the audit. It is re-walked at every phase of the adapter's
> development, and any divergence that cannot be removed is listed **openly** in
> §5 rather than left to be discovered in production.
>
> Sources compared, line by line:
> `packages/drizzle-pg/src/internal/operators.ts` ·
> `packages/mongoose/src/internal/operators.ts` ·
> `packages/prisma-pg/src/internal/operators.ts`.

## 1. Operator table (27 operators)

`v` = the caller's value. Postgres adapters (drizzle-pg, prisma-pg) are compared
on the **SQL** they produce; mongoose on the Mongo predicate.

| Operator           | drizzle-pg (SQL)          | mongoose (Mongo)                     | prisma-pg (Prisma `where`)                | Same? |
| ------------------ | ------------------------- | ------------------------------------ | ----------------------------------------- | :---: |
| `=`, `eq`          | `c = v`                   | `{$eq: v}`                           | `{equals: v}`                             |  ✅   |
| `!=`, `ne`         | `c <> v`                  | `{$nin: [v, null]}`                  | `{not: v}`                                |  ✅   |
| `>`, `gt`          | `c > v`                   | `{$gt: v}`                           | `{gt: v}`                                 |  ✅   |
| `>=`, `gte`        | `c >= v`                  | `{$gte: v}`                          | `{gte: v}`                                |  ✅   |
| `<`, `lt`          | `c < v`                   | `{$lt: v}`                           | `{lt: v}`                                 |  ✅   |
| `<=`, `lte`        | `c <= v`                  | `{$lte: v}`                          | `{lte: v}`                                |  ✅   |
| `contains`, `%_%`  | `c ILIKE '%v%'`           | `{$regex: esc(v), $options:"i"}`     | `{contains: v, mode:"insensitive"}`       |  ✅   |
| `startsWith`, `%_` | `c ILIKE 'v%'`            | `{$regex: "^"+esc(v), $options:"i"}` | `{startsWith: v, mode:"insensitive"}`     |  ✅   |
| `endsWith`, `_%`   | `c ILIKE '%v'`            | `{$regex: esc(v)+"$", $options:"i"}` | `{endsWith: v, mode:"insensitive"}`       |  ✅   |
| `like`             | `c LIKE v` (raw pattern)  | `$regex` from the LIKE pattern       | pattern **translated** (see §5.1)         |  ⚠️   |
| `ilike`            | `c ILIKE v` (raw pattern) | `$regex` + `i`                       | pattern translated + `mode:"insensitive"` |  ⚠️   |
| `notLike`          | `c NOT LIKE v`            | `{$not: regex, $ne: null}`           | `{not: <translated>}`                     |  ⚠️   |
| `in`               | `c IN (…)`                | `{$in: v}`                           | `{in: v}`                                 |  ✅   |
| `notIn`            | `c NOT IN (…)`            | `{$nin: [...v, null]}`               | `{notIn: v}`                              |  ✅   |
| `between`          | `c BETWEEN a AND b`       | `{$gte: a, $lte: b}`                 | `{gte: a, lte: b}`                        |  ✅   |
| `notBetween`       | `c NOT BETWEEN a AND b`   | `{$not: {…}, $ne: null}`             | `{not: {gte: a, lte: b}}`                 |  ✅   |
| `isNull`           | `c IS NULL`               | `{$eq: null}`                        | `{equals: null}`                          |  ✅   |
| `isNotNull`        | `c IS NOT NULL`           | `{$ne: null}`                        | `{not: null}`                             |  ✅   |

**Case sensitivity** — identical across all three: `contains`/`startsWith`/`endsWith`
are case-**insensitive**; `like` is case-**sensitive**; `ilike` is case-insensitive.

**Invalid values** — identical across all three: a non-array `in`/`notIn` and a
non-2-tuple `between`/`notBetween` drop the condition (and report it through
`onSkippedCondition`, or throw in `strict` mode).

## 2. Repository surface

Every method name, argument order, default and return shape below was compared
against `packages/drizzle-pg/src/repository.ts` and
`packages/mongoose/src/repository.ts`.

| Method                       | Signature                    | Defaults                                                           | Returns                        | Same? |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------ | :---: |
| `findAll`                    | `(params?)`                  | —                                                                  | `Row[]`                        |  ✅   |
| `findOne`                    | `(params?)`                  | —                                                                  | `Row \| undefined`             |  ✅   |
| `findById`                   | `(id, params?)`              | `idKey: "id"`                                                      | `Row \| undefined`             |  ✅   |
| `findList`                   | `(params?)`                  | `page: 1`, `perPage: defaultPerPage`                               | `{ data, meta: OffsetMeta }`   |  ✅   |
| `findInfinite`               | `(params?)`                  | `limit: defaultLimit`, `offset: 0`                                 | `{ data, meta: InfiniteMeta }` |  ✅   |
| `findCursor`                 | `(params?)`                  | `limit`, `cursorKey: "id"`, `order: "asc"`, `direction: "forward"` | `{ data, meta: CursorMeta }`   |  ✅   |
| `count` / `exists`           | `(filter?)`                  | —                                                                  | `number` / `boolean`           |  ✅   |
| `create` / `createMany`      | `(values)`                   | —                                                                  | `Row` / `Row[]`                |  ✅   |
| `upsert` / `upsertMany`      | `(values, { target, set? })` | `set` = values minus target                                        | `Row` / `Row[]`                |  ✅   |
| `updateById`                 | `(id, patch, idKey?)`        | `idKey: "id"`                                                      | `Row \| undefined`             |  ✅   |
| `updateWhere`                | `(filter, patch)`            | —                                                                  | `Row[]`                        |  ✅   |
| `deleteById` / `deleteWhere` | `(id, idKey?)` / `(filter)`  | `idKey: "id"`                                                      | `Row \| undefined` / `Row[]`   |  ✅   |
| `softDelete` / `restore`     | `(id, idKey?)`               | `idKey: "id"`                                                      | `Row \| undefined`             |  ✅   |
| `aggregate`                  | `(spec)`                     | —                                                                  | `AggregateRow[]`               |  ✅   |
| `scoped`                     | `(scope)`                    | —                                                                  | a new `Repository`             |  ✅   |

Registry surface — `createRegistry(client, options?)` with `defaultPerPage`,
`defaultLimit`, `maxPerPage`, `maxLimit`, `strict`, `onSkippedCondition`; the
same four `repository()` overloads (key/handle, `+options`, `+extender`,
`+both`); `transaction(fn)` with ambient (AsyncLocalStorage) propagation. The
per-repository options `scope`, `forcedColumns`, `allowedColumns` behave
identically, including "an empty intersection falls back to the allowlist, never
to the full row" and the build-time throw on an empty guard or unresolvable
scope key.

**Behavioural details verified identical** (all covered by `test/query.ts`):
`clampPageSize` = `min(max, max(1, trunc(requested ?? fallback)))` · unknown
filter/sort key skipped and reported · unknown `cursorKey` always fatal
(`QueryKitError`) · cursor key forced into the projection but stripped from
guarded rows · `updatedAt` bumped on every update path · soft-delete guard ANDed
into reads and lifted by `withDeleted` · scope defaulted into inserts (scope
wins) · `aggregate` honours the projection guard.

Two internal implementations differ while the observable contract does not, both
because Prisma returns counts where the other ORMs return rows:

| Method        | drizzle-pg               | mongoose                             | prisma-pg                                       |
| ------------- | ------------------------ | ------------------------------------ | ----------------------------------------------- |
| `createMany`  | one `INSERT … RETURNING` | `insertMany`                         | `createManyAndReturn`, else sequential `create` |
| `updateById`  | `UPDATE … RETURNING`     | `findOneAndUpdate`                   | `findFirst` (id only) → `update` by that id     |
| `updateWhere` | `UPDATE … RETURNING`     | collect ids → `updateMany` → re-read | collect ids → `updateMany` → re-read            |
| `upsertMany`  | chunked `ON CONFLICT`    | chunked `bulkWrite`                  | sequential `upsert` (Prisma has no bulk upsert) |

⚠️ `updateById`/`deleteById` on prisma-pg require a **single-field `@id`**
(Prisma's `update`/`delete` only accept a unique `where`, and querykit's
predicate also carries scope + soft-delete). A model with a composite `@@id`
throws a clear error naming `updateWhere`/`deleteWhere` as the alternative.

## 3. Pagination meta formulas

Identical arithmetic in all three adapters — re-derived from the source, and
pinned by `test/query.ts` §9–10.

| Field                         | Formula                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `total_items`                 | `count(where)`                                                     |
| `total_pages`                 | `ceil(total_items / perPage)`                                      |
| `current_page`                | `max(1, trunc(page ?? 1))`                                         |
| `per_page`                    | `clampPageSize(perPage, defaultPerPage, maxPerPage)`               |
| `has_next` / `has_prev`       | `page < total_pages` / `page > 1`                                  |
| `limit` / `offset`            | `clampPageSize(limit, …)` / `max(0, trunc(offset ?? 0))`           |
| `count` (infinite)            | rows returned after trimming the probe row                         |
| `has_more`                    | `rows.length > limit` (query takes `limit + 1`)                    |
| `next_offset`                 | `has_more ? offset + limit : null`                                 |
| `has_next` (cursor)           | forward: `hasExtra` · backward: `cursor !== undefined`             |
| `has_prev` (cursor)           | forward: `cursor !== undefined` · backward: `hasExtra`             |
| `next_cursor` / `prev_cursor` | `encodeCursor` of the last / first row's cursor field, else `null` |

Keyset direction: `ascInQuery = direction === "forward" ? order === "asc" : order === "desc"`,
seek with `gt`/`lt` accordingly, and a backward page is reversed before it is
returned — the same three lines in all three adapters.

## 4. NULL semantics

Postgres' three-valued logic means `NOT (pred)`, `<>`, `NOT IN` and `NOT LIKE`
all exclude NULL rows on their own. drizzle-pg relies on that; **prisma-pg relies
on it too** (Prisma compiles these straight to SQL), so the two Postgres adapters
agree without any extra guard.

The mongoose adapter adds explicit `$ne: null` / `$nin: [v, null]` guards for the
same operators — not a divergence, but the opposite: they exist precisely to make
MongoDB's two-valued logic produce the SQL answer.

_Confirmed against a real database in phase 4._

## 5. Known divergences

### 5.1 `like` / `ilike` / `notLike` with wildcards Prisma cannot express

Prisma's `where` has no raw SQL `LIKE`, only `equals`/`contains`/`startsWith`/
`endsWith`. prisma-pg therefore **translates** the pattern:

| Pattern                                   | prisma-pg                           | Same rows as drizzle-pg? |
| ----------------------------------------- | ----------------------------------- | :----------------------: |
| `%ali%`                                   | `contains: "ali"`                   |            ✅            |
| `ali%`                                    | `startsWith: "ali"`                 |            ✅            |
| `%ali`                                    | `endsWith: "ali"`                   |            ✅            |
| `ali`                                     | `equals: "ali"`                     |            ✅            |
| `%`                                       | `endsWith: ""` (every non-NULL row) |            ✅            |
| `a%b` (interior `%`)                      | **dropped + reported**              |            ❌            |
| `a_b` (any `_`)                           | **dropped + reported**              |            ❌            |
| `%50\%%` (escaped `%` inside a substring) | **dropped + reported**              |            ❌            |

The last three are dropped rather than approximated **on purpose**. Degrading
`ali%` to `contains: "ali"` would make it match `"vali ali"` — the filter would
return _more_ rows than on the other backends, which is the worst possible
failure mode for a cross-adapter contract. A drop is loud (`onSkippedCondition`,
or a `QueryKitError` in `strict` mode) and never widens a result set.

mongoose translates the full LIKE grammar into a regex, so it _can_ serve `a%b`
and `a_b`. Applications that need those patterns on Postgres should use the raw
`where` escape hatch.

### 5.2 Field-name resolution

drizzle-pg's `resolveColumn` accepts either the JS property (`createdAt`) or the
DB column (`created_at`). prisma-pg accepts **only the Prisma field name**
(`createdAt`), because that is all Prisma's `where` itself accepts — a `@map`ped
column name is not addressable. mongoose likewise accepts only schema paths
(plus the `id` → `_id` alias).

Practical impact: none for clients that send the field names querykit documents;
a client sending snake_case keys to drizzle-pg would silently get them skipped by
prisma-pg. Both report the drop via `onSkippedCondition`.

### 5.3 Wire-value coercion is wider here (and that _restores_ parity)

A JSON body or query string carries `"18"`, not `18`. drizzle-pg passes it to
Postgres, which casts it; mongoose casts it against the schema. Prisma does
neither — it validates argument types in the client and throws
`PrismaClientValidationError`, i.e. **a 500 where the other two adapters return
rows**.

prisma-pg therefore casts `Int`/`BigInt`/`Float`/`Decimal`/`Boolean`/`DateTime`
wire values itself (drizzle-pg and mongoose only cast dates, because that is the
only cast their ORM won't do). A value that cannot be represented — `"18.5"` on
an `Int`, `"maybe"` on a `Boolean` — is dropped and reported rather than sent on
to crash the request. Net effect: **same rows as drizzle-pg**, never a 500.

### 5.4 Text operators on non-text fields

drizzle-pg can `ILIKE` a timestamp (Postgres renders it as text). Prisma rejects
`contains`/`mode` on a non-`String` field, and Mongo rejects `$regex` on a Date,
so **prisma-pg and mongoose both drop** the condition and report
`invalid-value`. Exact parity is not reachable here; a non-crashing, observable
skip is the agreed behaviour on both.
