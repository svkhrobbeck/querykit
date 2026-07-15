<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/mongoose

[![npm](https://img.shields.io/npm/v/@querykitjs/mongoose.svg)](https://www.npmjs.com/package/@querykitjs/mongoose) [![license](https://img.shields.io/npm/l/@querykitjs/mongoose.svg)](./LICENSE)

> Mongoose (MongoDB) uchun ilg'or filtrlash + moslashuvchan paginatsiya repository qatlami.

Mongoose ustiga qo'lda yozadigan kodni — murakkab filterlar, 3 xil paginatsiya, tranzaksiya, RBAC scope, soft-delete, bulk/aggregatsiya — bitta tipli repository'ga jamlaydi. Natija tiplari `with`/`columns`dan avtomatik chiqariladi. Ommaviy yuza [`@querykitjs/drizzle-pg`](https://www.npmjs.com/package/@querykitjs/drizzle-pg) bilan bir xil — shuning uchun **bitta frontend kontrakti** ([`@querykitjs/web`](https://www.npmjs.com/package/@querykitjs/web)) ham Postgres, ham MongoDB backend'ini boshqaradi.

## Tez boshlash

```ts
import mongoose, { Schema } from "mongoose";
import { createRegistry, createFilters } from "@querykitjs/mongoose";

// 1. oddiy Mongoose modeli
interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  age: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
const User = mongoose.model<IUser>("User", new Schema<IUser>({ name: String, email: String, age: Number, status: String }, { timestamps: true }));

// 2. ulaning, so'ng connection'dan registry quring
await mongoose.connect(process.env.MONGO_URL!);
export const registry = createRegistry(mongoose.connection);

// 3. har model uchun bitta tipli repository
export const usersRepository = registry.repository(User);

// 4. so'rov — filter, sort, pagination, hammasi tipli
const f = createFilters<IUser>();
const { data, meta } = await usersRepository.findList({
  page: 2,
  perPage: 20,
  filter: f.and(f.eq("status", "active"), f.gte("age", 18)),
  sort: [{ key: "createdAt", direction: "desc" }],
});
//    ^? data: IUser[]   meta: { total_items, total_pages, has_next, ... }
```

## Imkoniyatlar

- **Ilg'or filterlar** — ichma-ich `and`/`or`/`not`, 25+ operator, raw Mongo query escape-hatch, `f` helperlar. SQL uch-qiymatli mantiq pariteti (negatsiya null/yo'qni chetlaydi).
- **3 xil paginatsiya** — offset (`findList`), infinite scroll (`findInfinite`), cursor/keyset (`findCursor`, default kalit `_id`).
- **`with` + `columns` inference** — populate qilingan relation'lar va tanlangan maydonlar qo'lda generic'siz tiplanadi.
- **Ko'p-maydonli sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Tranzaksiya** — `registry.transaction()`; ichidagi repository'lar avtomatik qo'shiladi (replica set talab qiladi).
- **Scoped repository** — RBAC / multi-tenancy uchun doimiy asosiy filter + create default'lari.
- **Soft-delete** — `deletedAt` path bo'lsa avtomatik; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany` (avto-chunk, input-tartibda natija).
- `id` ↔ `_id` alias — wire kontrakti adapterlar bo'ylab bir xil; o'qishlar oddiy POJO qaytaradi (`.lean()`).

## O'rnatish

```bash
bun add @querykitjs/mongoose mongoose
# yoki: npm i @querykitjs/mongoose mongoose
```

`mongoose` (>= 8) — peer dependency.

## Sozlash

### 1. Registry (bir marta)

```ts
// db/registry.ts
import mongoose from "mongoose";
import { createRegistry } from "@querykitjs/mongoose";

export const registry = createRegistry(mongoose.connection);
// yoki paginatsiya default'larини sozlash:
// export const registry = createRegistry(mongoose.connection, { defaultPerPage: 20, defaultLimit: 20 });
```

`defaultPerPage` (findList) / `defaultLimit` (infinite/cursor) berilmasa `@querykitjs/core`ning **20**siga tushadi. `connection` tashqaridan beriladi (tranzaksiya to'g'ri session'ni ulashsin uchun).

### 2. Har model uchun repository

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { User } from "../models/user.model";

export const usersRepository = registry.repository(User, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

## MongoDB-ga xos jihatlar

- **`id` ↔ `_id`.** Istalgan joyda `"id"` ishlating (filter, `columns`, `idKey`, `cursorKey`) — u Mongo'ning `_id`siga o'giriladi, wire kontrakti SQL adapter bilan bir xil. Frontend'дан kelган string id'lar avtomatik `ObjectId`ga cast bo'ladi:
  ```ts
  await usersRepository.findById("665f0e...b3a"); // string → ObjectId
  await usersRepository.findAll({ filter: [{ key: "id", operation: "in", value: [id1, id2] }] });
  ```
- **Qiymat cast.** Wire string'lar schema tomonidan cast qilinadi — ISO sana → `Date`, hex string → `ObjectId` — `find`, `aggregate` `$match` va cursor tokenlarда birxil.
- **O'qishlar `.lean()`** — oddiy POJO (hydrate qilinган Mongoose hujjati emas), SQL adapter qatorlari bilan mos.
- **Cursor** default `_id` bo'yicha (`cursorKey` bilan o'zgartiring) — insert'larда barqaror.
- **Tranzaksiya replica set talab qiladi** — lokal dev uchun bir-nodали yetarli (`mongod --replSet rs0` so'ng `rs.initiate()`, yoki testда [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)).

## Ilg'or filterlar

Filter — maydon shartlari va mantiqiy guruhlar (`and`/`or`/`not`) daraxti. Yassi massiv = implicit `AND`. `id` — `_id`ga o'giriladi.

```ts
import { createFilters } from "@querykitjs/mongoose";
const f = createFilters<IUser>(); // maydon nomi autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});
```

**Operatorlar:** `= != > >= < <=` (va `eq ne gt gte lt lte`), `like ilike notLike`, `contains startsWith endsWith` (case-insensitive), `in notIn`, `between notBetween` (`value: [min, max]`), `isNull isNotNull`. Istalgan joyga raw Mongo query obyekti tashlanadi. Qiymatlar o'zgartirilmasdan o'tadi; wire string'lar (sana / ObjectId) schema tomonidan cast qilinadi. Negatsiya operatorlari (`ne`/`notIn`/`notLike`/`notBetween` va bir-maydonли `not`) SQL uch-qiymatli mantiqiga mos ravishda null/yo'qni chetlaydi.

## Ko'p-maydonli sort

```ts
sort: [
  { key: "name", direction: "asc" },
  { key: "createdAt", direction: "desc" },
]; // { name: 1, createdAt: -1 }
```

Sort — `{ key, direction }[]` massivi, `@querykitjs/web` va barcha adapterlar bilan bir xil shakl.

Sort berilmasa `createdAt DESC` ga, u bo'lmasa `_id DESC` ga tushadi — pagination barqaror bo'lishi uchun deterministik tartib.

## Paginatsiya — 3 strategiya

```ts
// 1. Offset — total_items / total_pages
const page = await usersRepository.findList({ page: 2, perPage: 20, filter, sort });

// 2. Infinite scroll (limit + offset) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (insert'larда barqaror, default `_id` bo'yicha) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

## Tipli relation'lar va maydon tanlash

O'qish metodlari natija tipini `with` (populate) va `columns`dan chiqaradi — qo'lda generic yo'q:

```ts
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // populate qilingan

const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // ObjectId
rows[0].email; // ❌ tip xatosi — tanlanmagan
```

Populate qilingan relation'larni runtime'да tiplash uchun ref model'larni bering: `registry.repository(Post, { relations: { author: User } })`.

## Tranzaksiya

```ts
await registry.transaction(async () => {
  await dispatchesRepository.create({ ... });
  await stockRepository.updateById(stockId, { qty: next });
}); // throw -> to'liq rollback
```

Ichida ishlatilgan repository'lar avtomatik tranzaksiya session'ini oladi (ambient context). **MongoDB tranzaksiyasi replica set talab qiladi** (lokal dev uchun bir-nodали replica set kifoya). Ichma-ich chaqiruv tashqi session'ni qayta ishlatadi.

## Scoped repository (RBAC / multi-tenancy)

```ts
const mine = roadmapsRepository.scoped({ supervisorId: user.id });
await mine.findList({ page: 1 }); // { supervisorId: user.id, ... }
await mine.create({ ... });        // supervisorId majburan user.id
```

## Soft-delete

Schema'да `deletedAt` path bo'lsa avtomatik yoqiladi. O'qishlar default'да soft-delete qilingan hujjatlarni chiqarib tashlaydi; `withDeleted: true` ularni ham qo'shadi. `{ timestamps: true }` bo'lmasa lekin qo'lда `updatedAt` path bo'lsa, har update'да bumps qilinadi.

```ts
await postsRepository.softDelete(id);
await postsRepository.restore(id);
await postsRepository.findAll({ withDeleted: true });
```

## Upsert, bulk & aggregatsiya

```ts
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
await productsRepository.upsertMany(rows, { target: "externalId" }); // chunk, input tartibda qaytadi
await visitsRepository.aggregate({ count: true, groupBy: "supervisorId" });
await ordersRepository.aggregate({ sum: "amount", groupBy: "region" });
```

## API ma'lumotnoma

| Metod                                                          | Qaytaradi                    |
| -------------------------------------------------------------- | ---------------------------- |
| `findAll(params?)`                                             | `Row[]`                      |
| `findOne(params?)` / `findById(id, params?)`                   | `Row \| undefined`           |
| `findList(params?)`                                            | `{ data, meta }` offset      |
| `findInfinite(params?)`                                        | `{ data, meta }` infinite    |
| `findCursor(params?)`                                          | `{ data, meta }` cursor      |
| `count(filter?)` / `exists(filter?)`                           | `number` / `boolean`         |
| `aggregate(spec)`                                              | `AggregateRow[]`             |
| `create(values)` / `createMany(values)`                        | `Row` / `Row[]`              |
| `upsert(values, opts)` / `upsertMany(values, opts)`            | `Row` / `Row[]`              |
| `updateById(id, patch, idKey?)` / `updateWhere(filter, patch)` | `Row \| undefined` / `Row[]` |
| `deleteById(id, idKey?)` / `deleteWhere(filter)`               | `Row \| undefined` / `Row[]` |
| `softDelete(id)` / `restore(id)`                               | `Row \| undefined`           |
| `scoped(scope)`                                                | scoped `Repository`          |
| `registry.transaction(fn)`                                     | `fn` natijasi                |

## Ishlab chiqish

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (ESM + CJS + .d.ts)
bun run --filter @querykitjs/mongoose test:smoke   # in-memory replica set (mongodb-memory-server)
```

## Litsenziya

MIT © Suhrobbek Soatov
