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

### Talablar

|                   | Versiya            | Tekshiriladi (`bun run test:matrix`) |
| ----------------- | ------------------ | ------------------------------------ |
| Node.js           | `>=22.12`          | 24                                   |
| `mongoose` (peer) | `^8.24 \|\| ^9.11` | 8.24.7, 9.11.4                       |

Node 20 endi qo'llab-quvvatlanmaydi (`engines`: `>=22.12`). Peer diapazoni — oxirgi ikki major; ikkala cheti testda.

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

`connection` tashqaridan beriladi (tranzaksiya to'g'ri session'ni ulashsin uchun).

**`createRegistry` opsiyalari** — drizzle-pg adapteri bilan **aynan bir xil**:

| Opsiya               | Default                           | Ma'nosi                                                   |
| -------------------- | --------------------------------- | --------------------------------------------------------- |
| `defaultPerPage`     | core `DEFAULT_PER_PAGE` (20)      | `findList` sahifa o'lchami                                |
| `defaultLimit`       | core `DEFAULT_LIMIT` (20)         | `findInfinite`/`findCursor` `limit`i                      |
| `maxPerPage`         | core `DEFAULT_MAX_PER_PAGE` (200) | `perPage` yuqori chegarasi (`Infinity` — o'chirish)       |
| `maxLimit`           | core `DEFAULT_MAX_LIMIT` (200)    | `limit` yuqori chegarasi                                  |
| `strict`             | `false`                           | noma'lum kalit → `QueryKitError` (400), jimgina skip emas |
| `onSkippedCondition` | —                                 | tashlab yuborilgan har bir shart uchun callback           |

`maxPerPage`/`maxLimit` — **ikkinchi himoya qatlami**: validatsiya
(`@querykitjs/zod` factory'lari) chetlab o'tilsa ham repository o'zi clamp qiladi.

`timestamps` — createdAt / deletedAt maydon nomlari (masalan snake_case loyihada): default sort va default `sortable` shu `createdAt`ni, soft-delete (`softDelete`, `restore`, `withDeleted`) shu `deletedAt`ni ishlatadi.

```ts
export const registry = createRegistry(mongoose.connection, { timestamps: { createdAt: "created_at", deletedAt: "deleted_at" } });
```

### 2. Har model uchun repository

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { User } from "../models/user.model";

export const usersRepository = registry.repository(User, base => ({
  findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
}));
```

`repository()` to'rt shaklda chaqiriladi (drizzle-pg adapteri bilan bir xil):

```ts
registry.repository(User);                            // sof
registry.repository(User, base => ({ … }));           // + custom metodlar
registry.repository(User, options);                   // + per-repo opsiyalar
registry.repository(User, options, base => ({ … }));  // ikkisi ham
```

### 3. Projection himoyasi (`RepositoryOptions`)

`columns` clientdan kelishi mumkin, shuning uchun xavfsiz tanlov **repository'da**
belgilanadi — `scope` (RBAC) allaqachon shu yo'lda:

```ts
export const usersRepository = registry.repository(User, {
  forcedColumns: { _id: true, fullName: true, email: true }, // parol hech qachon chiqmaydi
});

// yoki yumshoqroq: client faqat shu ro'yxatdan tanlaydi
export const postsRepository = registry.repository(Post, {
  allowedColumns: ["_id", "title", "createdAt"],
});
```

| Opsiya           | Xulqi                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| `forcedColumns`  | client `columns`i **butunlay e'tiborsiz**                                             |
| `allowedColumns` | client tanlovi allowlist bilan **kesiladi**; kesishma bo'sh bo'lsa → allowlist        |
| `scope`          | har bir o'qish/yozishga doimiy tenglik filtri (`scoped()` bilan ham berilishi mumkin) |
| `relations`      | populate qilinadigan relation'lar (faqat tip — `with` inference uchun)                |

Muhim nozikliklar:

- Kesishma bo'sh bo'lganda natija **to'liq hujjat emas** — allowlistning o'zi.
- `aggregate` ham shu guard ostida: `min("password")` yoki
  `groupBy: "password"` projection bilan bir xil miqdorda ma'lumot chiqaradi.
- `cursorKey` clientdan keladi va cursor maydoni paginatsiya uchun majburan
  tanlanadi — guard bor bo'lsa u maydon so'rovda qoladi, lekin qaytariladigan
  hujjatlardan **olib tashlanadi**.
- `forcedColumns: {}` yoki `allowedColumns: []` — repository yaratilishida **xato**.
- ⚠️ Guard **faqat o'qish** metodlariga ta'sir qiladi (`findAll`/`findOne`/
  `findById`/`findList`/`findInfinite`/`findCursor` + `aggregate`). Yozish
  metodlari (`create`, `upsert`, `updateById`, `softDelete`, …) tip kontrakti
  bo'yicha **to'liq hujjatni** qaytaradi. Yozish natijasini clientga
  qaytarishdan oldin `findById` bilan qayta o'qing yoki o'zingiz map qiling.

### 4. Noto'g'ri shartlar: kuzatish yoki rad etish

Noma'lum filter/sort kaliti default'da **jimgina tashlab yuboriladi**. Muammosi:
filter natijani _cheklash_ uchun ishlatiladi, shuning uchun typo qilingan kalit
yo'qolsa endpoint kutilganidan **ko'proq** data qaytaradi.

```ts
// 1-qadam: kuzatish (xulq o'zgarmaydi)
createRegistry(mongoose.connection, {
  onSkippedCondition: info => logger.warn({ querykit: info }, "shart tashlab yuborildi"),
});

// 2-qadam: log tozalanganda — qattiq rejim
createRegistry(mongoose.connection, { strict: true });
```

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return c.json({ error: err.message, info: err.info }, 400);
  throw err;
}
```

`scope` va `cursorKey` kaliti **har doim** fatal (`strict`dan qat'i nazar).

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

- **Indekslar va operatorlar.** `startsWith` — `^` bilan bog'langan, lekin registrga sezgirsiz (`i`) regex: MongoDB uni indeks bilan yomon ishlatadi. Katta kolleksiyada kichik harfli soya maydon (`nameLower`) saqlang va unga `=` / `startsWith` bering. `contains`, `endsWith`, `!=`, `notIn` indeksdan foydalana olmaydi (COLLSCAN) — default `filterable`da yopiq, faqat kichik kolleksiyalar uchun oching. Enum maydonlarida `in` ishlating.

## Safe by default — `filterable`, `sortable`, `limits`

Mijoz faqat server ruxsat bergan path bo'yicha, faqat ruxsat bergan operator bilan filtrlaydi va saralaydi. Ruxsatsiz so'rov MongoDB'ga yetmasdan `QueryKitError` bilan to'xtaydi — `strict` va `onSkippedCondition`dan qat'i nazar. Opsiya nomlari, default'lar, `reason`/`site` — drizzle-pg va prisma-pg bilan bir xil (`id` ≡ `_id`).

```ts
const usersRepository = registry.repository(User, {
  forcedColumns: { _id: true, name: true, status: true, createdAt: true },
  filterable: {
    status: ["=", "in"],
    createdAt: ["between", ">=", "<="],
    name: ["startsWith"], // faqat shu yerda ochilgan
  },
  sortable: ["_id", "createdAt", "name"],
  limits: { maxInItems: 500 },
  maxTimeMS: 1000,
});
```

| Opsiya       | Berilmasa (default)                                                                                                  | Rad etilsa                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `filterable` | `allowedColumns` (yo'q bo'lsa `forcedColumns` kalitlari, u ham yo'q bo'lsa faqat primary key), faqat `"="` va `"in"` | `reason: "forbidden-key"` / `"forbidden-operator"`, `site: "filter"` |
| `sortable`   | primary key va `createdAt` (jadvalda bo'lsa); mijoz yuborgan `cursorKey` ham shu ro'yxatdan                          | `reason: "forbidden-key"`, `site: "sort"` / `"cursorKey"`            |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (chuqurlik 5, shartlar 30, massiv 200, satr 256, offset 10 000, sort 3)                  | `reason: "limit-exceeded"`, `site: "filter"` / `"sort"` / `"page"`   |

- `aggregate`: `filter` va har `groupBy`/`sum`/`avg`/`min`/`max` ustuni `filterable` ichida bo'lishi shart (`site: "aggregate"`).
- `findById`: faqat mijoz `filter`i tekshiriladi; `idKey` — server tanlovi.
- Jadvalda **yo'q** kalit (`nope`) avvalgidek `unknown-key` — skip yoki `strict`da xato.
- Mutatsiya metodlari (`updateMany`, `deleteMany`, …) filtri server kodi deb hisoblanadi va tekshirilmaydi.
- Operator aliaslari bitta: `["="]` `eq`ni ham, `["contains"]` `%_%`ni ham ochadi. `"*"` — barcha operatorlar.
- Brendsiz xom Mongo filtri (`{ $where: … }`, `{ secret: { $regex: … } }`, `{ $expr: … }`) JSON'dan kelishi mumkin — `forbidden-key`, so'rov yuborilmaydi (R19). Server kodi `raw({...})` bilan belgilaydi; ⚠️ `raw()` `filterable` bilan tekshirilmaydi.
- LIKE naqshi: `maxLikeWildcards` (2) dan ko'p `%`/`_` → `limit-exceeded`; ketma-ket `%%` bitta hisoblanadi.
- Har o'qish (`find`, `findOne`, `countDocuments`, `aggregate`) `maxTimeMS` (default 2 000) bilan; oshsa `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`) — uni 503/504 qiling, 400 emas.

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
// withTotal: false — count so'ralmaydi (katta jadval): perPage + 1 qator, total_items / total_pages = null
const fast = await usersRepository.findList({ page: 2, perPage: 20, withTotal: false });

// 2. Infinite scroll (limit + offset) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (insert'larда barqaror, default `_id` bo'yicha) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

### Cursor: teng qiymatlar va imzo

- Seek kaliti `(cursorKey, _id)`: `cursorKey` unikal bo'lmasa ham (masalan bir xil `createdAt`) hech bir qator tushib qolmaydi va takrorlanmaydi. `cursorKey` primary key'ning o'zi bo'lsa — bitta maydonli seek.
- Token (v2) ichida faqat skalyar qiymat (satr, son, boolean, ISO sana) bo'ladi va maydon tipiga cast qilinadi; obyekt, massiv yoki mos kelmaydigan qiymat → `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` (drayver chaqirilmaydi).
- Registry opsiyasi `cursorSecret` token'ni HMAC-SHA256 bilan imzolaydi; imzosiz yoki o'zgartirilgan token → `invalid-value`. Usiz token imzosiz — mijoz uni o'zi yasay oladi (faqat ruxsat etilgan `sortable` kalit va filter doirasida).

```ts
export const registry = createRegistry(mongoose.connection, { cursorSecret: process.env.CURSOR_SECRET });
```

## Tipli relation'lar va maydon tanlash

Mijoz `with` bilan faqat `relations`da yozilgan relation'larni ochadi (task 014, R21):

```ts
const postsRepository = registry.repository(Post, {
  relations: { author: { model: User, columns: ["name"] } }, // model — faqat tip uchun
});
await postsRepository.findAll({ with: { author: true } }); // author faqat name bilan
```

- `columns` majburiy — ro'yxat yoki aniq `"*"`. `with: { rel: true }` ham faqat shu ustunlarni tanlaydi.
- Ro'yxatda yo'q relation, ustun, filtr maydoni yoki ichki relation → `QueryKitError` `reason: "forbidden-key"`, `site: "with"`, `key` — `relation` yoki `relation.field`; drayver chaqirilmaydi.
- Ruxsat etilgan opsiyalar: `select`, ichki `populate` (`nested` bilan), `match` (maydonlari `filterable`da; `$where` / `$expr` yo'q), `options.limit` / `options.skip`.
- Qisqa yozuv `{ author: User }` faqat tip uchun: `with: { author: … }` → `forbidden-key`.

O'qish metodlari natija tipini `with` (populate) va `columns`dan chiqaradi — qo'lda generic yo'q:

```ts
const post = await postsRepository.findById(id, { with: { author: true } });
post?.author.name; // populate qilingan

const rows = await usersRepository.findAll({ columns: { id: true, name: true } });
rows[0].id; // ObjectId
rows[0].email; // ❌ tip xatosi — tanlanmagan
```

Populate qilingan relation'larni tiplash va ochish uchun ref model'ni rule ichida bering: `registry.repository(Post, { relations: { author: { model: User, columns: ["name"] } } })` (qisqa `{ author: User }` faqat tip — `with`ga ruxsat bermaydi).

## Ommaviy yangilash va o'chirish

`updateWhere` / `deleteWhere` — bitta yozish so'rovi (oldin o'qish yo'q), natija `{ count }`:

```ts
const { count } = await usersRepository.updateWhere([{ key: "status", value: "trial" }], { status: "expired" });
await usersRepository.deleteWhere([{ key: "status", value: "expired" }]); // { count }

// returning: { limit } — `{ count, rows }`, ko'pi bilan limit ta qator (maxLimit, default 200)
const { rows } = await usersRepository.updateWhere(filter, patch, { returning: { limit: 50 } });

// filtrsiz — faqat aniq ko'rsatilsa (scope baribir qo'llanadi)
await usersRepository.deleteWhere({ all: true });
```

- Bo'sh filtr (`undefined`, `{}`, `[]`) yoki hamma sharti tashlab yuborilgan filtr (masalan faqat noma'lum kalit) → `QueryKitError` `reason: "empty-filter"`, `site: "mutation"` — drayver chaqirilmaydi, jadval jim o'chmaydi.
- Mutatsiya filtri o'qishdagidek `filterable` va `limits`dan o'tadi (`forbidden-key`, `forbidden-operator`, `limit-exceeded`). Server'ning o'z filtri ham.
- `rows` atomar **emas**: `updateWhere` — yangilashdan **keyin** shu filtr bilan o'qiladi (patch filtrdagi maydonni o'zgartirsa, boshqa hujjatlar chiqishi mumkin); `deleteWhere` — o'chirishdan **oldin** o'qiladi. `count` — `matchedCount` / `deletedCount`.

## Tranzaksiya

> ⚠️ Callback ichida **faqat DB amallari**. Tashqi amallar (HTTP, xabar, email) — outbox orqali: drayver tranzaksiyani qayta urinishi mumkin, tashqi amal esa takrorlanadi va qaytarib bo'lmaydi.

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

Scope'ni `registry.repository(Model, { scope })` bilan ham berish mumkin.
Noma'lum scope kaliti — repository yaratilishida **xato** (jimgina tashlansa
RBAC filtri yo'qolib ketardi).

Scope qiymati ro'yxat ham bo'lishi mumkin (task 014): `{ shopId: { in: [1, 2] } }` — har o'qish va yozish shu qiymatlar bilan cheklanadi; bo'sh ro'yxat (`{ in: [] }`) — hech qanday qator (xato emas). `create` faqat tenglik scope'larini to'ldiradi.

```ts
const mine = repository.scoped({ shopId: { in: user.shopIds } });
```

## Qiymatlar, NULL tartibi va bir xillik

Uchala adapter (drizzle-pg, prisma-pg, mongoose) bir xil natija beradi (task 021):

- **Literal qiymat operatorlari.** `contains`, `startsWith`, `endsWith` qiymatni harfma-harf qidiradi: `startsWith "%"` faqat `%` bilan boshlanuvchi qatorlar, `contains "_"` — haqiqiy `_`. Wildcard faqat `like` / `ilike` / `notLike` da.
- **Tip cast'i.** Har qiymat maydon tipiga keltiriladi (son, boolean, sana, ObjectId, enum). Mos kelmasa (`age = "abc"`) — `invalid-value`: shart tashlanadi va `onSkippedCondition` chaqiriladi, `strict` da `QueryKitError`; drayver chaqirilmaydi.
- **`not`** — SQL uch qiymatli mantiq: NULL maydon bo'yicha `not(and(…))` / `not(or(…))` hamma adapterda bir xil.
- **NULL tartibi.** `asc` — NULL birinchi, `desc` — NULL oxirida (MongoDB tartibi).
- **Buzuq sort elementi** (`null`, `{}`) — tashlanadi va `invalid-value` (`site: "sort"`) bilan xabar qilinadi, `strict` da xato.

## Migrating to 3.0

3.0 da siyosatsiz repository **tor**: faqat `allowedColumns` / `forcedColumns` / `_id` bo'yicha `=` va `in`, sort — `_id` va `createdAt`. 2.x xulqini bitta repository uchun ataylab qaytarish:

```ts
const open = registry.repository(User, {
  filterable: { _id: "*", name: "*", email: "*", status: "*", createdAt: "*" },
  sortable: ["_id", "name", "email", "status", "createdAt"],
});
```

Xom Mongo filtri endi `raw()` bilan (R19):

```ts
import { raw } from "@querykitjs/core";

// 2.x — 3.0 da forbidden-key:
// await usersRepository.findAll({ filter: { age: { $gt: 18 } } });

// 3.0:
await usersRepository.findAll({ filter: raw({ age: { $gt: 18 } }) });
```

- Yangi `reason`lar: `forbidden-key`, `forbidden-operator`, `limit-exceeded`; yangi `site`: `page` — 400 qiling.
- Offset 10 000 dan chuqur sahifalar rad etiladi — `findCursor` ishlating yoki `limits: { maxOffset }` bilan oshiring.
- Har o'qish `maxTimeMS: 2000` bilan; uzoqroq hisobot so'rovlari uchun repository'da `maxTimeMS`ni oshiring. Vaqt tugasa `QueryKitTimeoutError`.
- LIKE naqshida 2 tadan ko'p wildcard rad etiladi (`maxLikeWildcards`).
- Cursor token formati v2 (task 012): eski (v1) `next_cursor` / `prev_cursor` endi `invalid-value` bilan rad etiladi — yangilashdan keyin paginatsiyani birinchi sahifadan boshlang.
- `updateWhere` / `deleteWhere` endi `Row[]` emas, `{ count }` qaytaradi (task 013); qatorlar kerak bo'lsa `{ returning: { limit } }` → `{ count, rows }`.
- Filtrsiz `updateWhere` / `deleteWhere` → `empty-filter`; hamma qatorlar uchun `{ all: true }` yozing. Mutatsiya filtri endi `filterable` siyosatidan o'tadi.
- `OffsetMeta.total_items` / `total_pages` tipi `number | null` (`withTotal: false` bilan `null`).
- `with` endi faqat `relations` allow-list bilan ishlaydi (task 014): ro'yxatsiz repository'da `with` → `forbidden-key`, `site: "with"`.
- `relations: { author: User }` → `relations: { author: { model: User, columns: ["name"] } }` (qisqa yozuv endi `with`ga ruxsat bermaydi).
- Scope qiymati `{ in: [...] }` bo'lishi mumkin; `timestamps` registry opsiyasi createdAt / deletedAt nomlarini beradi.

## Wire (JSON) qiymatlari va DbService'dan migratsiya

Backend so'rov body'sini JSON'da oladi, ya'ni sana har doim **string** bo'lib
keladi. Adapter uni schema path tipiga qarab avtomatik cast qiladi:

```json
{ "key": "createdAt", "operation": "<=", "value": "2026-07-28T12:00:00.000Z" }
```

- `Date` path'lari → ISO string avtomatik `Date`ga aylanadi. Qamrov **ataylab**
  drizzle-pg bilan bir xil: u ham faqat JS orqali map qilinadigan tiplarni
  hukm qiladi, qolganini bazaga qoldiradi.
- `in`/`notIn` massivlari, `between`/`notBetween` tuple'lari va cursor token ham
  qamraladi (`cursorKey: "createdAt"` ishlaydi).
- Mongo `Date` path'da `$regex` qila olmaydi (`Can't use $options with Date`),
  shuning uchun date maydonidagi text-pattern operatori (`contains`/`ilike`/…)
  `invalid-value` sifatida **tashlab yuboriladi** va `onSkippedCondition`da ko'rinadi —
  SQL adapterlar ham shunday qiladi.
- Parse bo'lmaydigan qiymat (`"not-a-date"`) shartni bekor qiladi (`strict`da —
  400). `in` ro'yxatidagi **bitta** yaroqsiz element butun shartni bekor qiladi.

**DbService migratsiyasi:** eski wire'dagi `type: "date"` maydoni endi keraksiz —
`@querykitjs/zod` uni strip qiladi (xato bermaydi), coercion esa server tomonda
path tipidan avtomatik.

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

| Metod                                                                    | Qaytaradi                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `findAll(params?)`                                                       | `Row[]`                                                               |
| `findOne(params?)` / `findById(id, params?)`                             | `Row \| undefined`                                                    |
| `findList(params?)`                                                      | `{ data, meta }` offset                                               |
| `findInfinite(params?)`                                                  | `{ data, meta }` infinite                                             |
| `findCursor(params?)`                                                    | `{ data, meta }` cursor                                               |
| `count(filter?)` / `exists(filter?)`                                     | `number` / `boolean`                                                  |
| `aggregate(spec)`                                                        | `AggregateRow[]`                                                      |
| `create(values)` / `createMany(values)`                                  | `Row` / `Row[]`                                                       |
| `upsert(values, opts)` / `upsertMany(values, opts)`                      | `Row` / `Row[]`                                                       |
| `updateById(id, patch, idKey?)` / `updateWhere(filter, patch, options?)` | `Row \| undefined` / `{ count }` (`{ count, rows }` with `returning`) |
| `deleteById(id, idKey?)` / `deleteWhere(filter, options?)`               | `Row \| undefined` / `{ count }` (`{ count, rows }` with `returning`) |
| `softDelete(id)` / `restore(id)`                                         | `Row \| undefined`                                                    |
| `scoped(scope)`                                                          | scoped `Repository`                                                   |
| `registry.transaction(fn)`                                               | `fn` natijasi                                                         |

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
