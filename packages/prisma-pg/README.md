<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/prisma-pg

> Prisma (PostgreSQL) uchun **advanced filtering** va **moslashuvchan paginatsiya** beruvchi repository qatlami.

Prisma bilan qo'lda yozib chiqiladigan ko'p qismlarni — murakkab filtrlar, uch xil paginatsiya, tranzaksiya, RBAC scope, soft-delete, bulk/agregatsiya — bitta tipli repository ostiga jamlaydi. `columns`/`with` bo'yicha natija tipi **avtomatik** aniqlanadi.

```ts
const { data, meta } = await usersRepository.findList({
  page: 2,
  perPage: 20,
  filter: f.and(f.eq("status", "active"), f.gte("age", 18)),
  sort: [{ key: "createdAt", direction: "desc" }],
});
//    ^? data: User[]   meta: { total_items, total_pages, has_next, ... }
```

## Imkoniyatlar

- **Advanced filterlar** — nested `and`/`or`/`not`, 27 operator, xom Prisma `where` escape-hatch, `f` yordamchilari.
- **3 xil paginatsiya** — offset (`findList`), infinite-scroll (`findInfinite`), cursor/keyset (`findCursor`).
- **`columns` + `with` inference** — tanlangan maydonlar va relation'lar qo'lda generic yozmasdan tiplanadi.
- **Multi-field sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Tranzaksiyalar** — `registry.transaction()`, ichidagi repolar avtomatik ulanadi.
- **Scoped repository** — RBAC/multi-tenancy uchun doimiy base filter + create default.
- **Soft-delete** — `deletedAt` maydoni bo'lsa avtomatik; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany`.
- **Framework-agnostik** — HTTP'ni bilmaydi: Express, Hono, NestJS, fon vazifalari — hammasiga tushadi.
- **Cross-adapter parity** — `@querykitjs/drizzle-pg` va `@querykitjs/mongoose` bilan bir xil yuza va bir xil natija ([PARITY.md](./PARITY.md)).

## O'rnatish

```bash
bun add @querykitjs/prisma-pg @prisma/client
# yoki: npm i @querykitjs/prisma-pg @prisma/client
```

`@prisma/client` (>=5) — peer dependency. Paket generatsiya qilingan client'ni **import qilmaydi**: model metadata'sini ish vaqtida sizning client instansiyangizdan o'qiydi, tiplarni esa siz uzatgan delegate'dan chiqaradi.

## Sozlash

### 1. Registry (bir marta)

```ts
// db/registry.ts
import { PrismaClient } from "@prisma/client";
import { createRegistry } from "@querykitjs/prisma-pg";

export const prisma = new PrismaClient();
export const registry = createRegistry(prisma);
// yoki pagination default'larini sozlab:
// export const registry = createRegistry(prisma, { defaultPerPage: 20, defaultLimit: 20 });
```

### 2. Repository (model bo'yicha)

Model **handle** bilan olinadi — `drizzle-pg` jadval obyektini, `mongoose` esa `Model`ni qabul qilgani kabi. Nom (delegate kaliti, camelCase) ham qabul qilinadi: `User` → `"user"`, `LegalEntity` → `"legalEntity"`.

```ts
// db/users.repository.ts
import { prisma, registry } from "./registry";

export const usersRepository = registry.repository(prisma.user);
// …yoki nomi bilan: registry.repository("user") — ikkalasi bir xil

// custom metodlar bilan:
export const postsRepository = registry.repository("post", base => ({
  findBySlug: (slug: string) => base.findOne({ filter: [{ key: "slug", value: slug }] }),
}));

// repository sozlamalari bilan (RBAC / projeksiya):
export const safeUsers = registry.repository("user", {
  forcedColumns: { id: true, name: true, email: true }, // parol hech qachon chiqmaydi
});
```

## Framework-agnostik: Express, Hono, NestJS

Bu paket **HTTP'ni bilmaydi**. Request'ni parse qilish va validatsiya app tomonda (`@querykitjs/zod` yoki `@querykitjs/class-validator`), repository esa hamma joyda bir xil chaqiriladi.

**Express**

```ts
import express from "express";
import { offsetParamsSchema } from "@querykitjs/zod";
import { usersRepository } from "./db/users.repository";

const app = express();
app.post("/users/list", express.json(), async (req, res) => {
  const params = offsetParamsSchema.parse(req.body);
  res.json(await usersRepository.findList(params));
});
```

