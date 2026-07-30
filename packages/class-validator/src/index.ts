/**
 * `@querykitjs/class-validator` — querykit so'rov kontraktini (filter/sort/
 * pagination) tekshiruvchi **class-validator** dekoratorlari va DTO'lari.
 * Operatorlar `@querykitjs/core`ning `FILTER_OPERATORS` manbasidan olinadi;
 * DTO chiqishi core'ning wire tiplariga **mos** (assignable) — validatsiyalangan
 * payload'ni to'g'ridan-to'g'ri querykit repository'siga uzatasiz.
 *
 * NestJS (`ValidationPipe`, `I18nValidationPipe`) uchun mo'ljallangan, lekin
 * yadro (`validateFilter` / `validateSort`) framework-agnostik — Express, Hono
 * yoki oddiy funksiyadan ham chaqiriladi.
 */

/* ------------------------------- messages --------------------------------- */
export { formatMessage, localizeIssue } from "./messages";
export type { MessageArgs } from "./messages";

export { QUERYKIT_LOCALES, QUERYKIT_MESSAGES_EN, QUERYKIT_MESSAGES_RU, QUERYKIT_MESSAGES_UZ } from "./locales";
export type { QueryKitLocale, QueryKitMessageCatalog, QueryKitMessageKey } from "./locales";

/* --------------------------------- core ----------------------------------- */
export { DEFAULT_MAX_FILTER_DEPTH, validateFilter, validateSort } from "./validate";
export type { QueryFilterOptions, QuerySortOptions, ValidationIssue } from "./validate";

/* ------------------------------- decorators ------------------------------- */
export { IsQueryFilter, IsQueryFilterConstraint, IsQuerySort, IsQuerySortConstraint } from "./decorators";
export type { IsQueryFilterOptions, IsQuerySortOptions, MessageStyleOptions } from "./decorators";

/* ---------------------------------- DTOs ---------------------------------- */
export { BaseParamsDto, CursorParamsDto, InfiniteParamsDto, OffsetParamsDto } from "./dto";
export { makeCursorParamsDto, makeInfiniteParamsDto, makeOffsetParamsDto } from "./dto";
export type { ParamsDtoOptions, ServerOwnedField, ServerOwnedParams } from "./dto";

/* ---------------------- compile-time core alignment ----------------------- */
/* DTO va yadro chiqishi core kontraktiga mosligini typecheck darajasida qat'iy
 * tekshiradi — core tiplari o'zgarsa shu yerda yorilib beradi, runtime'da emas.
 * Eslint `varsIgnorePattern: "^_"` bilan sozlangani uchun bu tiplar ogohlantirmaydi
 * (`@querykitjs/zod`da ham xuddi shu uslub). */

import type { FieldCondition, Filter, FilterOperator, Sort, WireCursorParams, WireInfiniteParams, WireOffsetParams } from "@querykitjs/core";
import type { QueryFilterOptions } from "./validate";
import { BaseParamsDto, CursorParamsDto, InfiniteParamsDto, OffsetParamsDto, makeCursorParamsDto, makeInfiniteParamsDto, makeOffsetParamsDto } from "./dto";

type Expect<T extends true> = T;

/* Static DTO'lar core wire shakllariga assignable — route'da `as` cast kerak emas. */
type _WireOffset = Expect<OffsetParamsDto extends WireOffsetParams ? true : false>;
type _WireInfinite = Expect<InfiniteParamsDto extends WireInfiniteParams ? true : false>;
type _WireCursor = Expect<CursorParamsDto extends WireCursorParams ? true : false>;

/* Factory chiqishi ham xuddi shunday — `allow` bilan ochilgan maydonlar bilan birga. */
type _FactoryOffset = Expect<InstanceType<ReturnType<typeof makeOffsetParamsDto>> extends WireOffsetParams ? true : false>;
type _FactoryInfinite = Expect<InstanceType<ReturnType<typeof makeInfiniteParamsDto>> extends WireInfiniteParams ? true : false>;
type _FactoryCursor = Expect<InstanceType<ReturnType<typeof makeCursorParamsDto>> extends WireCursorParams ? true : false>;

/* DTO maydonlari core tiplarining aynan o'zi — narrowing yoki divergensiya yo'q. */
type _FilterField = Expect<NonNullable<BaseParamsDto["filter"]> extends Filter ? true : false>;
type _FilterAccepts = Expect<Filter extends NonNullable<BaseParamsDto["filter"]> ? true : false>;
type _SortField = Expect<NonNullable<BaseParamsDto["sort"]> extends Sort ? true : false>;
type _CondArray = Expect<FieldCondition[] extends NonNullable<BaseParamsDto["filter"]> ? true : false>;

/* `allowedOperators` core operator to'plamidan chiqadi (yagona manba). */
type _Ops = Expect<NonNullable<QueryFilterOptions["allowedOperators"]>[number] extends FilterOperator ? true : false>;

/* Cursor DTO'sida `sort` YO'Q — zod `cursorParamsSchema.omit({ sort: true })` bilan parity. */
type _CursorHasNoSort = Expect<"sort" extends keyof CursorParamsDto ? false : true>;
