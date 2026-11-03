# @querykitjs/standard-schema

> querykit so'rov kontrakti (filtr, sort, offset / infinite / cursor paginatsiya) uchun [Standard Schema v1](https://standardschema.dev) validatorlari. Validator kutubxonasi kerak emas.

[English](./README.en.md)

valibot, arktype yoki Effect Schema ishlatadigan backend uchun — yoki validatori umuman yo'q backend uchun. Standard Schema qabul qiladigan har narsa bilan ishlaydi: Hono `sValidator`, tRPC `.input()`. Nomlar, opsiyalar va natijalar [`@querykitjs/zod`](../zod/README.md) bilan bir xil; rad etish yo'li va kaliti [`@querykitjs/class-validator`](../class-validator/README.md) bilan bir xil. Uchalasi ham core'dagi bir xil tekshiruvni ishlatadi, shuning uchun bir xil body'ni qabul qiladi va bir xilini rad etadi.

## O'rnatish

```bash
npm i @querykitjs/standard-schema
```

### Talablar

|         | Versiya   |
| ------- | --------- |
| Node.js | `>=22.12` |

Yagona bog'liqlik — `@querykitjs/core`. Peer bog'liqlik yo'q: Standard Schema interfeysi paket ichida.

## Foydalanish

### Hono

```ts
import { sValidator } from "@hono/standard-validator";
import { makeOffsetParamsSchema } from "@querykitjs/standard-schema";

app.post("/users/list", sValidator("json", makeOffsetParamsSchema()), async c => {
  const params = c.req.valid("json"); // { page?, perPage?, withTotal?, filter?, sort? }
  return c.json(await usersRepository.findList(params));
});
```

Rad etilgan body handler'gacha yetmaydi — javob `400`.

### tRPC

```ts
import { makeCursorParamsSchema } from "@querykitjs/standard-schema";

const timeline = t.procedure.input(makeCursorParamsSchema()).query(({ input }) => postsRepository.findCursor(input));
```

### Framework'siz

```ts
const result = makeOffsetParamsSchema()["~standard"].validate(body);
if (result.issues) return badRequest(result.issues);
const params = result.value;
```

`validate` sinxron.

## Schema'lar

| Eksport                                                          | Nimani tekshiradi                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `makeOffsetParamsSchema(options?)`                               | `page`, `perPage` (≤ `maxPerPage`), `withTotal`, `filter`, `sort`            |
| `makeInfiniteParamsSchema(options?)`                             | `limit` (≤ `maxLimit`), `offset` (≤ `maxOffset`), `filter`, `sort`           |
| `makeCursorParamsSchema(options?)`                               | `limit`, `cursor`, `cursorKey`, `order`, `direction`, `filter` — `sort` yo'q |
| `makeFilterSchema({ limits?, allowedKeys?, allowedOperators? })` | alohida filtr                                                                |
| `filterSchema`, `sortSchema`                                     | core default limitlari bilan filtr / sort                                    |

Tiplar: `ParamsSchemaOptions`, `ServerOwnedField`, `MadeOffsetParams` / `MadeInfiniteParams` / `MadeCursorParams`, `QueryKitIssue`, `StandardSchemaV1`, `InferOutput`.

## Standartda xavfsiz

| Opsiya       | Default                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `maxPerPage` | core `DEFAULT_MAX_PER_PAGE` (200)                                                                               |
| `maxLimit`   | core `DEFAULT_MAX_LIMIT` (200)                                                                                  |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (chuqurlik 5, shartlar 30, massiv 200, satr 256, offset 10 000, sort 3)             |
| `allow`      | yo'q — mijoz yuborgan `columns`, `with`, `withDeleted` olib tashlanadi; birini ochish: `allow: ["withDeleted"]` |

Hajm limitlari birinchi tekshiriladi, rekursiyasiz: 10 000 darajali filtr mikrosekundlarda rad etiladi. `(page - 1) × perPage` `maxOffset` dan oshsa — `page` bo'yicha rad; chuqurroq sahifalar uchun cursor ishlating.

## Xatolar

Har xatoda Standard Schema'ning `message` va `path` maydonlari, tarjima uchun esa `key` va `args` bor:

```ts
{ path: ["perPage"], key: "querykit.params.out_of_range", args: { max: 200 }, message: "perPage is out of the allowed range" }
```

Filtr va sort kalitlari `@querykitjs/class-validator` dagi bilan bir xil (uning `uz` / `ru` kataloglari ularni tarjima qiladi).

## Agent skill

Paket AI yordamchilar uchun `skills/querykit-standard-schema/SKILL.md` bilan chiqadi.

## Litsenziya

MIT
