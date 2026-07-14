<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykit/zod

> **Zod** schemas that validate the querykit request contract (filters, sort, pagination). Operators come from `@querykit/core`; `z.infer` output is **assignable** to core types.

Validates the incoming JSON body of backend list endpoints — the full operator set, nested `and/or/not` filters, and **all three paginations** (offset/infinite/cursor). Pass the validated payload straight to a querykit repository.

## Install

```bash
bun add @querykit/zod zod
# @querykit/core comes transitively (dependency); zod is a peer
```

## Usage (Hono example)

```ts
import { sValidator } from "@hono/zod-validator";
import { offsetParamsSchema } from "@querykit/zod";
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
- **Sort** — `"-createdAt"` string, `{ name, direction }`, or `{ key, direction }[]`.
- **Pagination** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- The legacy `type` field is **ignored** (stripped, not rejected) — easy migration.

## Schemas

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

Inferred types are also exported: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, … — all assignable to `@querykit/core` types.

## Core alignment

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operators come from core once. `z.infer` output is **assignable** to core's `FieldCondition`/`Filter`/`FilterOperator` (enforced at type-check time), so the validated result flows type-safely into a repository.

## License

MIT © Suhrobbek Soatov
