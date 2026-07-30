<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/zod

> querykit so'rov kontraktini (filter/sort/pagination) tekshiruvchi **zod** schema'lar. Operatorlar `@querykitjs/core`dan; `z.infer` chiqishi core tiplariga **mos**.

Backend list endpoint'lariga kelayotgan JSON body'ni validatsiya qiladi — to'liq operatorlar to'plami, nested `and/or/not` filter, va **uchala paginatsiya** (offset/infinite/cursor). Validatsiyalangan payload'ni to'g'ridan-to'g'ri querykit repository'ga uzatasiz.

## O'rnatish

```bash
bun add @querykitjs/zod zod
# @querykitjs/core avtomatik keladi (dependency); zod — peer
```

## Foydalanish (Hono misol)

```ts
import { sValidator } from "@hono/zod-validator";
import { offsetParamsSchema } from "@querykitjs/zod";
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
- **Sort** — `{ key, direction }[]` (ko'p-maydon).
- **Paginatsiya** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- Eski `type` maydoni **e'tiborsiz** qoldiriladi (rad etilmaydi) — migratsiya oson.

## Factory'lar (tavsiya etiladi)

Konstanta schema'lar cheklovsiz: `perPage` yuqori chegarasi yo'q va
`columns`/`with`/`withDeleted` clientdan qabul qilinadi. Factory'lar **xavfsiz
default** bilan keladi:

```ts
import { makeOffsetParamsSchema, makeInfiniteParamsSchema, makeCursorParamsSchema } from "@querykitjs/zod";

const listSchema = makeOffsetParamsSchema(); // perPage ≤ 200; columns/with/withDeleted YO'Q
type ListParams = z.infer<typeof listSchema>;

// cheklovni o'zgartirish
const bigList = makeOffsetParamsSchema({ maxPerPage: 500 });

// server-owned maydonni ATAYLAB ochish (tip darajasida ham paydo bo'ladi)
const adminList = makeOffsetParamsSchema({ allow: ["withDeleted"] });
```

| Opsiya       | Default                           | Ma'nosi                                           |
| ------------ | --------------------------------- | ------------------------------------------------- |
| `maxPerPage` | core `DEFAULT_MAX_PER_PAGE` (200) | `perPage` yuqori chegarasi                        |
| `maxLimit`   | core `DEFAULT_MAX_LIMIT` (200)    | `limit` yuqori chegarasi (infinite/cursor)        |
| `allow`      | `[]`                              | `"columns"` / `"with"` / `"withDeleted"`ni ochish |

**Nega default'da yopiq:**

- `columns` — client `{ password: true }` so'rashi mumkin;
- `with` — client istalgan relation'ni tortib olishi mumkin (data exposure);
- `withDeleted` — client soft-delete himoyasini o'chira oladi.

Ochish kerak bo'lsa, `allow` bilan birga **repository darajasidagi ikkinchi
qatlam**ni ham qo'ying: `forcedColumns` / `allowedColumns`
([drizzle-pg](../drizzle-pg/README.md) · [mongoose](../mongoose/README.md)).

`maxPerPage: Infinity` cheklovni butunlay o'chiradi — ⚠️ cap'siz paginatsiya DoS
yuzasi, chunki bitta so'rov butun jadvalni so'rashi mumkin. Backend
repositorylari ham shu core konstantasidan clamp qiladi, ya'ni validatsiya
chetlab o'tilsa ham himoya qoladi.

Chiqish tiplari: `MadeOffsetParams<TAllow>` / `MadeInfiniteParams` /
`MadeCursorParams` (va schema tiplari `OffsetParamsSchema<TAllow>`, …).

> `ReturnType<typeof makeOffsetParamsSchema>` **ishlatilmasin** — `const` tip
> parametrli generic funksiyada TypeScript uni `any` qilib yuboradi. `z.infer<typeof listSchema>`
> yoki `MadeOffsetParams<...>` ishlating.

## Schema'lar (konstantalar — legacy parity)

⚠️ Quyidagi konstantalarda **cap yo'q** va `columns`/`with`/`withDeleted`
**ochiq**. Ular mavjud loyihalar buzilmasligi uchun o'zgarishsiz qoldirilgan;
yangi kod yuqoridagi factory'lardan foydalansin.

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

Inferred tiplar ham eksport qilinadi: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, ... — barchasi `@querykitjs/core` tiplariga assignable.

## Core moslik

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operatorlar core'dan bir marta. `z.infer` chiqishi `@querykitjs/core`ning `FieldCondition`/`Filter`/`FilterOperator` tiplariga **assignable** (typecheck darajasida qat'iy tekshiriladi), shuning uchun validatsiyalangan natijani repo'ga uzatish tipli mos keladi.

## Litsenziya

MIT © Suhrobbek Soatov
