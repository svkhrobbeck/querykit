import type { AnyPgTable } from "drizzle-orm/pg-core";
import type * as Core from "@querykitjs/core";

import type { LooseColumnKey } from "./common";
import type { CursorParams, InfiniteParams, OffsetParams } from "./pagination";

export * from "./common";
export * from "./pagination";
export * from "./repository";
export * from "./registry";

/* ---------------------- compile-time wire alignment ----------------------- */
/* Validatsiyalangan (string-keyed) payload repository params'ga assignable —
 * ya'ni route'da `as OffsetParams<typeof table>` cast'i kerak emas. Halqa core
 * orqali yopiladi: `@querykitjs/zod` chiqishi shu wire shakllariga mos ekanini
 * o'sha paketda tekshiradi, bu yerda esa ularning repo'ga tushishi tekshiriladi.
 * `test/` typecheck qilinmaydi (`include: ["src"]`), shuning uchun `src` ichida. */

type Expect<T extends true> = T;
type _WireOffset = Expect<Core.WireOffsetParams extends OffsetParams<AnyPgTable> ? true : false>;
type _WireInfinite = Expect<Core.WireInfiniteParams extends InfiniteParams<AnyPgTable> ? true : false>;
type _WireCursor = Expect<Core.WireCursorParams extends CursorParams<AnyPgTable> ? true : false>;
/* Loose kalitlar autocomplete'ni yo'qotmaydi: haqiqiy ustun nomi hali ham tip a'zosi. */
type _KeepsAutocomplete = Expect<"id" extends LooseColumnKey<AnyPgTable> ? true : false>;
