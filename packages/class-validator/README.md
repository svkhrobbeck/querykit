<div align="right">

[English](./README.en.md) · **O'zbekcha**

</div>

# @querykitjs/class-validator

> querykit so'rov kontraktini (filter/sort/pagination) tekshiruvchi **class-validator** dekoratorlari va DTO'lari. Operatorlar `@querykitjs/core`dan; DTO chiqishi core tiplariga **mos**.

NestJS list endpoint'lariga kelayotgan JSON body'ni validatsiya qiladi — to'liq operatorlar to'plami, nested `and/or/not` filter, va **uchala paginatsiya** (offset/infinite/cursor). Validatsiyalangan payload'ni to'g'ridan-to'g'ri querykit repository'siga uzatasiz.

Bu — [`@querykitjs/zod`](../zod/README.md) bilan **bir xil rol**, faqat boshqa vosita: o'sha kontrakt, o'sha operator manbai, lekin zod schema'lari o'rniga class-validator dekoratorlari.

## O'rnatish

```bash
bun add @querykitjs/class-validator class-validator class-transformer
# @querykitjs/core avtomatik keladi (dependency)
```

`reflect-metadata` ham kerak — Nest app'lari uni allaqachon `main.ts`da import qiladi. Nest'siz ishlatsangiz, entry faylining **eng boshida**:

```ts
import "reflect-metadata";
```

Usiz class-transformer'ning `@Type()` dekoratori `Reflect.getMetadata is not a function` xatosini beradi.

## Foydalanish (NestJS)

`main.ts`:

```ts
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
```

Controller — **factory** varianti (tavsiya etiladi):

```ts
import { makeOffsetParamsDto } from "@querykitjs/class-validator";

const ListBuyersDto = makeOffsetParamsDto({ allowedKeys: ["buyerName", "createdAt", "status"] });
type ListBuyersDto = InstanceType<typeof ListBuyersDto>;

@Post("list")
list(@Body() params: ListBuyersDto) {
  return this.buyersRepository.findList(params); // core-mos, `as` cast kerak emas
}
```

Yoki **subclass** varianti — qo'shimcha maydonlar qo'shmoqchi bo'lsangiz:

```ts
import { IsQueryFilter, OffsetParamsDto } from "@querykitjs/class-validator";
import type { Filter } from "@querykitjs/core";

class ListBuyersDto extends OffsetParamsDto {
  @IsOptional()
  @IsQueryFilter({ allowedKeys: ["buyerName", "createdAt", "status"] })
  declare filter?: Filter;
}
```

> `declare` muhim: usiz property deklaratsiyasi ota-klassdagi qiymatni soya qiladi.

Infinite/cursor uchun `makeInfiniteParamsDto` / `makeCursorParamsDto` (yoki `InfiniteParamsDto` / `CursorParamsDto`).

## ⚠️ `ValidationPipe` sozlamalari

Ikkala flag ham **zarur**, aks holda kafolatlar yarim ishlaydi:

| Flag              | Nega kerak                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `whitelist: true` | class-validator zod kabi avtomatik strip qilmaydi. Usiz `columns` / `with` / `withDeleted` client obyektida **qolib ketadi** va repository'ga tushadi. Bu flag dekoratorsiz propertylarni o'chiradi — zod'dagi avtomatik strip'ning ekvivalenti. |
| `transform: true` | `page`/`perPage`/`limit`/`offset` query string'dan kelganda string bo'ladi; `@Type(() => Number)` faqat transform yoqilganda ishlaydi.                                                                                                           |

## Nimani tekshiradi

- **Filter** — flat massiv (`{key, operation, value}[]`) yoki nested `and`/`or`/`not` daraxt.
- **Operatorlar** — core'ning to'liq to'plami: `= != > >= < <=`, `like/ilike/notLike`, `contains/startsWith/endsWith` (+ token `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Sort** — `{ key, direction }[]` (ko'p-maydon).
- **Paginatsiya** — offset (`page`/`perPage`), infinite (`limit`/`offset`), cursor (`limit`/`cursor`/`cursorKey`/`order`/`direction`).
- **Qiymat** — skalyar yoki skalyar massiv. Wire JSON bo'lgani uchun `Date` obyekti, `NaN` va `Infinity` **rad etiladi** (sana ISO string sifatida keladi).
- **Field allowlist** (`allowedKeys`) va **chuqurlik limiti** (`maxDepth`) — zod'da yo'q, quyiga qarang.
- Eski `type` maydoni **e'tiborsiz** qoldiriladi (rad etilmaydi) — migratsiya oson.

## Xavfsiz default

