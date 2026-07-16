# querykit — cross-package contract review

> Analysis only — **no code was changed**. Audits (1) whether the payload
> `@querykitjs/web` emits is fully compatible with the `@querykitjs/zod` validator
> and the `drizzle-pg` / `mongoose` backends, and (2) what else could reasonably
> move into `@querykitjs/core`.
>
> Reviewed at: core 1.1.0 · web 3.0.0 · zod 2.0.0 · drizzle-pg 2.0.0 · mongoose 1.0.0.

## Xulosa (TL;DR)

Kontrakt **mos** — web yuboradigan wire-format zod bilan tekshiriladi va ikkала
backend qabul qiladi; **buzadigan (breaking) muammo yo'q**. Bir nechta _tip-darajасидаги_
nozikliklar bor (runtime'да zarar bermaydi): `FilterValue` `Date`ni o'z ichiga oladi
(wire'да esa string), web payload TYPE'i `withDeleted`ni e'lon qilmaydi, cursor
schema keraksiz `sort`ni meros oladi. Core'ga chiqarish uchun 3 ta nomzod bor:
umumiy **param shakllari**, **Scope/UpsertOptions/AggregateSpec**, va frontend
**camelCase meta + mapper**lar.

---

## 1. Wire contract — the single source of truth

The whole stack speaks one JSON shape. Every field type ultimately comes from
`@querykitjs/core`:

| Concept     | Core type                                                 | Notes                                                  |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------ |
| operators   | `FilterOperator` = `FILTER_OPERATORS[number]`             | zod enum is built from the same array — **one source** |
| condition   | `FieldCondition` = `{ key, operation?, value? }`          |                                                        |
| filter      | `Filter` = `FilterNode \| FieldCondition[]`               | flat array = implicit AND                              |
| sort        | `Sort` = `SortItem[]` = `{ key, direction? }[]`           | standardized this cycle                                |
| meta (wire) | `OffsetMeta` / `InfiniteMeta` / `CursorMeta` (snake_case) | adapters return these                                  |

Because operators, filter shapes, sort and meta all live in core, web/zod/drizzle/
mongoose cannot drift on them — this is the strongest part of the design.

---

## 2. web → zod — field-by-field

`web` builders (`buildListParams`/`…`) produce these payloads; `zod`
(`offset/infinite/cursorParamsSchema`) validates the received JSON body.

| Field               | web emits                                                                       | zod accepts                                                     | Verdict           |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| `filter`            | `FieldCondition[]` or tree                                                      | `filterSchema` (node/array)                                     | ✅ match          |
| `sort`              | **always** `{key,direction}[]` (default `[{key:"createdAt",direction:"desc"}]`) | `z.array({key, direction?})` optional                           | ✅ match          |
| `columns`           | `Record<string,boolean>` (default `{}`)                                         | `z.record(string, boolean)` optional                            | ✅ match          |
| `with`              | `Record<string,unknown>` (default `{}`)                                         | `z.record(string, unknown)` optional                            | ✅ match          |
| `withDeleted`       | added at runtime only when set                                                  | `z.boolean()` optional                                          | ✅ match (see F3) |
| `page`/`perPage`    | numbers, page clamped ≥ 1                                                       | `int().positive()` optional                                     | ✅ match          |
| `limit`/`offset`    | numbers, offset ≥ 0                                                             | `limit int().positive()`, `offset int().nonnegative()` optional | ✅ match          |
| `cursor`            | `string \| null`                                                                | `z.string().nullish()`                                          | ✅ match          |
| `order`/`direction` | `"asc"/"desc"` · `"forward"/"backward"`                                         | enums, optional                                                 | ✅ match          |
| `cursorKey`         | `string` (optional)                                                             | `z.string()` optional                                           | ✅ match          |

**Net: web's output validates cleanly against zod for all three pagination modes.**
Unknown keys on a condition (e.g. a legacy `type`) are **stripped** by zod's
object parse — matching the backends, which **skip** unknown field keys. Graceful,
consistent.

### Findings (type-level nuances — not runtime bugs)

- **F1 — `FilterValue` includes `Date`, the wire schema does not.**
  `core.FilterScalar = string | number | boolean | Date | null`, so
  `f.gte("createdAt", new Date())` type-checks on the frontend. `zod.filterValueSchema`
  is scalar **without** `Date` (only `string|number|boolean|null`). This is
  **correct at the wire**: `JSON.stringify` turns a `Date` into an ISO string, and
  zod validates that string. The mismatch only shows if you validate an _in-memory_
  payload (pre-serialization) with zod. Boundary is intentional (Date = in-memory
  ergonomics; wire = JSON scalars) — worth a one-line doc note, no fix needed.

- **F2 — `cursorParamsSchema` inherits `sort`.** It extends `baseParamsSchema`, so
  a cursor body may carry a `sort` field. web's `CursorPayload` never sends `sort`
  (cursor uses `order`+`direction`), and the backends ignore it. Harmless
  looseness; could tighten by omitting `sort` from the cursor schema.

- **F3 — web payload _types_ under-declare `withDeleted`.** `QueryPayload`/
  `ListPayload`/… don't list `withDeleted`, yet `buildBase` adds it at runtime when
  provided. The wire is fine (zod accepts it); the web payload interface is just
  narrower than what it actually builds. Add `withDeleted?: boolean` to the payload
  interfaces for type honesty.

- **F4 — flat-array filter is conditions-only.** `Filter`'s array form is
  `FieldCondition[]`; `zod` validates `z.array(fieldConditionSchema)`; web's
  `normalizeFilter` maps array items as conditions. Logical **groups** must use the
  tree form (`{and|or|not}`), which all three handle. (The drizzle/mongoose
  `buildWhere` happens to also accept groups inside a flat array, but that path is
  not part of the wire type and web never emits it.) Consistent — document "groups
  ⇒ tree form".

---

## 3. web → drizzle-pg / mongoose

The backend receives JSON, validates with zod (→ `z.infer` types), then passes it
to `repository.findList/…` whose params are `QueryParams<TTable|TDoc>`. The shapes
line up field-for-field (`filter`/`sort`/`columns`/`with`/`withDeleted` +
pagination), so the zod-output → repo-params cast at that boundary is sound.

- **Keys are wire strings.** `filter`/`sort`/`columns` keys arrive as `string`; each
  adapter resolves them (`resolveColumn` / `resolveField`) and **silently skips
  unknown keys** — identical behavior, so a stale field name degrades the same way
  on both backends.
- **sort** is now `{key,direction}[]` on both; `buildOrderBy`/`buildSort` iterate the
  array and fall back to `createdAt DESC` then `id`/`_id DESC` — parity confirmed.
- **columns** are inclusion-only on both (drizzle `pickColumns` drops `false`;
  mongoose `projection` keeps truthy) — parity confirmed.
- **No backend-only field is required.** Everything the repos read is optional and
  present in the web payload; nothing web emits is rejected by the repos.

**Net: no problems in drizzle-pg or mongoose against the web payload.** The two
backends are behaviorally matched (this was verified separately in the mongoose ↔
drizzle-pg parity review: operators/null-semantics, cursor keyset, soft-delete,
projection, meta shapes).

---

## 4. What else could move into `@querykitjs/core`?

### Already shared (good — don't touch)

`SortItem`/`Sort`, `FieldCondition`/`FilterNode`/`Filter`, `FilterOperator` +
`FILTER_OPERATORS`, `FilterScalar`/`FilterValue`, the snake-case `*Meta` types,
`DEFAULT_PER_PAGE`/`DEFAULT_LIMIT`, and the `createFilters`/`f` builder logic all
live in core and are specialized per package. This is why the sort standardization
touched types in one place conceptually.

### Candidate A — generic **param shapes** (highest-value)

`QueryParams` / `OffsetParams` / `InfiniteParams` / `CursorParams` (+ web's input
`Params`/`ListParams`/…) are re-declared **three times** (web input, drizzle,
mongoose) with the same fields (`filter/sort/columns/with/withDeleted` + the
pagination numbers). They differ only in the key generic and adapter-specific
`columns`/`with` typing.

- **Proposal:** a core `QueryParams<TKey>` (+ `Offset/Infinite/Cursor` extensions)
  carrying the common fields; adapters `extend`/intersect it with their
  `columns`/`with`/raw-filter specifics.
- **Payoff:** a change like this sort cycle becomes ~1 edit in core instead of 3–5.
- **Cost:** the adapters' _result_ inference (`BuildQueryResult` for drizzle,
  `NarrowColumns` for mongoose) is adapter-specific and stays put — only the
  **input** param shape is shared. Moderate generics; worth it.

### Candidate B — `Scope` / `UpsertOptions` / `AggregateSpec`

drizzle and mongoose define these **near-identically** (generic over the key type):

- `Scope<T> = Partial<Record<Key, FilterScalar>>`
- `UpsertOptions<T> = { target: Key | Key[]; set?: Partial<Insert> }`
- `AggregateSpec<T> = { filter?; groupBy?; count?; sum?; avg?; min?; max?; withDeleted? }`

Move the shapes to core as `…<TKey, TInsert>` generics; each adapter binds its own
key/insert types. Straightforward DRY, low risk.

### Candidate C — frontend **camelCase meta + mappers** (for multi-frontend)

web owns the camelCase `Meta`/`InfiniteMeta`/`CursorMeta` **and** the
`mapMeta`/`mapInfiniteMeta`/`mapCursorMeta` functions (currently internal). The
moment a second frontend exists (the planned `@querykitjs/web/vue` or a separate
package), it will want the exact same camelCase types and mappers. Hosting them in
core (next to the snake-case `*Meta`) lets every frontend reuse one implementation.

- **Cost:** core would then carry a tiny bit of "presentation" (camelCase) logic. If
  that feels off, a thin `@querykitjs/frontend-core` is the alternative. Only worth
  doing when the second frontend is real — noting it now so it isn't re-implemented.

### Not worth moving

- `normalizeFilter`/`pruneEmpty` and `normalizeSort`/`encodeSort`/`decodeSort` are
  **frontend build/URL** concerns (backends consume the finished payload). Keep in web.
- Operator → SQL / operator → Mongo translation is inherently per-backend.

---

## 5. Verdict

- **Contract compatibility: solid.** web ↔ zod ↔ drizzle-pg ↔ mongoose agree on the
  wire; nothing web emits is rejected, and the two backends are behaviorally matched.
- **Fix-worthy (small, type-only):** F3 (declare `withDeleted` on web payload types),
  optionally F2 (drop `sort` from the cursor schema) and a doc note for F1 (Date →
  wire string).
- **Maintainability: room to consolidate.** Candidates A and B remove real
  duplication and would make future contract changes single-edit; C is a
  when-you-add-a-second-frontend move.

---

## 6. Actions taken (post-review)

The analysis above changed no code; the following small, safe items were then
implemented (all packages typecheck / lint / build / smoke green — **not yet
published**):

- **F3 ✅** — added `withDeleted?: boolean` to web's `QueryPayload` (inherited by
  `ListPayload`/`InfinitePayload`) and `CursorPayload`, so the payload types match
  what the builders actually emit.
- **F2 ✅** — `cursorParamsSchema` now `omit`s `sort` (cursor is driven by
  `order`+`direction`).
- **F1 ✅** — documented the `Date` → wire-string boundary on `core.FilterScalar`.
- **Candidate B ✅** — moved `Scope`, `UpsertOptions`, `AggregateSpec` into
  `@querykitjs/core` as generics (`Scope<TKey>`, `UpsertOptions<TKey, TInsert>`,
  `AggregateSpec<TKey, TFilter>`); drizzle-pg and mongoose now re-specialize them
  instead of re-declaring the shapes. Public type names are unchanged.

**Not done (deliberate):**

- **Candidate A** — reassessed as lower-value than it first looked: the param
  fields (`filter`/`columns`/`with`) are each per-adapter-typed, so only the
  pagination numbers are truly shareable — heavy generics for a thin win. Skipped.
- **Candidate C** — deferred until a second frontend (e.g. Vue) actually exists.

These changes need a release to reach npm (core minor; web/zod patch/minor;
drizzle-pg/mongoose patch). mongoose still needs its Trusted Publisher configured
before it can release via CI.
