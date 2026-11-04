<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/mongodb

[![npm](https://img.shields.io/npm/v/@querykitjs/mongodb.svg)](https://www.npmjs.com/package/@querykitjs/mongodb) [![license](https://img.shields.io/npm/l/@querykitjs/mongodb.svg)](./LICENSE)

> Rasmiy MongoDB drayveri uchun murakkab filtr + moslashuvchan paginatsiya repository qatlami.

Oddiy `mongodb` drayveridagi (Mongoose'siz) loyihalar uchun: har kolleksiyaga bitta tipli repository — murakkab filtrlar, uch xil paginatsiya, tranzaksiyalar, RBAC scope, soft-delete, ommaviy yozish va agregatsiya. Maydon tiplari sizning **zod** sxemangizdan olinadi. Publik shakl [`@querykitjs/mongoose`](https://www.npmjs.com/package/@querykitjs/mongoose), [`@querykitjs/drizzle-pg`](https://www.npmjs.com/package/@querykitjs/drizzle-pg) va [`@querykitjs/prisma-pg`](https://www.npmjs.com/package/@querykitjs/prisma-pg) bilan bir xil, shuning uchun **bitta frontend kontrakti** ([`@querykitjs/web`](https://www.npmjs.com/package/@querykitjs/web)) har backend bilan ishlaydi.

## Tez boshlash

```ts
import { MongoClient, type ObjectId } from "mongodb";
import { z } from "zod";
import { createRegistry } from "@querykitjs/mongodb";

const WalletSchema = z.object({
  _id: z.string(),
  shop_id: z.string(),
  owner: z.string(),
  status: z.enum(["active", "blocked"]),
  balance: z.number(),
  created_at: z.date(),
});
type Wallet = { _id: ObjectId; shop_id: ObjectId; owner: string; status: "active" | "blocked"; balance: number; created_at: Date };

const client = await MongoClient.connect(process.env.MONGO_URL!);
const qk = createRegistry(client, { timestamps: { createdAt: "created_at" }, cursorSecret: process.env.CURSOR_SECRET });

export const wallets = qk.repository(client.db("app").collection<Wallet>("wallets"), {
  schema: WalletSchema,
  objectId: ["_id", "shop_id"], // wire'dagi 24-hex satrlar → ObjectId
  forcedColumns: { _id: true, owner: true, status: true, balance: true, created_at: true },
  filterable: { status: ["=", "in"], owner: ["=", "startsWith"], created_at: ["between", ">=", "<="] },
  sortable: ["_id", "created_at", "balance"],
});

// bitta tenant hamyonlari, eng yangisi birinchi, sahifada 20 ta
const shopWallets = wallets.scoped({ shop_id: { in: ["65a1b2c3d4e5f60718293a4b"] } });
const { data, meta } = await shopWallets.findList({ page: 1, perPage: 20, filter: [{ key: "status", value: "active" }] });
```

## O'rnatish

```bash
bun add @querykitjs/mongodb mongodb zod
# yoki: npm i @querykitjs/mongodb mongodb zod
```

### Talablar

- Node.js `>= 22.12` (yoki Bun).
- Peer'lar: `mongodb` `^6.21 || ^7.7`, `zod` `^4`.
- Tranzaksiyalar replica set yoki sharded klaster talab qiladi (lokalda bitta tugunli replica set yetadi, testlarda `mongodb-memory-server`).

## Sozlash

- `createRegistry(client, options)` — default'lar bir marta: `defaultPerPage`, `defaultLimit`, `maxPerPage`, `maxLimit`, `strict`, `onSkippedCondition`, `limits`, `maxTimeMS` (default 2 000), `cursorSecret`, `timestamps`. Har querykit adapteridagi nomlar bilan bir xil.
- `qk.repository(collection, options)` — har kolleksiyaga bitta. `schema` **majburiy**: drayverning o'z sxemasi yo'q, shuning uchun zod obyekti maydon tiplari, noma'lum kalitlar va default `filterable` uchun yagona manba.
- `objectId` — `ObjectId` sifatida saqlanadigan maydonlar (default `["_id"]`). JSON'da ular 24-hex satr bo'lib keladi va shu yerda cast qilinadi; buzuq id — `invalid-value`.
- `forcedColumns` / `allowedColumns` — projection himoyasi (mijozning `columns` i e'tiborsiz / kesishma).
- Uchinchi argument repository'ni kengaytiradi: `qk.repository(collection, options, base => ({ findActive: () => base.findAll({ filter: [{ key: "status", value: "active" }] }) }))`.

## Standartda xavfsiz — `filterable`, `sortable`, `limits`

Mijoz faqat server ruxsat bergan maydonlar bo'yicha, ruxsat berilgan operatorlar bilan filtrlaydi va saralaydi. Rad etilgan so'rov MongoDB'ga yetmasdan `QueryKitError` bilan to'xtaydi — `strict` qanday bo'lmasin.

| Opsiya       | Berilmasa (default)                                                                                 | Rad etilsa                                                           |
| ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `filterable` | `allowedColumns` (bo'lmasa `forcedColumns` kalitlari, bo'lmasa faqat `_id`), faqat `"="` va `"in"`  | `reason: "forbidden-key"` / `"forbidden-operator"`, `site: "filter"` |
| `sortable`   | `_id` va createdAt maydoni                                                                          | `reason: "forbidden-key"`, `site: "sort"` / `"cursorKey"`            |
| `limits`     | core `DEFAULT_QUERY_LIMITS` (chuqurlik 5, shartlar 30, massiv 200, satr 256, offset 10 000, sort 3) | `reason: "limit-exceeded"`, `site: "filter"` / `"sort"` / `"page"`   |

- **Qiymatlar sxema bo'yicha cast qilinadi** — `z.number()` `30` yoki `"30"` ni, `z.date()` ISO satrni, `objectId` maydoni 24-hex satrni, `z.enum` faqat o'z qiymatlarini oladi. Obyekt qiymat (`{ "$where": "…" }`, `{ "$gt": "" }`) hech qachon operator emas: `invalid-value`, drayverga hech narsa yetmaydi.
- JSON body'dan kelgan brendsiz raw Mongo filtri — `forbidden-key`. Server kodi uni `@querykitjs/core` dagi `raw({ ... })` bilan belgilaydi; ⚠️ `raw()` `filterable` tekshiruvidan o'tmaydi.
- LIKE andozalari: `maxLikeWildcards` (2) dan ko'p `%`/`_` → `limit-exceeded`.
- Har o'qish (`find`, `countDocuments`, `aggregate`) `maxTimeMS` bilan (default 2 000); oshsa ⇒ `QueryKitTimeoutError` (`code: "QUERYKIT_TIMEOUT"`) — 400 emas, 503/504 ga map qiling.
- **Indekslar.** `startsWith` — boshi bog'langan, registrga sezgir bo'lmagan regex; MongoDB unga indeksni yomon ishlatadi — katta kolleksiyada kichik harfli soya maydonini saqlang. `contains`, `endsWith`, `!=` va `notIn` indeks ishlata olmaydi — faqat kichik kolleksiyalar uchun oching.

## Paginatsiya — uch strategiya

- `findList({ page, perPage, withTotal })` — offset sahifalar; `withTotal: false` count'ni o'tkazib yuboradi (`total_items` / `total_pages` — `null`).
- `findInfinite({ limit, offset })` — infinite scroll (`has_more`, `next_offset`).
- `findCursor({ cursorKey, limit, cursor, order, direction })` — keyset; `cursorKey` dagi tengliklar `_id` bilan ajratiladi, shuning uchun hech bir qator tushib qolmaydi yoki takrorlanmaydi; `cursorSecret` bilan tokenlar imzolanadi, imzosizi rad etiladi.

### Offset sahifalarda barqaror tartib

`findList` va `findInfinite` tartibi doim primary key bilan tugaydi, birinchi kalit yo'nalishida: `sort: [{ key: "age", direction: "desc" }]` → `age` desc, keyin `_id` desc. Teng qiymatli qator sahifalar orasida takrorlanmaydi va tushib qolmaydi.

- Primary key `maxSortFields` ga sanalmaydi va `sortable` da bo'lishi shart emas; mijoz u bo'yicha saralay olishi o'zgarmaydi. Sort'da allaqachon bo'lsa, qayta qo'shilmaydi.
- `findAll` va `findOne` tartibi o'zgarmaydi: ular sahifalamaydi.
- Tartib `findCursor` tartibi bilan bir xil.
- ⚠️ **Indeks narxi.** `(col, _id)` compound indeksisiz MongoDB bu tartibni xotirada saralaydi, faqat `(col)` indeksi yetmaydi. Katta collection'da `{ col: 1, _id: 1 }` qo'ying; u ikkala yo'nalishga xizmat qiladi. `findCursor` ga ham shu indeks kerak.
- `explainFind` `findAll` rejasini ko'rsatadi, unda bu kalit yo'q.

## Relation'lar (`with`)

Bu versiyada yo'q: `$lookup` qurilmagan, shuning uchun har qanday `with` — `forbidden-key` (`site: "with"`). Bog'liq hujjatlarni ikkinchi repository chaqiruvi bilan yuklang.

## Ommaviy yangilash va o'chirish

`updateWhere(filter, patch)` — bitta `updateMany`, `deleteWhere(filter)` — bitta `deleteMany`: yozishdan oldin o'qish yo'q; `{ count }` qaytaradi (`returning: { limit }` bilan `{ count, rows }`). Bo'sh filtr rad etiladi (`empty-filter`, `site: "mutation"`), agar `{ all: true }` berilmasa. Yozish qiymatlarni berilganicha saqlaydi — so'rovni avval zod sxemangiz bilan tekshiring; drayver hech narsani cast qilmaydi.

## Tranzaksiyalar

```ts
await qk.transaction(async () => {
  await wallets.updateById(fromId, { balance: 90 });
  await wallets.updateById(toId, { balance: 110 });
});
```

`client.withSession` + `withTransaction`; ichida chaqirilgan repository'lar tranzaksiyaga qo'shiladi, ichma-ich chaqiruv tashqisiga qo'shiladi. ⚠️ MongoDB vaqtinchalik xatoda tranzaksiya tanasini qayta ishga tushiradi — yon ta'sirlarni (HTTP chaqiruvlar, xatlar) undan tashqarida qoldiring.

## Scope, soft delete, upsert, agregatsiya

- `scope` (opsiya) / `repo.scoped(scope)` — har o'qish va yozishga qo'shiladi; qiymat `{ in: [...] }` bo'lishi mumkin; tenglik qiymatlari insert'da majburan qo'yiladi.
- Soft delete: `deletedAt` (yoki `timestamps.deletedAt`) maydoni bor sxemada o'chirilgan hujjatlar yashiriladi; `softDelete`, `restore`, `withDeleted: true`.
- `upsert` / `upsertMany` (`target`, `set`), `aggregate({ count, sum, avg, min, max, groupBy, filter })` — bitta `$match` + `$group`.

## Test yordamchisi

```ts
import { explainFind } from "@querykitjs/mongodb/testing";

const plan = await explainFind(wallets, { filter: [{ key: "owner", operation: "startsWith", value: "ali" }] });
```

`findAll(params)` ning query plan'i, xuddi shu tekshiruvlar bilan — so'rov indeks ishlatishini tekshirish uchun. Faqat `/testing` subpath'da, asosiy bundle'da hech qachon.

## API ma'lumotnoma

| Eksport                                     | Nima                                       |
| ------------------------------------------- | ------------------------------------------ |
| `createRegistry(client, options)`           | registry: `repository(...)`, `transaction` |
| `buildRepository(runtime, collection, opt)` | registry'siz repository                    |
| `createFilters<T>()` / `f`                  | tipli / tipsiz filtr quruvchilar           |
| `explainFind(repo, params)` (`/testing`)    | `findAll` ning query plan'i                |

## Ishlab chiqish

```bash
bun run --filter @querykitjs/mongodb test:unit   # oflayn: filtr kompilyatsiyasi + hujum testlari
bun run --filter @querykitjs/mongodb test:smoke  # haqiqiy mongod (mongodb-memory-server)
```

## Litsenziya

MIT
