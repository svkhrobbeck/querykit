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

### Talablar

|              | Versiya   | Tekshiriladi (`bun run test:matrix`) |
| ------------ | --------- | ------------------------------------ |
| Node.js      | `>=22.12` | 24                                   |
| `zod` (peer) | `^4`      | 4.6.7                                |

Node 20 endi qo'llab-quvvatlanmaydi (`engines`: `>=22.12`). Peer diapazoni — oxirgi ikki major; ikkala cheti testda.

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
- **Sort** — `{ key, direction }[]` (ko'p-maydon, ko'pi bilan 3).
- **So'rov limitlari** — filtr chuqurligi, shartlar soni, massiv elementlari, satr uzunligi, offset chuqurligi, sort maydonlari ([Limits](#limits)).
- **Paginatsiya** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **`with`** (relations), **`columns`**, **`withDeleted`**.
- Eski `type` maydoni **e'tiborsiz** qoldiriladi (rad etilmaydi) — migratsiya oson.

## Factory'lar (tavsiya etiladi)

Konstanta schema'larda `perPage`/`limit` yuqori chegarasi yo'q va
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
| `limits`     | core `DEFAULT_QUERY_LIMITS`       | so'rov limitlari ([Limits](#limits))              |

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

## Limits

Har filtr va paginatsiya so'rovi parse paytida hajm bo'yicha tekshiriladi. Limitlar va default'lar — `@querykitjs/core`dan (`DEFAULT_QUERY_LIMITS`), `@querykitjs/class-validator` bilan bir xil.

| Limit             | Default  | Nima sanaladi                                                                 |
| ----------------- | -------- | ----------------------------------------------------------------------------- |
| `maxDepth`        | `5`      | ildizdan bargacha tugunlar: ildiz 1, har `and`/`or`/`not` va shart +1         |
| `maxConditions`   | `30`     | barcha guruhlardagi shartlar (barglar)                                        |
| `maxInItems`      | `200`    | bitta massiv qiymatdagi elementlar (`in`, `notIn`, …)                         |
| `maxStringLength` | `256`    | bitta satr qiymatdagi belgilar (massiv ichida ham)                            |
| `maxOffset`       | `10 000` | offset: `(page - 1) × perPage` (`perPage` yo'q bo'lsa 20); infinite: `offset` |
| `maxSortFields`   | `3`      | `sort` massividagi maydonlar                                                  |

```ts
// bitta endpoint uchun bitta limitni oshirish — qolganlari default
const importList = makeOffsetParamsSchema({ limits: { maxInItems: 500 } });
```

- Filtr limitlari xom payload'da, iterativ va **`z.lazy` daraxtidan oldin** tekshiriladi: 10 000 darajali `{"not":{"not":…}}` stekni to'ldirmaydi, bir zumda rad etiladi.
- Xato matni limit nomi va qiymatini aytadi, `path` — aniq joy: `filter exceeds maxInItems (200)` (`filter.and.0.value`), `(page - 1) × perPage exceeds maxOffset (10000); …` (`page`).
- `maxOffset`dan chuqur sahifalar — cursor paginatsiya (`makeCursorParamsSchema`).
- `Infinity` limitni o'chiradi — ⚠️ DoS yuzasi.
- `filterNodeSchema` o'zi limitsiz (rekursiv tugun); so'rov body'si uchun `filterSchema` yoki factory'larni ishlating.

## Migrating (3.0)

- **Limitdan oshgan payload endi rad etiladi** — factory'larda ham, konstanta schema'larda ham. Ilgari o'tgan `in` 201 element, 257 belgili satr, 31 shart, 6 darajali daraxt, 4 sort maydoni yoki `page=502, perPage=20` endi 400 beradi. Kerak bo'lsa factory'da `limits` bilan oshiring.
- `makeOffsetParamsSchema()` va `offsetParamsSchema` obyekt darajasidagi tekshiruvga ega (`superRefine`): `.extend()` / `.safeExtend()` uni saqlaydi, lekin zod 4 `.pick()` / `.omit()`ni bunday obyektda taqiqlaydi — kerakli maydonlar bilan yangi factory chaqiring.
- `filterSchema` endi `z.unknown().pipe(...)`: `z.infer` (chiqish) o'zgarmagan, `z.input` esa `unknown`.

## Schema'lar (konstantalar — legacy parity)

⚠️ Quyidagi konstantalarda `perPage`/`limit` **cap yo'q** va `columns`/`with`/`withDeleted`
**ochiq** (mavjud loyihalar buzilmasligi uchun); [so'rov limitlari](#limits) esa ularda ham bor.
Yangi kod yuqoridagi factory'lardan foydalansin.

| Schema                              | Vazifasi                                           |
| ----------------------------------- | -------------------------------------------------- |
| `filterOperatorSchema`              | operator enum (core `FILTER_OPERATORS`dan)         |
| `fieldConditionSchema`              | `{ key, operation?, value? }`                      |
| `filterNodeSchema` / `filterSchema` | nested tugun / to'liq filter (nested yoki flat)    |
| `sortSchema`                        | sort (`{ key, direction }[]`, ko'pi bilan 3)       |
| `baseParamsSchema`                  | filter/sort/columns/with/withDeleted               |
| `offsetParamsSchema`                | + `page`/`perPage`                                 |
| `infiniteParamsSchema`              | + `limit`/`offset`                                 |
| `cursorParamsSchema`                | + `limit`/`cursor`/`cursorKey`/`order`/`direction` |

Inferred tiplar ham eksport qilinadi: `OffsetParams`, `InfiniteParams`, `CursorParams`, `FilterInput`, ... — barchasi `@querykitjs/core` tiplariga assignable.

## Core moslik

`filterOperatorSchema = z.enum(FILTER_OPERATORS)` — operatorlar core'dan bir marta. `z.infer` chiqishi `@querykitjs/core`ning `FieldCondition`/`Filter`/`FilterOperator` tiplariga **assignable** (typecheck darajasida qat'iy tekshiriladi), shuning uchun validatsiyalangan natijani repo'ga uzatish tipli mos keladi.

## Litsenziya

MIT © Suhrobbek Soatov
