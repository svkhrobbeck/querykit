<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/drizzle-pg

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
bun add @querykitjs/drizzle-pg drizzle-orm
# yoki: npm i @querykitjs/drizzle-pg drizzle-orm
```

`drizzle-orm` — peer dependency.

### Talablar

|                      | Versiya        | Tekshiriladi (`bun run test:matrix`) |
| -------------------- | -------------- | ------------------------------------ |
| Node.js              | `>=22.12`      | 24                                   |
| `drizzle-orm` (peer) | `>=0.44 <0.46` | 0.44.7, 0.45.4                       |

Node 20 endi qo'llab-quvvatlanmaydi (`engines`: `>=22.12`). Peer diapazoni — oxirgi ikki major; ikkala cheti testda.

## Sozlash

### 1. Registry (bir marta)

```ts
// db/registry.ts
import { createRegistry } from "@querykitjs/drizzle-pg";
import { db } from "./index"; // drizzle(client, { schema })
import * as schema from "./schema";

export const registry = createRegistry(db, schema);
// yoki pagination default'larini sozlab:
// export const registry = createRegistry(db, schema, { defaultPerPage: 20, defaultLimit: 20 });
```

> ⚠️ `createRegistry`ga `drizzle(client, { schema })`dagi bilan **AYNI** schema
> obyektini bering. Jadval schema'da **obyekt identity** bo'yicha qidiriladi
> (drizzle `db.query`ni shunday kalitlaydi), shuning uchun schema'ni ikki xil
> yo'ldan import qilish (monorepo dublikati, bundler, ikkinchi `* as schema`)
> «table was not found» xatosiga olib keladi. Bu holatda xato xabari
> dublikat-import ekanini o'zi aytadi.

**`createRegistry` opsiyalari** — mongoose adapteri bilan **aynan bir xil**:

| Opsiya               | Default                           | Ma'nosi                                                   |
| -------------------- | --------------------------------- | --------------------------------------------------------- |
| `defaultPerPage`     | core `DEFAULT_PER_PAGE` (20)      | `findList` sahifa o'lchami                                |
| `defaultLimit`       | core `DEFAULT_LIMIT` (20)         | `findInfinite`/`findCursor` `limit`i                      |
| `maxPerPage`         | core `DEFAULT_MAX_PER_PAGE` (200) | `perPage` yuqori chegarasi (`Infinity` — o'chirish)       |
| `maxLimit`           | core `DEFAULT_MAX_LIMIT` (200)    | `limit` yuqori chegarasi                                  |
| `strict`             | `false`                           | noma'lum kalit → `QueryKitError` (400), jimgina skip emas |
| `onSkippedCondition` | —                                 | tashlab yuborilgan har bir shart uchun callback           |

`maxPerPage`/`maxLimit` — **ikkinchi himoya qatlami**: validatsiya
(`@querykitjs/zod` factory'lari) chetlab o'tilsa ham repository o'zi clamp
qiladi.

`timestamps` — createdAt / deletedAt maydon nomlari (masalan snake_case loyihada): default sort va default `sortable` shu `createdAt`ni, soft-delete (`softDelete`, `restore`, `withDeleted`) shu `deletedAt`ni ishlatadi.

```ts
export const registry = createRegistry(db, schema, { timestamps: { createdAt: "created_at", deletedAt: "deleted_at" } });
```

### 2. Jadval repositorylari

```ts
// db/repositories/users.repository.ts
import { registry } from "../registry";
import { users } from "../schema";

