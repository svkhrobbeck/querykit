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

## Usage (Hono example)

```ts
import { sValidator } from "@hono/zod-validator";
import { offsetParamsSchema } from "@querykitjs/zod";
import { buyersRepository } from "@/db/repositories/buyers.repository";

buyersRoute.post("/list", sValidator("json", offsetParamsSchema), async ctx => {
  const params = ctx.req.valid("json"); // validated + core-aligned
  const { data, meta } = await buyersRepository.findList(params);
  return ctx.json({ data, meta });
});
```

Use `infiniteParamsSchema` / `cursorParamsSchema` for the other modes.

## What it validates

- **Filter** — a flat array (`{key, operation, value}[]`) or a nested `and`/`or`/`not` tree.
- **Operators** — the full core set: `= != > >= < <=`, `like/ilike/notLike`, `contains/startsWith/endsWith` (+ tokens `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Sort** — `{ key, direction }[]` (multi-field).
- **Pagination** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- The legacy `type` field is **ignored** (stripped, not rejected) — easy migration.

## Factories (recommended)

The constant schemas are unbounded: `perPage` has no ceiling, and
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

## Schemas (constants — legacy parity)

⚠️ The constants below have **no cap** and keep `columns`/`with`/`withDeleted`
**open**. They are left untouched so existing projects keep working; new code
should use the factories above.

| Schema                              | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `filterOperatorSchema`              | operator enum (from core `FILTER_OPERATORS`)       |
| `fieldConditionSchema`              | `{ key, operation?, value? }`                      |
| `filterNodeSchema` / `filterSchema` | nested node / full filter (nested or flat)         |
| `sortSchema`                        | sort (3 shapes)                                    |
| `baseParamsSchema`                  | filter/sort/columns/with/withDeleted               |
| `offsetParamsSchema`                | + `page`/`perPage`                                 |
| `infiniteParamsSchema`              | + `limit`/`offset`                                 |
| `cursorParamsSchema`                | + `limit`/`cursor`/`cursorKey`/`order`/`direction` |

Inferred types are also exported: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, … — all assignable to `@querykitjs/core` types.

## Core alignment

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operators come from core once. `z.infer` output is **assignable** to core's `FieldCondition`/`Filter`/`FilterOperator` (enforced at type-check time), so the validated result flows type-safely into a repository.

## License

MIT © Suhrobbek Soatov
