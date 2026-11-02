<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/zod

> **Zod** schemas that validate the querykit request contract (filters, sort, pagination). Operators come from `@querykitjs/core`; `z.infer` output is **assignable** to core types.

Validates the incoming JSON body of backend list endpoints — the full operator set, nested `and/or/not` filters, and **all three paginations** (offset/infinite/cursor). Pass the validated payload straight to a querykit repository.

## Install

```bash
bun add @querykitjs/zod zod
# @querykitjs/core comes transitively (dependency); zod is a peer
```

### Requirements

|              | Version   | Tested (`bun run test:matrix`) |
| ------------ | --------- | ------------------------------ |
| Node.js      | `>=22.12` | 24                             |
| `zod` (peer) | `^4`      | 4.6.7                          |

Node 20 is no longer supported (`engines`: `>=22.12`). Peer ranges cover the last two majors; both ends are tested.

## Usage (Hono example)

```ts
import { sValidator } from "@hono/zod-validator";
import { makeOffsetParamsSchema } from "@querykitjs/zod";
import { buyersRepository } from "@/db/repositories/buyers.repository";

const listSchema = makeOffsetParamsSchema(); // safe defaults

buyersRoute.post("/list", sValidator("json", listSchema), async ctx => {
  const params = ctx.req.valid("json"); // validated + core-aligned
  const { data, meta } = await buyersRepository.findList(params);
  return ctx.json({ data, meta });
});
```

Use `infiniteParamsSchema` / `cursorParamsSchema` for the other modes.

## What it validates