export const usersRepository = registry.repository(
  users,
  // 4.0: filtr/sort faqat shu ro'yxatdagi ustunlar bo'yicha (Safe by default)
  { filterable: { email: ["="], status: ["=", "in"], age: [">=", "<="] }, sortable: ["id", "createdAt"] },
  base => ({
    // base metodlar ustiga custom metod
    findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
  }),
);
```

⚠️ Siyosat repository'ning **har** o'qish chaqiruviga qo'llanadi — custom metodlardagi server filtrlari ham (`findByEmail` uchun `email` `filterable`da). Mijozga ochilmaydigan ustun bo'yicha ichki so'rov kerak bo'lsa, ichki ishlatish uchun alohida, kengroq repository yarating va uni route'ga bermang.

`repository()` to'rt shaklda chaqiriladi (mongoose adapteri bilan bir xil):

```ts
registry.repository(users);                       // sof
registry.repository(users, base => ({ … }));      // + custom metodlar
registry.repository(users, options);              // + per-repo opsiyalar
registry.repository(users, options, base => ({ … })); // ikkisi ham
```

### 3. Projection himoyasi (`RepositoryOptions`)

`columns` clientdan kelishi mumkin, shuning uchun xavfsiz tanlov **repository'da**
belgilanadi — `scope` (RBAC) allaqachon shu yo'lda:

```ts
export const usersRepository = registry.repository(users, {
  forcedColumns: { id: true, fullName: true, email: true }, // parol hech qachon chiqmaydi
});

// yoki yumshoqroq: client faqat shu ro'yxatdan tanlaydi
export const postsRepository = registry.repository(posts, {
  allowedColumns: ["id", "title", "createdAt"],
});
```

| Opsiya           | Xulqi                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| `forcedColumns`  | client `columns`i **butunlay e'tiborsiz**                                             |
| `allowedColumns` | client tanlovi allowlist bilan **kesiladi**; kesishma bo'sh bo'lsa → allowlist        |
| `scope`          | har bir o'qish/yozishga doimiy tenglik filtri (`scoped()` bilan ham berilishi mumkin) |

Muhim nozikliklar:

- Kesishma bo'sh bo'lganda natija **to'liq qator emas** — allowlistning o'zi.
  Ya'ni taqiqlangan ustunni so'rash foydasiz, xavfli emas.
- `aggregate` ham shu guard ostida: `min("password")` yoki
  `groupBy: "password"` projection bilan bir xil miqdorda ma'lumot chiqaradi.
- `cursorKey` clientdan keladi va cursor ustuni paginatsiya uchun majburan
  tanlanadi — guard bor bo'lsa u ustun so'rovda qoladi, lekin qaytariladigan
  qatorlardan **olib tashlanadi**.
- `forcedColumns: {}` yoki `allowedColumns: []` — repository yaratilishida
  **xato**, chunki «hech narsa tanlanmagan» projection «hammasi» degani bo'lardi.
- ⚠️ Guard **faqat o'qish** metodlariga ta'sir qiladi (`findAll`/`findOne`/
  `findById`/`findList`/`findInfinite`/`findCursor` + `aggregate`). Yozish
  metodlari (`create`, `upsert`, `updateById`, `softDelete`, …) tip kontrakti
  bo'yicha **to'liq qatorni** qaytaradi. Yozish natijasini clientga qaytarishdan
  oldin `findById` bilan qayta o'qing yoki o'zingiz map qiling.

Shu bilan route'da `{ ...params, columns: SAFE_COLUMNS }` spread-trick'i kerak
bo'lmaydi (va spread tartibini adashtirib yuborish imkoni yo'q).

### 4. Noto'g'ri shartlar: kuzatish yoki rad etish

Noma'lum filter/sort kaliti default'da **jimgina tashlab yuboriladi** (DbService
parity). Muammosi: filter natijani _cheklash_ uchun ishlatiladi, shuning uchun
typo qilingan kalit yo'qolsa endpoint kutilganidan **ko'proq** data qaytaradi.

```ts
// 1-qadam: kuzatish (xulq o'zgarmaydi)
createRegistry(db, schema, {
  onSkippedCondition: info => logger.warn({ querykit: info }, "shart tashlab yuborildi"),
});

// 2-qadam: log tozalanganda — qattiq rejim
createRegistry(db, schema, { strict: true });
```

`strict: true` bo'lsa `QueryKitError` tashlanadi:

```ts
import { QueryKitError } from "@querykitjs/core";

