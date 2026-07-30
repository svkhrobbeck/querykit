/**
 * Param DTO'lari — uchala paginatsiya uchun (offset / infinite / cursor).
 *
 * Ikki yo'l bilan ishlatiladi (ikkalasi ham bitta `validateFilter` yadrosiga
 * tayanadi):
 *
 * 1. **Subclass** — `class ListUsersDto extends OffsetParamsDto` va kerak bo'lsa
 *    `filter`ni `@IsQueryFilter({ allowedKeys })` bilan qayta e'lon qilish;
 * 2. **Factory** — `makeOffsetParamsDto({ allowedKeys })`, boilerplatesiz.
 *
 * **Xavfsiz default:** `columns` / `with` / `withDeleted` hech qaysi DTO'da
 * e'lon qilinmagan, ya'ni `ValidationPipe({ whitelist: true })` ularni o'chiradi;
 * `perPage` / `limit` esa core'ning `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT`
 * chegarasi bilan cheklangan. Ochish faqat factory'ning `allow` opsiyasi orqali.
 */
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, Max, Min } from "class-validator";
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE } from "@querykitjs/core";
import type { Filter, Sort, SortDirection } from "@querykitjs/core";
import { IsQueryFilter, IsQuerySort, type IsQueryFilterOptions, type IsQuerySortOptions } from "./decorators";

/* ------------------------------ static DTOs ------------------------------- */

/** Paginatsiyasiz umumiy params — `filter` + `sort`. */
export class BaseParamsDto {
  @IsOptional()
  @IsQueryFilter()
  filter?: Filter;

  @IsOptional()
  @IsQuerySort()
  sort?: Sort;
}

