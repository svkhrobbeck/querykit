/**
 * Static param DTOs (deprecated) — `class ListUsersDto extends OffsetParamsDto`.
 * Kept in their own module: their decorators register class-validator metadata
 * when the module loads, so a bundle that does not import them drops the whole module.
 * New code uses the `make*ParamsDto` factories (`./dto`).
 */
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min, IsBoolean } from "class-validator";
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE } from "@querykitjs/core";
import type { Filter, Sort, SortDirection } from "@querykitjs/core";
import { IsQueryFilter, IsQuerySort, IsWithinMaxOffset } from "./decorators";

/**
 * Paginatsiyasiz umumiy params — `filter` + `sort`.
 *
 * @deprecated Use `makeOffsetParamsDto` / `makeInfiniteParamsDto` / `makeCursorParamsDto` (safe defaults). Removed in the next major.
 */
export class BaseParamsDto {
  @IsOptional()
  @IsQueryFilter()
  filter?: Filter;

  @IsOptional()
  @IsQuerySort()
  sort?: Sort;
}

/**
 * Offset (sahifali) params — `page` + `perPage` (`perPage` ≤ core cap).
 *
 * @deprecated Use `makeOffsetParamsDto` (safe defaults). Removed in the next major.
 */
export class OffsetParamsDto extends BaseParamsDto {
  /* `page`ning o'zida cap yo'q — chegara `(page - 1) × perPage` ≤ `DEFAULT_MAX_OFFSET`
   * (`@querykitjs/zod` factory'lari ham aynan shunday). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsWithinMaxOffset({ mode: "page" })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(DEFAULT_MAX_PER_PAGE)
  perPage?: number;

  /** `false` — no count; the meta totals are `null`. */
  @IsOptional()
  @IsBoolean()
  withTotal?: boolean;
}

/**
 * Infinite-scroll params — `limit` + `offset`.
 *
 * @deprecated Use `makeInfiniteParamsDto` (safe defaults). Removed in the next major.
 */
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
  @IsWithinMaxOffset({ mode: "offset" })
  offset?: number;
}

/**
 * Cursor (keyset) params. `sort` **yo'q**: tartib `order` + `direction` bilan
 * boshqariladi. Shu sababli `BaseParamsDto`dan meros olinmaydi — aks holda
 * `sort` kontraktga qarshi ravishda meros bo'lib qolardi.
 *
 * @deprecated Use `makeCursorParamsDto` (safe defaults). Removed in the next major.
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