**Hono**

```ts
import { Hono } from "hono";
import { offsetParamsSchema } from "@querykitjs/zod";
import { usersRepository } from "./db/users.repository";

const app = new Hono();
app.post("/users/list", async c => {
  const params = offsetParamsSchema.parse(await c.req.json());
  return c.json(await usersRepository.findList(params));
});
```

**NestJS**

```ts
import { Body, Controller, Post } from "@nestjs/common";
import { OffsetParamsDto } from "@querykitjs/class-validator";
import { usersRepository } from "./db/users.repository";

@Controller("users")
export class UsersController {
  @Post("list")
  list(@Body() params: OffsetParamsDto) {
    return usersRepository.findList(params);
  }
}
```

Validatsiyalangan payload repository params'iga **cast'siz** tushadi — kontrakt `@querykitjs/core` orqali yopilgan.

## Advanced filterlar

Filter — field shartlari va mantiqiy guruhlar (`and`/`or`/`not`) daraxti. Flat massiv implicit `AND`.

```ts
import { createFilters } from "@querykitjs/prisma-pg";
const f = createFilters<typeof prisma.user>(); // maydon-nomi autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});

// obyekt shakli (yordamchisiz):
await usersRepository.findAll({
  filter: [
    { key: "status", operation: "=", value: "active" },
    { key: "name", operation: "%_%", value: "ali" },
  ],
});
```

### Operatorlar

| Guruh      | Operatorlar                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| Taqqoslash | `=`/`eq`, `!=`/`ne`, `>`/`gt`, `>=`/`gte`, `<`/`lt`, `<=`/`lte`                  |
| Matn       | `contains`/`%_%`, `startsWith`/`%_`, `endsWith`/`_%`, `like`, `ilike`, `notLike` |
| To'plam    | `in`, `notIn`, `between`, `notBetween`                                           |
| NULL       | `isNull`, `isNotNull`                                                            |

`contains`/`startsWith`/`endsWith` — **case-insensitive** (`mode: "insensitive"`), `like` — case-sensitive, `ilike` — insensitive. Bu drizzle-pg adapteri bilan aynan bir xil.