/** Offset (sahifali) params — `page` + `perPage` (`perPage` ≤ core cap). */
export class OffsetParamsDto extends BaseParamsDto {
  /* `page`da cap yo'q — sahifa raqami emas, sahifa **o'lchami** DoS yuzasi
   * (`@querykitjs/zod` factory'lari ham aynan shunday). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(DEFAULT_MAX_PER_PAGE)
  perPage?: number;
}

/** Infinite-scroll params — `limit` + `offset`. */
export class InfiniteParamsDto extends BaseParamsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(DEFAULT_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Cursor (keyset) params. `sort` **yo'q**: tartib `order` + `direction` bilan
 * boshqariladi. Shu sababli `BaseParamsDto`dan meros olinmaydi — aks holda
 * `sort` kontraktga qarshi ravishda meros bo'lib qolardi.
 */
export class CursorParamsDto {
  @IsOptional()
  @IsQueryFilter()
  filter?: Filter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(DEFAULT_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @IsString()
  cursorKey?: string;

  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: SortDirection;

  @IsOptional()
  @IsIn(["forward", "backward"])
  direction?: "forward" | "backward";
}

/* -------------------------------- factories ------------------------------- */

/** Server'ga tegishli, default'da clientdan qabul qilinmaydigan maydonlar. */
export type ServerOwnedField = "columns" | "with" | "withDeleted";

/** `allow` bilan ochiladigan maydonlarning shakli. */
export interface ServerOwnedParams {
  columns?: Record<string, boolean>;
  with?: Record<string, unknown>;
  withDeleted?: boolean;
}

export interface ParamsDtoOptions {
  /** `filter` uchun to'liq opsiyalar — `allowedKeys`, `allowedOperators`, `maxDepth`, `strictValue`, `messageStyle`. */
  filter?: IsQueryFilterOptions;
  /** `sort` uchun opsiyalar — `allowedKeys`, `messageStyle`. */
  sort?: IsQuerySortOptions;
  /**
   * `filter` va `sort` uchun umumiy allowlist qisqartmasi — odatda ikkalasi bir xil.
   * Aniq berilgan `filter.allowedKeys` / `sort.allowedKeys` bundan **ustun**.
   */
  allowedKeys?: readonly string[];
  /** `perPage` yuqori chegarasi. Default — core `DEFAULT_MAX_PER_PAGE` (200). `Infinity` — cap yo'q (⚠️ DoS). */
  maxPerPage?: number;
  /** `limit` yuqori chegarasi. Default — core `DEFAULT_MAX_LIMIT` (200). */
  maxLimit?: number;
  /** Server-owned maydonlarni **ataylab** ochish. Default — bo'sh. */
  allow?: readonly ServerOwnedField[];
}

/* Dinamik klasslar static klasslardan meros OLMAYDI: meros bo'lsa ota-klassning
 * default `@IsQueryFilter()` dekoratori ham qo'shilib, filter ikki marta —
 * bir marta opsiyalar bilan, bir marta ularsiz — tekshirilardi. Shuningdek
 * static klasslar prototipiga hech qachon imperativ dekorator qo'yilmaydi:
 * u global ifloslanish bo'lardi. */

const applyNumber = (proto: object, property: string, bounds: { positive?: boolean; min?: number; max?: number }): void => {
  IsOptional()(proto, property);
  Type(() => Number)(proto, property);
  IsInt()(proto, property);
  if (bounds.positive) IsPositive()(proto, property);
  if (bounds.min !== undefined) Min(bounds.min)(proto, property);
  /* `Infinity` cap'ni butunlay o'chiradi — cheksiz `@Max` konstrainti qo'yishdan
   * ko'ra uni umuman qo'ymagan ma'qul (xato xabari ham chalg'itmaydi). */
  if (bounds.max !== undefined && Number.isFinite(bounds.max)) Max(bounds.max)(proto, property);
};

const applyServerOwned = (proto: object, field: ServerOwnedField): void => {
  IsOptional()(proto, field);
  if (field === "withDeleted") IsBoolean()(proto, field);
  else IsObject()(proto, field);
};

const applyFilterAndSort = (proto: object, options: ParamsDtoOptions, withSort: boolean): void => {
  IsOptional()(proto, "filter");
  IsQueryFilter({ ...options.filter, allowedKeys: options.filter?.allowedKeys ?? options.allowedKeys })(proto, "filter");

  if (withSort) {
    IsOptional()(proto, "sort");
    IsQuerySort({ ...options.sort, allowedKeys: options.sort?.allowedKeys ?? options.allowedKeys })(proto, "sort");
  }

  for (const field of options.allow ?? []) applyServerOwned(proto, field);
};

/** Nest xato loglarida `class_1` emas, tushunarli nom chiqsin. */
const nameClass = <T extends abstract new (...args: never[]) => unknown>(cls: T, name: string): T => {
  Object.defineProperty(cls, "name", { value: name, configurable: true });
  return cls;
};

/**
 * Offset (sahifali) params DTO'si — `allowedKeys` va cap'lar bilan.
 *
 * @example
 * ```ts
 * const ListBuyersDto = makeOffsetParamsDto({ allowedKeys: ["buyerName", "createdAt"] });
 * type ListBuyersDto = InstanceType<typeof ListBuyersDto>;
 *
 * @Post("list")
 * list(@Body() params: ListBuyersDto) {
 *   return this.buyersRepository.findList(params);
 * }
 * ```
 */
export function makeOffsetParamsDto(options: ParamsDtoOptions = {}) {
  class OffsetParams implements ServerOwnedParams {
    filter?: Filter;
    sort?: Sort;
    page?: number;
    perPage?: number;
    columns?: Record<string, boolean>;
    with?: Record<string, unknown>;
    withDeleted?: boolean;
  }

  applyFilterAndSort(OffsetParams.prototype, options, true);
  applyNumber(OffsetParams.prototype, "page", { positive: true });
  applyNumber(OffsetParams.prototype, "perPage", { positive: true, max: options.maxPerPage ?? DEFAULT_MAX_PER_PAGE });

  return nameClass(OffsetParams, "OffsetParamsDto");
}

/** Infinite-scroll params DTO'si. Qarang: {@link makeOffsetParamsDto}. */
export function makeInfiniteParamsDto(options: ParamsDtoOptions = {}) {
  class InfiniteParams implements ServerOwnedParams {
    filter?: Filter;
    sort?: Sort;
    limit?: number;
    offset?: number;
    columns?: Record<string, boolean>;
    with?: Record<string, unknown>;
    withDeleted?: boolean;
  }

  applyFilterAndSort(InfiniteParams.prototype, options, true);
  applyNumber(InfiniteParams.prototype, "limit", { positive: true, max: options.maxLimit ?? DEFAULT_MAX_LIMIT });
  applyNumber(InfiniteParams.prototype, "offset", { min: 0 });

  return nameClass(InfiniteParams, "InfiniteParamsDto");
}

/** Cursor (keyset) params DTO'si — `sort` yo'q. Qarang: {@link makeOffsetParamsDto}. */
export function makeCursorParamsDto(options: ParamsDtoOptions = {}) {
  class CursorParams implements ServerOwnedParams {
    filter?: Filter;
    limit?: number;
    cursor?: string | null;
    cursorKey?: string;
    order?: SortDirection;
    direction?: "forward" | "backward";
    columns?: Record<string, boolean>;
    with?: Record<string, unknown>;
    withDeleted?: boolean;
  }

  const proto = CursorParams.prototype;
  applyFilterAndSort(proto, options, false);
  applyNumber(proto, "limit", { positive: true, max: options.maxLimit ?? DEFAULT_MAX_LIMIT });

  IsOptional()(proto, "cursor");
  IsString()(proto, "cursor");
  IsOptional()(proto, "cursorKey");
  IsString()(proto, "cursorKey");
  IsOptional()(proto, "order");
  IsIn(["asc", "desc"])(proto, "order");
  IsOptional()(proto, "direction");
  IsIn(["forward", "backward"])(proto, "direction");

  return nameClass(CursorParams, "CursorParamsDto");
}