- **Filter** — a flat array (`{key, operation, value}[]`) or a nested `and`/`or`/`not` tree.
- **Operators** — the full core set: `= != > >= < <=`, `like/ilike/notLike`, `contains/startsWith/endsWith` (+ tokens `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Sort** — `{ key, direction }[]` (multi-field, at most 3).
- **Request limits** — filter depth, condition count, array items, string length, offset depth, sort fields ([Limits](#limits)).
- **Pagination** — offset (`page`/`perPage`/`withTotal` — `false` ⇒ no count, totals `null`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- The legacy `type` field is **ignored** (stripped, not rejected) — easy migration.

## Factories (recommended)

The constant schemas have no `perPage`/`limit` ceiling, and
`columns`/`with`/`withDeleted` are accepted from the client. The factories are
**safe by default**:

```ts
import { makeOffsetParamsSchema, makeInfiniteParamsSchema, makeCursorParamsSchema } from "@querykitjs/zod";

const listSchema = makeOffsetParamsSchema(); // perPage ≤ 200; no columns/with/withDeleted
type ListParams = z.infer<typeof listSchema>;

// change the ceiling
const bigList = makeOffsetParamsSchema({ maxPerPage: 500 });

// deliberately open a server-owned field (it appears in the type too)
const adminList = makeOffsetParamsSchema({ allow: ["withDeleted"] });
```

| Option       | Default                           | Meaning                                          |
| ------------ | --------------------------------- | ------------------------------------------------ |
| `maxPerPage` | core `DEFAULT_MAX_PER_PAGE` (200) | upper bound for `perPage`                        |
| `maxLimit`   | core `DEFAULT_MAX_LIMIT` (200)    | upper bound for `limit` (infinite/cursor)        |
| `allow`      | `[]`                              | open up `"columns"` / `"with"` / `"withDeleted"` |
| `limits`     | core `DEFAULT_QUERY_LIMITS`       | request limits ([Limits](#limits))               |

**Why they are closed by default:**

- `columns` — a client could ask for `{ password: true }`;
- `with` — a client could pull any relation (data exposure);
- `withDeleted` — a client could switch off the soft-delete guard.

If you do open one, pair `allow` with the **repository-level second layer**:
`forcedColumns` / `allowedColumns`
([drizzle-pg](../drizzle-pg/README.en.md) · [mongoose](../mongoose/README.en.md)).

`maxPerPage: Infinity` removes the ceiling entirely — ⚠️ uncapped pagination is a
DoS surface, since one request can ask for the whole table. Both backend
repositories clamp from the same core constant, so the protection holds even if
validation is bypassed.

Output types: `MadeOffsetParams<TAllow>` / `MadeInfiniteParams` /
`MadeCursorParams` (and the schema types `OffsetParamsSchema<TAllow>`, …).

> Do **not** use `ReturnType<typeof makeOffsetParamsSchema>` — for a function with
> a `const` type parameter TypeScript resolves it to `any`. Use
> `z.infer<typeof listSchema>` or `MadeOffsetParams<...>`.

## Limits

Every filter and pagination request is checked for size at parse time. The limits and their defaults come from `@querykitjs/core` (`DEFAULT_QUERY_LIMITS`), the same as in `@querykitjs/class-validator`.

| Limit             | Default  | What counts                                                                       |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| `maxDepth`        | `5`      | root-to-leaf nodes: the root is 1, every `and`/`or`/`not` and the condition add 1 |
| `maxConditions`   | `30`     | conditions (leaves) across all groups                                             |
| `maxInItems`      | `200`    | items in one array value (`in`, `notIn`, …)                                       |
| `maxStringLength` | `256`    | characters in one string value, also inside an array                              |
| `maxOffset`       | `10 000` | offset: `(page - 1) × perPage` (20 without `perPage`); infinite: `offset`         |
| `maxSortFields`   | `3`      | fields in the `sort` array                                                        |

```ts
// raise one limit for one endpoint — the others keep their defaults
const importList = makeOffsetParamsSchema({ limits: { maxInItems: 500 } });
```

- Filter limits are checked on the raw payload, iteratively and **before the `z.lazy` tree**: a 10 000-level `{"not":{"not":…}}` does not fill the stack, it is rejected at once.
- The error text names the limit and its value, and `path` points at the spot: `filter exceeds maxInItems (200)` (`filter.and.0.value`), `(page - 1) × perPage exceeds maxOffset (10000); …` (`page`).
- Pages deeper than `maxOffset` use cursor pagination (`makeCursorParamsSchema`).
- `Infinity` turns a limit off — ⚠️ a DoS surface.
- `filterNodeSchema` itself has no limits (it is the recursive node); validate request bodies with `filterSchema` or the factories.

## Migrating (3.0)

- **A payload past a limit is now rejected** — by the factories and by the constant schemas. An `in` with 201 items, a 257-char string, 31 conditions, a 6-level tree, 4 sort fields or `page=502, perPage=20` used to pass and now return 400. Raise a limit with the factory's `limits` where you need it.
- `makeOffsetParamsSchema()` and `offsetParamsSchema` carry an object-level check (`superRefine`): `.extend()` / `.safeExtend()` keep it, but zod 4 refuses `.pick()` / `.omit()` on such an object — call a factory with the fields you need instead.
- `filterSchema` is now `z.unknown().pipe(...)`: `z.infer` (the output) is unchanged, `z.input` is `unknown`.

## Schemas (constants — legacy parity)

> ⚠️ These constants are `@deprecated` (task 014) and go away in the next major. Use the `make*ParamsSchema` factories in new code.

⚠️ The constants below have **no `perPage`/`limit` cap** and keep `columns`/`with`/`withDeleted`
**open** (so existing projects keep working); the [request limits](#limits) apply to them too.
New code should use the factories above.

| Schema                              | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `filterOperatorSchema`              | operator enum (from core `FILTER_OPERATORS`)       |
| `fieldConditionSchema`              | `{ key, operation?, value? }`                      |
| `filterNodeSchema` / `filterSchema` | nested node / full filter (nested or flat)         |
| `sortSchema`                        | sort (`{ key, direction }[]`, at most 3)           |
| `baseParamsSchema`                  | filter/sort/columns/with/withDeleted               |
| `offsetParamsSchema`                | + `page`/`perPage`/`withTotal`                     |
| `infiniteParamsSchema`              | + `limit`/`offset`                                 |
| `cursorParamsSchema`                | + `limit`/`cursor`/`cursorKey`/`order`/`direction` |

Inferred types are also exported: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, … — all assignable to `@querykitjs/core` types.

## Core alignment

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operators come from core once. `z.infer` output is **assignable** to core's `FieldCondition`/`Filter`/`FilterOperator` (enforced at type-check time), so the validated result flows type-safely into a repository.

## License

MIT © Suhrobbek Soatov