try {
  return await usersRepository.findList(params);
} catch (err) {
  if (err instanceof QueryKitError) return c.json({ error: err.message, info: err.info }, 400);
  throw err;
}
```

`scope` va `cursorKey` kaliti **har doim** fatal (`strict`dan qat'i nazar) —
ular serverning o'z ishi, jimgina tashlash xavfsizlik nuqsoni bo'lardi.

## Safe by default — `filterable`, `sortable`, `limits`

Mijoz faqat server ruxsat bergan ustun bo'yicha, faqat ruxsat bergan operator bilan filtrlaydi va saralaydi. Ruxsatsiz so'rov bazaga yetmasdan `QueryKitError` bilan to'xtaydi — `strict` va `onSkippedCondition`dan qat'i nazar (jim tashlanmaydi).

```ts
const usersRepository = db.repository(users, {
  forcedColumns: { id: true, fullName: true, status: true, createdAt: true },
  filterable: {
    status: ["=", "in"],
    createdAt: ["between", ">=", "<="],
    fullName: ["contains"], // "contains" va uning tokeni "%_%" — bitta operator
  },
  sortable: ["id", "createdAt", "fullName"],
  limits: { maxInItems: 500 }, // registry createRegistry(..., { limits }) ustidan
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

## Advanced filterlar

Filter — field shartlari va mantiqiy guruhlar (`and`/`or`/`not`) daraxti. Flat massiv implicit `AND` sifatida qabul qilinadi.

```ts
import { createFilters } from "@querykitjs/drizzle-pg";
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

Sort — `{ key, direction }[]` massivi, `@querykitjs/web` va barcha adapterlar bilan bir xil shakl.

Sort berilmasa `createdAt DESC` ga, u bo'lmasa `id DESC` ga tushadi — pagination barqaror bo'lishi uchun deterministik tartib.

## Paginatsiya — 3 strategiya

```ts
// 1. Offset (klassik sahifalar) — total_items / total_pages
const page = await usersRepository.findList({ page: 2, perPage: 20, filter, sort });
// withTotal: false — count so'ralmaydi (katta jadval): perPage + 1 qator, total_items / total_pages = null
const fast = await usersRepository.findList({ page: 2, perPage: 20, withTotal: false });

// 2. Infinite scroll (limit + offset, COUNT'siz) — has_more / next_offset
const feed = await usersRepository.findInfinite({ limit: 20, offset: 40 });

// 3. Cursor / keyset (insert'larga barqaror) — next_cursor / prev_cursor
const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
const back = await usersRepository.findCursor({ cursor: p2.meta.prev_cursor, direction: "backward" });
```

### Cursor: teng qiymatlar va imzo

- Seek kaliti `(cursorKey, primary key)`: `cursorKey` unikal bo'lmasa ham (masalan bir xil `createdAt`) hech bir qator tushib qolmaydi va takrorlanmaydi. `cursorKey` primary key'ning o'zi bo'lsa — bitta maydonli seek.
- Token (v2) ichida faqat skalyar qiymat (satr, son, boolean, ISO sana) bo'ladi va maydon tipiga cast qilinadi; obyekt, massiv yoki mos kelmaydigan qiymat → `QueryKitError` `reason: "invalid-value"`, `site: "cursorKey"` (drayver chaqirilmaydi).
- Registry opsiyasi `cursorSecret` token'ni HMAC-SHA256 bilan imzolaydi; imzosiz yoki o'zgartirilgan token → `invalid-value`. Usiz token imzosiz — mijoz uni o'zi yasay oladi (faqat ruxsat etilgan `sortable` kalit va filter doirasida).

```ts
export const registry = createRegistry(db, schema, { cursorSecret: process.env.CURSOR_SECRET });
```

## Tipli relation & column tanlash

Mijoz `with` bilan faqat `relations`da yozilgan relation'larni ochadi (task 014, R21):

```ts
const postsRepository = registry.repository(posts, {
  relations: { author: { columns: ["id", "name"] } }, // nested: { … } — ichki with uchun xuddi shu shakl
});
await postsRepository.findAll({ with: { author: true } }); // author faqat id, name bilan
```

- `columns` majburiy — ro'yxat yoki aniq `"*"`. `with: { rel: true }` ham faqat shu ustunlarni tanlaydi.
- Ro'yxatda yo'q relation, ustun, filtr maydoni yoki ichki relation → `QueryKitError` `reason: "forbidden-key"`, `site: "with"`, `key` — `relation` yoki `relation.field`; drayver chaqirilmaydi.
- Ruxsat etilgan opsiyalar: `columns`, ichki `with` (`nested` bilan), `limit` / `offset`.

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
- `rows` — o'sha bitta `UPDATE … RETURNING` / `DELETE … RETURNING` natijasi (atomar), `limit` gacha kesilgan.

## Tranzaksiyalar

> ⚠️ Callback ichida **faqat DB amallari**. Tashqi amallar (HTTP, xabar, email) — outbox orqali: drayver tranzaksiyani qayta urinishi mumkin, tashqi amal esa takrorlanadi va qaytarib bo'lmaydi.

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

Scope'ni `registry.repository(table, { scope })` bilan ham berish mumkin.
Noma'lum scope kaliti — repository yaratilishida **xato** (jimgina tashlansa
RBAC filtri yo'qolib ketardi).

Scope qiymati ro'yxat ham bo'lishi mumkin (task 014): `{ shopId: { in: [1, 2] } }` — har o'qish va yozish shu qiymatlar bilan cheklanadi; bo'sh ro'yxat (`{ in: [] }`) — hech qanday qator (xato emas). `create` faqat tenglik scope'larini to'ldiradi.

```ts
const mine = repository.scoped({ shopId: { in: user.shopIds } });
```

## Qiymatlar, NULL tartibi va bir xillik

Uchala adapter (drizzle-pg, prisma-pg, mongoose) bir xil natija beradi (task 021):

- **Literal qiymat operatorlari.** `contains`, `startsWith`, `endsWith` qiymatni harfma-harf qidiradi: `startsWith "%"` faqat `%` bilan boshlanuvchi qatorlar, `contains "_"` — haqiqiy `_`. Wildcard faqat `like` / `ilike` / `notLike` da.
- **Tip cast'i.** Har qiymat maydon tipiga keltiriladi (son, boolean, sana, uuid, enum). Mos kelmasa (`age = "abc"`) — `invalid-value`: shart tashlanadi va `onSkippedCondition` chaqiriladi, `strict` da `QueryKitError`; drayver chaqirilmaydi.
- **`not`** — SQL uch qiymatli mantiq: NULL maydon bo'yicha `not(and(…))` / `not(or(…))` hamma adapterda bir xil.
- **NULL tartibi.** `asc` — NULL birinchi, `desc` — NULL oxirida (MongoDB tartibi). drizzle-pg `NULLS FIRST` / `NULLS LAST` qo'yadi — ⚠️ PostgreSQL'ning odatiy tartibidan farq qiladi.
- **Buzuq sort elementi** (`null`, `{}`) — tashlanadi va `invalid-value` (`site: "sort"`) bilan xabar qilinadi, `strict` da xato.

## Migrating to 4.0

4.0 da siyosatsiz repository **tor**: faqat `allowedColumns` / `forcedColumns` / primary key bo'yicha `=` va `in`, sort — primary key va `createdAt`. 3.x xulqini (istalgan ustun, istalgan operator) bitta repository uchun ataylab qaytarish:

```ts
const open = db.repository(users, {
  filterable: { id: "*", fullName: "*", email: "*", status: "*", createdAt: "*" },
  sortable: ["id", "fullName", "email", "status", "createdAt"],
});
```

- Avval `onSkippedCondition` loglaridan qaysi maydon/operator ishlatilayotganini yig'ing, keyin `filterable`ni aynan shularga toraytiring — `"*"` vaqtinchalik yo'l.
- `QueryKitError`ning yangi `reason`lari: `forbidden-key`, `forbidden-operator`, `limit-exceeded`; yangi `site`: `page`. Ularni 400 qilib qaytaring.
- Offset 10 000 dan chuqur sahifalar endi rad etiladi — `findCursor` ishlating yoki `limits: { maxOffset }` bilan oshiring.
- Cursor token formati v2 (task 012): eski (v1) `next_cursor` / `prev_cursor` endi `invalid-value` bilan rad etiladi — yangilashdan keyin paginatsiyani birinchi sahifadan boshlang.
- `updateWhere` / `deleteWhere` endi `Row[]` emas, `{ count }` qaytaradi (task 013); qatorlar kerak bo'lsa `{ returning: { limit } }` → `{ count, rows }`.
- Filtrsiz `updateWhere` / `deleteWhere` → `empty-filter`; hamma qatorlar uchun `{ all: true }` yozing. Mutatsiya filtri endi `filterable` siyosatidan o'tadi.
- `OffsetMeta.total_items` / `total_pages` tipi `number | null` (`withTotal: false` bilan `null`).
- `with` endi faqat `relations` allow-list bilan ishlaydi (task 014): ro'yxatsiz repository'da `with` → `forbidden-key`, `site: "with"`.
- Scope qiymati `{ in: [...] }` bo'lishi mumkin; `timestamps` registry opsiyasi createdAt / deletedAt nomlarini beradi.

## Wire (JSON) qiymatlari va DbService'dan migratsiya

Backend so'rov body'sini JSON'da oladi, ya'ni sana har doim **string** bo'lib
keladi. Adapter uni ustun tipiga qarab avtomatik cast qiladi:

```json
{ "key": "createdAt", "operation": "<=", "value": "2026-07-28T12:00:00.000Z" }
```

- `timestamp`/`date` ustunlari (`mode: "date"` — drizzle default'i) → ISO string
  avtomatik `Date`ga aylanadi. `mode: "string"` ustunlari tegilmaydi.
- `in`/`notIn` massivlari va `between`/`notBetween` tuple'lari ham qamraladi.
- Cursor token ham shunday: `cursorKey: "createdAt"` bilan paginatsiya ishlaydi.
- Text-pattern operatorlar (`like`/`ilike`/`contains`/… va inkorlari) matn
  bo'lmagan ustunda (timestamp, son, boolean, uuid, enum) — `invalid-value`:
  shart tashlanadi va `onSkippedCondition` chaqiriladi, `strict` da `QueryKitError`;
  drayver chaqirilmaydi (Postgres'da `timestamptz ~~* text` operatori yo'q, avval 500 edi).
  Hamma adapterda bir xil (R11).
- Parse bo'lmaydigan qiymat (`"not-a-date"`) shartni bekor qiladi (`strict`da —
  400). `in` ro'yxatidagi **bitta** yaroqsiz element butun shartni bekor qiladi,
  chunki yarim qo'llangan filter natijani jimgina kengaytirardi.

**DbService migratsiyasi:** eski wire'dagi `type: "date"` maydoni endi keraksiz —
`@querykitjs/zod` uni strip qiladi (xato bermaydi), coercion esa server tomonda
ustun tipidan avtomatik. App tomonidagi `coerceDateFilters` kabi yordamchilarni
olib tashlash mumkin.

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

| Metod                                                                    | Qaytaradi                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `findAll(params?)`                                                       | `Row[]`                                                               |
| `findOne(params?)`                                                       | `Row \| undefined`                                                    |
| `findById(id, params?)`                                                  | `Row \| undefined`                                                    |
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
DATABASE_URL=... bun run --filter @querykitjs/drizzle-pg test:smoke
```

## Litsenziya

MIT © Suhrobbek Soatov
