<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykit/zod

> querykit so'rov kontraktini (filter/sort/pagination) tekshiruvchi **zod** schema'lar. Operatorlar `@querykit/core`dan; `z.infer` chiqishi core tiplariga **mos**.

Backend list endpoint'lariga kelayotgan JSON body'ni validatsiya qiladi — to'liq operatorlar to'plami, nested `and/or/not` filter, va **uchala paginatsiya** (offset/infinite/cursor). Validatsiyalangan payload'ni to'g'ridan-to'g'ri querykit repository'ga uzatasiz.

## O'rnatish

```bash
bun add @querykit/zod zod
# @querykit/core avtomatik keladi (dependency); zod — peer
```

## Foydalanish (Hono misol)

```ts
import { sValidator } from "@hono/zod-validator";
import { offsetParamsSchema } from "@querykit/zod";
import { buyersRepository } from "@/db/repositories/buyers.repository";

buyersRoute.post("/list", sValidator("json", offsetParamsSchema), async ctx => {
  const params = ctx.req.valid("json"); // validatsiyalangan + core-mos
  const { data, meta } = await buyersRepository.findList(params);
  return ctx.json({ data, meta });
});
```

Infinite/cursor uchun `infiniteParamsSchema` / `cursorParamsSchema`.

## Nimani tekshiradi

- **Filter** — flat massiv (`{key, operation, value}[]`) yoki nested `and`/`or`/`not` daraxt.
- **Operatorlar** — core'ning to'liq to'plami: `= != > >= < <=`, `like/ilike/notLike`, `contains/startsWith/endsWith` (+ token `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Sort** — `"-createdAt"` string, `{ name, direction }`, yoki `{ key, direction }[]`.
- **Paginatsiya** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- Eski `type` maydoni **e'tiborsiz** qoldiriladi (rad etilmaydi) — migratsiya oson.

## Schema'lar

| Schema                              | Vazifasi                                           |
| ----------------------------------- | -------------------------------------------------- |
| `filterOperatorSchema`              | operator enum (core `FILTER_OPERATORS`dan)         |
| `fieldConditionSchema`              | `{ key, operation?, value? }`                      |
| `filterNodeSchema` / `filterSchema` | nested tugun / to'liq filter (nested yoki flat)    |
| `sortSchema`                        | sort (3 shakl)                                     |
| `baseParamsSchema`                  | filter/sort/columns/with/withDeleted               |
| `offsetParamsSchema`                | + `page`/`perPage`                                 |
| `infiniteParamsSchema`              | + `limit`/`offset`                                 |
| `cursorParamsSchema`                | + `limit`/`cursor`/`cursorKey`/`order`/`direction` |

Inferred tiplar ham eksport qilinadi: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, ... — barchasi `@querykit/core` tiplariga assignable.

## Core moslik

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operatorlar core'dan bir marta. `z.infer` chiqishi `@querykit/core`ning `FieldCondition`/`Filter`/`FilterOperator` tiplariga **assignable** (typecheck darajasida qat'iy tekshiriladi), shuning uchun validatsiyalangan natijani repo'ga uzatish tipli mos keladi.

## Litsenziya

MIT © Suhrobbek Soatov
