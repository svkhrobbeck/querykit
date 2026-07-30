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

| Operator           | drizzle-pg (SQL)          | mongoose (Mongo)                     | prisma-pg (Prisma `where`)               | Same? |
| ------------------ | ------------------------- | ------------------------------------ | ---------------------------------------- | :---: |
| `=`, `eq`          | `c = v`                   | `{$eq: v}`                           | `{equals: v}`                            |  ✅   |
| `!=`, `ne`         | `c <> v`                  | `{$nin: [v, null]}`                  | `{not: v}`                               |  ✅   |
| `>`, `gt`          | `c > v`                   | `{$gt: v}`                           | `{gt: v}`                                |  ✅   |
| `>=`, `gte`        | `c >= v`                  | `{$gte: v}`                          | `{gte: v}`                               |  ✅   |
| `<`, `lt`          | `c < v`                   | `{$lt: v}`                           | `{lt: v}`                                |  ✅   |
| `<=`, `lte`        | `c <= v`                  | `{$lte: v}`                          | `{lte: v}`                               |  ✅   |
| `contains`, `%_%`  | `c ILIKE '%v%'`           | `{$regex: esc(v), $options:"i"}`     | `{contains: v, mode:"insensitive"}`      |  ✅   |
| `startsWith`, `%_` | `c ILIKE 'v%'`            | `{$regex: "^"+esc(v), $options:"i"}` | `{startsWith: v, mode:"insensitive"}`    |  ✅   |
| `endsWith`, `_%`   | `c ILIKE '%v'`            | `{$regex: esc(v)+"$", $options:"i"}` | `{endsWith: v, mode:"insensitive"}`      |  ✅   |
| `like`             | `c LIKE v` (raw pattern)  | `$regex` from the LIKE pattern       | exact translation (see §5.1)             |  ✅   |
| `ilike`            | `c ILIKE v` (raw pattern) | `$regex` + `i`                       | exact translation + `mode:"insensitive"` |  ✅   |
| `notLike`          | `c NOT LIKE v`            | `{$not: regex, $ne: null}`           | negation of the exact translation        |  ✅   |
| `in`               | `c IN (…)`                | `{$in: v}`                           | `{in: v}`                                |  ✅   |
| `notIn`            | `c NOT IN (…)`            | `{$nin: [...v, null]}`               | `{notIn: v}`                             |  ✅   |
| `between`          | `c BETWEEN a AND b`       | `{$gte: a, $lte: b}`                 | `{gte: a, lte: b}`                       |  ✅   |
| `notBetween`       | `c NOT BETWEEN a AND b`   | `{$not: {…}, $ne: null}`             | `{NOT: {c: {gte, lte}}}` (where-level)   |  ✅   |
| `isNull`           | `c IS NULL`               | `{$eq: null}`                        | `{equals: null}`                         |  ✅   |
| `isNotNull`        | `c IS NOT NULL`           | `{$ne: null}`                        | `{not: null}`                            |  ✅   |

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

**The model handle** reads the same in all three. drizzle-pg takes a table
object and mongoose takes a `Model`; prisma-pg accepts the delegate object
(`registry.repository(prisma.user)`) as well as its name
(`registry.repository("user")`). `test/contract.ts` asserts the two forms
produce identical queries, and that a handle-built repository still runs on the
transaction client — the handle is resolved to a model key on every call rather
than captured, so it can never quietly write outside a transaction.

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

Composite `@@id` models are supported too: the row is located by the querykit
predicate and then written through Prisma's compound key (`{ a_b: { a, b } }`),
and bulk re-reads use `OR` over the key tuples instead of an `IN` list. An
`idKey` that does not resolve is **fatal** (`QueryKitError`), never skipped —
otherwise `updateById` would be left with no predicate and hit an arbitrary row.

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

## 5. Divergences — all resolved except one documented failure-mode difference

### 5.1 `like` / `ilike` / `notLike` — RESOLVED, no divergence

Prisma's `where` has no raw SQL `LIKE`, only `equals`/`contains`/`startsWith`/
`endsWith`. Every pattern is nevertheless translated **exactly**, so prisma-pg
returns the same rows as drizzle-pg for any pattern:

| Pattern                        | prisma-pg                                        | Same rows as drizzle-pg? |
| ------------------------------ | ------------------------------------------------ | :----------------------: |
| `%ali%`                        | `contains: "ali"`                                |            ✅            |
| `ali%`                         | `startsWith: "ali"`                              |            ✅            |
| `%ali`                         | `endsWith: "ali"`                                |            ✅            |
| `ali`                          | `equals: "ali"`                                  |            ✅            |
| `%`                            | `endsWith: ""` (every non-NULL row)              |            ✅            |
| `a%b` (interior `%`)           | `AND[ startsWith "a%b", endsWith "b" ]`          |            ✅            |
| `a%b%` (interior + trailing)   | `startsWith: "a%b"`                              |            ✅            |
| `a_b` (any `_`)                | `AND[ startsWith "a_b", NOT startsWith "a_b_" ]` |            ✅            |
| `%50\%%` (escaped literal `%`) | `startsWith: "%50\%"`                            |            ✅            |

Two identities make an arbitrary pattern expressible:

- **`LIKE 'A%S'` ≡ `LIKE 'A%S%' AND LIKE '%S'`.** The first fixes the prefix and
  requires `S` to occur after it; the second pins `S` to the very end. Together
  they also imply the minimum length, so nothing over-matches. (A plain
  `contains` would have been wrong here — `ali%` would start matching
  `"vali ali"`.)
- **`LIKE 'P'` with no `%` at all ≡ `LIKE 'P%' AND NOT LIKE 'P_%'`.** The first
  fixes the prefix and a minimum length, the second forbids one more character —
  together they pin the length exactly, which is what `_` needs.

A pattern that already ends in `%` needs neither: `startsWith` alone is exact.

**Runtime assumption.** The construction pushes a raw pattern through
`startsWith`/`endsWith`, which works because Prisma does **not** escape `%`/`_`
inside a filter value. That is the one behavioural assumption in the adapter, so
it is pinned from both sides: `test/query.ts` proves the algebra against a
reference SQL-LIKE evaluator over 19 patterns × 19 subjects (for `like` and
`notLike` alike), and `test/smoke.ts` asserts real Postgres row counts for
interior `%`, `_`, escaped `%` and escaped `_`. If a future Prisma release starts
escaping, the smoke test fails loudly instead of the filter quietly returning
the wrong rows.

Only a **malformed** pattern (a dangling trailing `\`) is still dropped and
reported; Postgres would raise an error on it instead.

### 5.2 Field-name resolution — RESOLVED, no divergence

drizzle-pg's `resolveColumn` accepts either the JS property (`createdAt`) or the
DB column (`created_at`). prisma-pg now does the same: `readModelMeta` records
each field's `@map`ped column from the runtime datamodel and `resolveField`
falls back to that alias, so `created_at` resolves to `createdAt` and the query
is issued with the Prisma field name (which is all Prisma's `where` accepts).

A real field name always wins over an alias, so a `@map` can never shadow
another field. mongoose accepts schema paths plus the `id` → `_id` alias; there
is no separate column name in MongoDB, so the question does not arise there.

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

### 5.5 Text operators on non-text fields

No adapter can actually serve this, so no rows are lost anywhere — only the
failure mode differs.

drizzle-pg compiles `contains` on a `timestamptz` to `"created_at" ilike $1`
(verified by rendering it through `PgDialect`). Postgres has no
`timestamptz ILIKE text` operator, so that query **raises** — a 500. Prisma
rejects `contains`/`mode` on a non-`String` field, and Mongo rejects `$regex` on
a Date, so **prisma-pg and mongoose drop** the condition and report
`invalid-value` instead.

So prisma-pg is not less capable here; it degrades observably
(`onSkippedCondition`, or `QueryKitError` in `strict` mode) where drizzle-pg
throws a driver error. Making drizzle-pg drop it too would align the three
exactly, but that is a behaviour change to a published package and is left as a
separate decision.

## 6. Contract audit (machine-checked)

§1–§5 are a read-and-compare exercise, which can rot. `test/contract.ts`
(`bun run test:contract`, no database) turns the three questions that actually
matter into assertions, driving **all three adapters' compilers** from the real
`@querykitjs/web` builders. 34 checks, all green.

**A — does it accept input the same way?**

- All **27 operators** are accepted by prisma-pg, drizzle-pg and mongoose alike:
  none of the three drops a condition the others keep.
- Case sensitivity is asserted on the **rendered** form, not on the table:
  `contains` → Prisma `mode: "insensitive"` · drizzle `… ilike $1` · mongoose
  `$options: "i"`; `like` → Prisma `contains` without mode · drizzle `… like $1`
  · mongoose no `$options`.
- An anchored `like "Ali%"` becomes `startsWith: "Ali"` here and the parameter
  `'Ali%'` on drizzle-pg — the same rows, which is the point of §5.1.
- A wire string on a numeric field (`value: "26"`) is accepted by all three.

**B — is it used the same way?**

- The runtime exports of the three `index.ts` files are **identical**:
  `buildRepository`, `createFilters`, `createRegistry`, `f`.
- The repository exposes **exactly** the shared 20-method set — no extras, none
  missing.
- `createRegistry(…) → repository(…) → findList(params)` reads the same on all
  three; only the model handle differs (`db + schema` / `Model` / `"modelKey"`),
  which is each ORM's own idiom.

**C — does what `@querykitjs/web` sends arrive intact?**

Payloads are built with the real `buildListParams` / `buildInfiniteParams` /
`buildCursorParams` / `createQuery`, pushed through
`JSON.parse(JSON.stringify(…))` (the wire), and passed to the repository **with
no cast**:

- `filter: []`, `columns: {}`, `with: {}` — the values web sends when the user
  selected nothing — mean _no_ `where`, _full_ row and _no_ `include`. (An empty
  `select` would have made every response a list of empty objects; this is the
  single most valuable check in the file.)
- `cursor: null` is "no cursor"; a condition with `value` omitted (`isNull`) is
  accepted; web's default `sort` resolves on all three adapters.
- Every `*Meta` this adapter returns carries exactly the snake_case fields
  web's mappers read — verified by scanning `packages/web/src/meta.ts`.
- A cursor token issued here survives the wire and comes back through web's
  cursor builder as the correct keyset predicate.
- Every field of web's `PrismaInclude` (`select`, `include`, `where`, `orderBy`,
  `take`, `skip`) passes through untouched, including inside the composed
  `select`.