| Qatlam                             | Default xulq                                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perPage` / `limit`                | core `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (200) bilan cheklangan. `page` cheklanmagan — DoS yuzasi sahifa **o'lchami**, raqami emas.                                                                                           |
| `columns` / `with` / `withDeleted` | Hech qaysi DTO'da e'lon qilinmagan → `whitelist: true` ularni o'chiradi. Ochish faqat `allow` bilan.                                                                                                                                   |
| `allowedKeys`                      | Berilmasa (`undefined`) istalgan kalit o'tadi — allowlist **opt-in** (zod bilan parity). Berilsa, noma'lum kalit **rad etiladi**; `[]` esa hech biriga ruxsat bermaydi (hisoblab chiqarilgan bo'sh ro'yxat fail-open bo'lib qolmasin). |
| `maxDepth`                         | `5`. Cheklovsiz rekursiv daraxt DoS yuzasi.                                                                                                                                                                                            |

`allow` bilan ochsangiz, **repository darajasidagi ikkinchi qatlam**ni ham qo'ying: `forcedColumns` / `allowedColumns` ([drizzle-pg](../drizzle-pg/README.md) · [mongoose](../mongoose/README.md)).

## Opsiyalar

`makeOffsetParamsDto` / `makeInfiniteParamsDto` / `makeCursorParamsDto`:

| Opsiya        | Default                           | Ma'nosi                                                                             |
| ------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `allowedKeys` | —                                 | `filter` va `sort` uchun umumiy allowlist qisqartmasi                               |
| `filter`      | —                                 | `filter` uchun to'liq opsiyalar (quyiga qarang) — `allowedKeys` shorthand'dan ustun |
| `sort`        | —                                 | `sort` uchun `allowedKeys` / `messageStyle`                                         |
| `maxPerPage`  | core `DEFAULT_MAX_PER_PAGE` (200) | `perPage` yuqori chegarasi. `Infinity` — cap yo'q (⚠️ DoS)                          |
| `maxLimit`    | core `DEFAULT_MAX_LIMIT` (200)    | `limit` yuqori chegarasi                                                            |
| `allow`       | `[]`                              | `"columns"` / `"with"` / `"withDeleted"`ni ataylab ochish                           |

`@IsQueryFilter(options)` (va `options.filter`):

| Opsiya             | Default                   | Ma'nosi                                                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| `allowedKeys`      | —                         | Berilsa, noma'lum filter kaliti rad etiladi                                                |
| `allowedOperators` | barcha `FILTER_OPERATORS` | Ruxsat etilgan operatorlar to'plamini toraytirish                                          |
| `maxDepth`         | `5`                       | `and`/`or`/`not` chuqurlik limiti                                                          |
| `strictValue`      | `false`                   | `in`/`notIn` → massiv, `between`/`notBetween` → 2 qiymat, `isNull`/`isNotNull` → qiymatsiz |
| `messageStyle`     | `"text"`                  | `"key"` — xato o'rniga i18n kaliti qaytariladi                                             |
| `rootPath`         | property nomi             | Xato yo'lining ildizi (`filter[0].operation`)                                              |

`@IsQuerySort(options)` — `allowedKeys`, `messageStyle`, `rootPath`.

## i18n (bir nechta til)

Paket xabarni **kalit** bilan belgilaydi, shuning uchun tillar soni cheklanmagan. Har bir xato uchta narsani beradi: `key` (tarjima kaliti), `message` (tayyor matn) va `args` (interpolatsiya qiymatlari).

`messageStyle: "key"` bilan xato matni o'rniga kalit qaytadi va `nestjs-i18n` uni so'rov tiliga tarjima qiladi:

```ts
const ListBuyersDto = makeOffsetParamsDto({
  allowedKeys: ["buyerName"],
  filter: { messageStyle: "key" },
  sort: { messageStyle: "key" },
});

// main.ts
app.useGlobalPipes(new I18nValidationPipe({ transform: true, whitelist: true }));
```

Uchta katalog qutidan chiqadi — tarjima faylingizni noldan yozish shart emas:

```ts
import { QUERYKIT_LOCALES, QUERYKIT_MESSAGES_UZ, formatMessage } from "@querykitjs/class-validator";

QUERYKIT_LOCALES; // { en, uz, ru }
formatMessage("querykit.filter.unknown_key", { path: "filter[0]", key: "zzz" }, QUERYKIT_MESSAGES_UZ);
// → "filter[0]: `zzz` ruxsat etilgan filter kaliti emas"
```

O'z tilingizni qo'shish — `QueryKitMessageCatalog` tipiga amal qiling; kalit qo'shilsa TypeScript katalogingizni yangilashga majbur qiladi:

```ts
import type { QueryKitMessageCatalog } from "@querykitjs/class-validator";

const KK: QueryKitMessageCatalog = {
  "querykit.filter.unknown_key": "{path}: `{key}` рұқсат етілген кілт емес",
  // … qolgan kalitlar majburiy
};
```

## Nest'siz — sof yadro

`validateFilter` / `validateSort` hech qanday framework'ga bog'lanmagan; Express, Hono yoki oddiy funksiyada ishlaydi:

```ts
import { validateFilter, validateSort } from "@querykitjs/class-validator";

const issues = [...validateFilter(body.filter, { allowedKeys, strictValue: true }), ...validateSort(body.sort, { allowedKeys })];

if (issues.length > 0) {
  return res.status(400).json({ errors: issues }); // { path, key, message, args }
}
```

## `@querykitjs/zod` bilan farqlar

|                                | `@querykitjs/zod` | `@querykitjs/class-validator`                  |
| ------------------------------ | ----------------- | ---------------------------------------------- |
| Kontrakt, operatorlar          | core'dan          | **aynan o'sha**                                |
| Noma'lum maydonni strip qilish | avtomatik         | `ValidationPipe({ whitelist: true })` orqali   |
| Field allowlist                | yo'q              | `allowedKeys`                                  |
| Chuqurlik limiti               | yo'q              | `maxDepth` (default 5)                         |
| `NaN` / `Infinity`             | `Infinity` o'tadi | ikkalasi ham rad etiladi (JSON'da mavjud emas) |
| i18n                           | —                 | `querykit.*` kalitlari + en/uz/ru kataloglar   |

## Litsenziya

MIT © [Suhrobbek Soatov](https://soatov.uz)
