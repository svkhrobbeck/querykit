<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykit/drizzle-pg

> Drizzle ORM (PostgreSQL) uchun **advanced filtering** va **moslashuvchan paginatsiya** beruvchi repository qatlami.

Drizzle bilan qo'lda yozib chiqiladigan ko'p qismlarni — murakkab filtrlar, uch xil paginatsiya, tranzaksiya, RBAC scope, soft-delete, bulk/agregatsiya — bitta tipli repository ostiga jamlaydi. `with`/`columns` bo'yicha natija tipi **avtomatik** aniqlanadi.

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

- **Advanced filterlar** — nested `and`/`or`/`not`, 25+ operator, raw SQL escape-hatch, `f` yordamchilari.
- **3 xil paginatsiya** — offset (`findList`), infinite-scroll (`findInfinite`), cursor/keyset (`findCursor`).
- **`with` + `columns` inference** — relation va tanlangan maydonlar qo'lda generic yozmasdan tiplanadi.
- **Multi-field sort**, `count`, `exists`, `aggregate` (count/sum/avg/min/max + groupBy).
- **Tranzaksiyalar** — `registry.transaction()`, ichidagi repolar avtomatik ulanadi (savepoint bilan nesting).
- **Scoped repository** — RBAC/multi-tenancy uchun doimiy base filter + create default.
- **Soft-delete** — `deletedAt` ustuni bo'lsa avtomatik; `softDelete`/`restore`/`withDeleted`.
- **Upsert / bulk** — `upsert`, `upsertMany` (avtomatik chunk).
- To'liq **TypeScript**, ORM/DB `db`+`schema` inject qilinadi (drop-in har qanday Drizzle loyihasiga).

## O'rnatish

```bash
bun add @querykit/drizzle-pg drizzle-orm
# yoki: npm i @querykit/drizzle-pg drizzle-orm
```

`drizzle-orm` — peer dependency.

## Sozlash

### 1. Registry (bir marta)

```ts
// db/registry.ts
import { createRegistry } from "@querykit/drizzle-pg";
import { db } from "./index"; // drizzle(client, { schema })
import * as schema from "./schema";

export const registry = createRegistry(db, schema);
// yoki pagination default'larini sozlab:
// export const registry = createRegistry(db, schema, { defaultPerPage: 20, defaultLimit: 20 });
```

`defaultPerPage` (findList) / `defaultLimit` (infinite/cursor) berilmasa `@querykit/core`ning **20** default'i ishlatiladi.

### 2. Jadval repositorylari

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { users } from "../schema";

export const usersRepository = registry.repository(users, base => ({
  // base metodlar ustiga custom metod
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

## Advanced filterlar

Filter — field shartlari va mantiqiy guruhlar (`and`/`or`/`not`) daraxti. Flat massiv implicit `AND` sifatida qabul qilinadi.

```ts
import { createFilters } from "@querykit/drizzle-pg";
const f = createFilters<typeof users>(); // ustun-nomi autocomplete

await usersRepository.findAll({
  filter: f.and(f.eq("status", "active"), f.or(f.gte("age", 18), f.in("role", ["admin", "owner"])), f.not(f.isNull("deletedAt"))),
});

// obyekt shakli (yordamchisiz):
await usersRepository.findAll({
  filter: {
    and: [
      { key: "status", operation: "=", value: "active" },
      {
        or: [
          { key: "age", operation: ">=", value: 18 },
          { key: "role", operation: "in", value: ["admin"] },
        ],
      },
    ],
  },
});
```

**Operatorlar:** `= != > >= < <=` (va `eq ne gt gte lt lte`), `like ilike notLike`, `contains startsWith endsWith` (case-insensitive), `in notIn`, `between notBetween` (`value: [min, max]`), `isNull isNotNull`. Istalgan joyga raw Drizzle `SQL` ham berish mumkin.

Qiymatlar o'zi qanday berilsa, shundayligicha o'tadi (avtomatik tip coercion yo'q).

## Multi-field sort

```ts
sort: [
  { key: "name", direction: "asc" },
  { key: "createdAt", direction: "desc" },
]; // ORDER BY name ASC, created_at DESC
```

Sort berilmasa, mavjud bo'lsa `created_at DESC` ga tushadi.

## Paginatsiya — 3 strategiya

```ts
// 1. Offset (klassik sahifalar) — total_items / total_pages
const page = await usersRepository.findList({ page: 2, perPage: 20, filter, sort });

// 2. Infinite scroll (limit + offset, COUNT'siz) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (insert'larga barqaror) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

## Tipli relation & column tanlash

Read metodlar natija tipini `with` va `columns` argumentidan **avtomatik** chiqaradi — qo'lda generic yo'q:

```ts
// relation -> to'liq tiplangan
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // string

// column tanlash -> tip tanlangan maydonlarga qisqaradi
const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // number
rows[0].email; // ❌ tip xatosi — tanlanmagan
```

## Tranzaksiyalar

```ts
await registry.transaction(async () => {
  await dispatchesRepository.create({ ... });
  await stockRepository.updateById(stockId, { qty: next });
}); // xato bo'lsa — hammasi rollback
```

Ichidagi repolar avtomatik ravishda tranzaksiya ulanishini ishlatadi (ambient kontekst). Ichma-ich chaqirilsa savepoint yaratiladi.

## Scoped repository (RBAC / multi-tenancy)

```ts
const mine = roadmapsRepository.scoped({ supervisorId: user.id });
await mine.findList({ page: 1 }); // WHERE supervisor_id = user.id
await mine.create({ ... });        // supervisor_id majburan user.id
```

Scope filter har bir o'qish/yangilash/o'chirishga `AND` bilan qo'shiladi, `create`da esa default bo'ladi (scope ustun keladi — undan chiqib bo'lmaydi).

## Soft-delete

Jadvalda `deletedAt` ustuni bo'lsa avtomatik yoqiladi. O'qishlar sukut bo'yicha o'chirilganlarni chiqarib tashlaydi; `withDeleted: true` ularni ham qo'shadi. `updatedAt` ustuni bo'lsa, har update'da yangilanadi.

```ts
await postsRepository.softDelete(id); // deletedAt = now()
await postsRepository.restore(id); // deletedAt = null
await postsRepository.findAll(); // o'chirilganlar chiqmaydi
await postsRepository.findAll({ withDeleted: true });
```

## Upsert, bulk & agregatsiya

```ts
// mavjud bo'lsa update, yo'q bo'lsa insert (bitta atomik so'rov)
await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });

// bulk upsert (avtomatik chunk) — sync/import
await productsRepository.upsertMany(rows, { target: "externalId" });

// agregatsiya — count/sum/avg/min/max + groupBy
await visitsRepository.aggregate({ count: true, groupBy: "supervisorId" });
await ordersRepository.aggregate({ sum: "amount", groupBy: "region" });
```

## API ma'lumotnoma

| Metod                                                          | Qaytaradi                    |
| -------------------------------------------------------------- | ---------------------------- |
| `findAll(params?)`                                             | `Row[]`                      |
| `findOne(params?)`                                             | `Row \| undefined`           |
| `findById(id, params?)`                                        | `Row \| undefined`           |
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
DATABASE_URL=... bun run --filter @querykit/drizzle-pg test:smoke
```

## Litsenziya

MIT © Suhrobbek Soatov