> **LIKE pattern'lari.** Prisma `where` ichida xom SQL `LIKE` yo'q, shuning uchun pattern tarjima qilinadi — lekin **aniq**, ya'ni har qanday pattern drizzle-pg bilan bir xil qatorlarni qaytaradi: `%ali%` → `contains`, `ali%` → `startsWith`, `%ali` → `endsWith`, wildcard'siz → `equals`. Ichki `%` va `_` uchun ikkita ayniyat ishlatiladi — `LIKE 'A%S'` ≡ `LIKE 'A%S%' AND LIKE '%S'`, va `%`siz pattern uchun `LIKE 'P'` ≡ `LIKE 'P%' AND NOT LIKE 'P_%'` (uzunlikni qadaydi). Faqat **buzuq** pattern (oxirida osilib qolgan `\`) tashlanadi va reportlanadi. Batafsil: [PARITY.md](./PARITY.md) §5.1.

### Xom `where` escape-hatch

DSL ifodalay olmaydigan narsalar (relation predikatlari, `mode`, JSON filtrlari) uchun to'g'ridan-to'g'ri Prisma `where` obyekti tugun sifatida beriladi:

```ts
await usersRepository.findAll({ filter: { posts: { some: { title: { contains: "querykit" } } } } });

await usersRepository.findAll({
  filter: f.or(f.eq("role", "admin"), { posts: { some: { published: true } } }),
});
```

### Noma'lum kalitlar: kuzatish va qattiq rejim

Noma'lum filter/sort kaliti **jimgina tashlanadi** (legacy parity). Bu esa natijani kengaytiradi, shuning uchun uni ko'rinadigan qilish mumkin:

```ts
// 1-qadam: kuzatish (xulq o'zgarmaydi)
createRegistry(prisma, { onSkippedCondition: info => logger.warn({ querykit: info }, "shart tashlab yuborildi") });

// 2-qadam: log tozalanganda — qattiq rejim
createRegistry(prisma, { strict: true });
```

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return res.status(400).json({ error: err.message, info: err.info });
  throw err;
}
```

`scope` va `cursorKey` kaliti **har doim** fatal (`strict`dan qat'i nazar) — ular serverning o'z ishi, jimgina tashlash xavfsizlik nuqsoni bo'lardi.

## Multi-field sort

```ts
await usersRepository.findAll({
  sort: [
    { key: "role", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
});
```

Noma'lum kalit skip qilinadi; yaroqli sort qolmasa `createdAt desc`, u ham bo'lmasa `<id> desc` — paginatsiya barqaror bo'lishi uchun.

## Paginatsiya — 3 strategiya

```ts
// 1) Offset — total_items/total_pages bilan
const list = await usersRepository.findList({ page: 2, perPage: 20 });
list.meta; // { total_items, total_pages, current_page, per_page, has_next, has_prev }

// 2) Infinite-scroll — COUNT'siz
const feed = await postsRepository.findInfinite({ limit: 20, offset: 40 });
feed.meta; // { limit, offset, count, has_more, next_offset }

// 3) Cursor (keyset) — insert'larga barqaror
const p1 = await postsRepository.findCursor({ limit: 20, order: "desc" });
const p2 = await postsRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
p1.meta; // { limit, has_next, has_prev, next_cursor, prev_cursor }
```

`perPage`/`limit` **cheklangan** (`DEFAULT_MAX_PER_PAGE` = 200) — validatsiya chetlab o'tilsa ham repository o'zi clamp qiladi.

> Cursor tokeni `drizzle-pg` va `mongoose` adapterlari bilan **bayt-ma-bayt bir xil** — backend ORM'i almashsa ham eski token ishlayveradi.

## Tipli `columns` va `with`

```ts
const picked = await usersRepository.findAll({ columns: { id: true, email: true } });
//    ^? { id: number; email: string }[]   — `name` tipda ham yo'q

const withPosts = await usersRepository.findAll({ with: { posts: true } });
withPosts[0].posts[0].title; // relation tiplangan

const both = await usersRepository.findAll({ columns: { id: true }, with: { posts: true } });
//    ^? { id: number; posts: Post[] }[]
```

> ⚠️ Prisma bitta darajada `select` va `include`ni **birga qabul qilmaydi**. Adapter buni o'zi hal qiladi: ikkalasi berilsa relation'lar bitta `select` ichiga joylanadi. Siz farqni sezmaysiz.

`with` qiymati `true` yoki Prisma relation konfiguratsiyasi bo'lishi mumkin:

```ts
await usersRepository.findAll({ with: { posts: { select: { title: true }, take: 5, orderBy: { createdAt: "desc" } } } });
```

## Tranzaksiyalar

```ts
await registry.transaction(async () => {
  const user = await usersRepository.create({ name: "Ali", email: "ali@example.com" });
  await postsRepository.create({ title: "Salom", authorId: user.id });
});
```

Ichidagi repositorylar ambient kontekst (AsyncLocalStorage) orqali avtomatik tranzaksiya client'ida ishlaydi — qo'lda `tx` uzatish shart emas. Xato tashlansa hammasi rollback.

> ⚠️ Prisma savepoint bermaydi, shuning uchun **ichma-ich** `transaction()` chaqirilsa mavjud tranzaksiya qayta ishlatiladi (yangi ochilmaydi). `mongoose` adapteri ham shunday; `drizzle-pg` esa haqiqiy savepoint yaratadi.

## Scoped repository (RBAC / multi-tenancy)

```ts
const mine = postsRepository.scoped({ authorId: user.id });
await mine.findList({ page: 1 }); // faqat shu foydalanuvchi postlari
await mine.create({ title: "Yangi" }); // authorId avtomatik qo'yiladi
```

Scope har bir o'qish/yozishga `AND` bilan qo'shiladi va insert'larga singdiriladi (scope ustun keladi). Scope kaliti model'da topilmasa repository **yaratilishida** xato beradi — jimgina tushib qolsa filtr yo'qolardi.

## Projeksiya guard'lari

```ts
registry.repository("user", { forcedColumns: { id: true, name: true } }); // client `columns`i e'tiborsiz
registry.repository("user", { allowedColumns: ["id", "name", "email"] }); // client tanlovi kesiladi
```

Kesishma bo'sh bo'lsa natija **to'liq qator emas**, allowlist'ning o'zi bo'ladi. Guard `aggregate`ga ham tegishli, va `cursorKey` orqali taqiqlangan maydonni o'qib olishning oldi olingan.

> ⚠️ Guard'lar faqat **o'qish** metodlariga ta'sir qiladi. Yozish metodlari tip kontrakti bo'yicha to'liq `Row` qaytaradi — natijani clientga berishdan oldin `findById` bilan qayta o'qing.

## Soft-delete

Model'da `deletedAt` maydoni bo'lsa avtomatik yoqiladi:

```ts
await postsRepository.softDelete(id); // deletedAt = now()
await postsRepository.findAll({}); // o'chirilganlar chiqmaydi
await postsRepository.findAll({ withDeleted: true }); // hammasi
await postsRepository.restore(id); // deletedAt = null
```

`updatedAt` maydoni bo'lsa har bir update'da yangilanadi (`@updatedAt` bo'lsa buni Prisma o'zi qiladi — adapter aralashmaydi).

## Upsert, bulk va agregatsiya

```ts
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
await usersRepository.upsertMany(rows, { target: "externalId" });

await postsRepository.aggregate({ count: true, groupBy: "authorId" });
// → [{ authorId: 1, count: 12 }, …]
await ordersRepository.aggregate({ sum: "amount", avg: "amount", groupBy: "region" });
// → [{ region: "TAS", sum_amount: 900, avg_amount: 75 }, …]
```

> **Compound unique.** Ko'p maydonli `target` Prisma'ning generatsiya qilingan nomi bilan ishlaydi: `{ target: ["a", "b"] }` → `where: { a_b: { a, b } }`. `@@unique(name: "...")` bilan nomlangan constraint uchun xom client'dan foydalaning.
>
> **Bulk.** Prisma'da bulk upsert yo'q — `upsertMany` ketma-ket `upsert` qiladi (kirish tartibi saqlanadi). Katta importlar uchun `registry.transaction()` ichida chaqiring.

## Cheklovlar

- `updateById` / `deleteById` / `softDelete` / `restore` — **bitta maydonli `@id`** talab qiladi. Prisma `update`/`delete` faqat unique `where` qabul qiladi, querykit predikati esa scope va soft-delete guard'ini ham olib yuradi. Kompozit `@@id` bo'lsa `updateWhere`/`deleteWhere` ishlating.
- Filter/sort kalitlari — **Prisma maydon nomi** (`createdAt`), DB ustun nomi (`created_at`) emas. Prisma `where`ning o'zi ham `@map`langan nomni qabul qilmaydi.
- Matn operatorlari faqat `String` maydonlarda; boshqa tipda shart tashlanadi va reportlanadi.

To'liq ro'yxat va uchala adapter solishtiruvi: [PARITY.md](./PARITY.md).

## API ma'lumotnoma

| Metod                                        | Tavsif                                |
| -------------------------------------------- | ------------------------------------- |
| `findAll(params?)`                           | Barcha mos qatorlar                   |
| `findOne(params?)` / `findById(id, params?)` | Bitta qator yoki `undefined`          |
| `findList(params?)`                          | Offset paginatsiya — `{ data, meta }` |
| `findInfinite(params?)`                      | Infinite-scroll — `{ data, meta }`    |
| `findCursor(params?)`                        | Cursor/keyset — `{ data, meta }`      |
| `count(filter?)` / `exists(filter?)`         | Soni / mavjudligi                     |
| `create` / `createMany`                      | Yaratish                              |
| `upsert` / `upsertMany`                      | Insert yoki conflict'da update        |
| `updateById` / `updateWhere`                 | Yangilash (+ `updatedAt` bump)        |
| `deleteById` / `deleteWhere`                 | Butunlay o'chirish                    |
| `softDelete` / `restore`                     | Yumshoq o'chirish / tiklash           |
| `aggregate(spec)`                            | count/sum/avg/min/max + groupBy       |
| `scoped(scope)`                              | Doimiy scope bilan yangi repository   |

`createRegistry(prisma, options?)` — `defaultPerPage`, `defaultLimit`, `maxPerPage`, `maxLimit`, `strict`, `onSkippedCondition`.

## Ishlab chiqish

```bash
bun run build
bun run typecheck
bun run test:generate   # fixture Prisma client (DB kerak emas)
bun run test:query      # kompilyator + parity testlari (DB kerak emas)
bun run test:types      # tip inference testi
DATABASE_URL=postgres://user:pass@localhost:5432/db bun run test:smoke
```

## Litsenziya

MIT
