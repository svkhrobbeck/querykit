/**
 * `@querykitjs/zod` — querykit so'rov kontraktini (filter/sort/pagination)
 * tekshiruvchi zod schema'lar. Operatorlar `@querykitjs/core`ning `FILTER_OPERATORS`
 * manbasidan olinadi; schema'lar `z.infer` chiqishi core tiplariga **mos**
 * (assignable) — validatsiyalangan payload'ni to'g'ridan-to'g'ri repo'ga uzatasiz.
 *
 * Backend (Hono, Express, …) so'rov body'sini shu bilan validatsiya qiladi.
 */
import { z } from "zod";
import { FILTER_OPERATORS } from "@querykitjs/core";
import type { FieldCondition, Filter, FilterNode, FilterOperator, FilterValue, WireCursorParams, WireInfiniteParams, WireOffsetParams } from "@querykitjs/core";

/* --------------------------------- filter --------------------------------- */

/** Operator enum — core `FILTER_OPERATORS` dan (yagona manba). */
export const filterOperatorSchema = z.enum(FILTER_OPERATORS);

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Filter qiymati — skalyar yoki skalyar massiv (wire'da `Date` bo'lmaydi). */
export const filterValueSchema = z.union([scalarSchema, z.array(scalarSchema)]);

/** Bitta maydon sharti `{ key, operation?, value? }`. Noma'lum kalitlar (eski `type`) e'tiborsiz. */
export const fieldConditionSchema = z.object({
  key: z.string(),
  operation: filterOperatorSchema.optional(),
  value: filterValueSchema.optional(),
});

/** Nested filter tuguni: shart yoki `and`/`or`/`not` guruh (rekursiv). */
export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    fieldConditionSchema,
    z.object({ and: z.array(filterNodeSchema) }),
    z.object({ or: z.array(filterNodeSchema) }),
    z.object({ not: filterNodeSchema }),
  ]),
);

/** Public filter — daraxt/tugun yoki flat massiv (implicit AND). */
export const filterSchema = z.union([filterNodeSchema, z.array(fieldConditionSchema)]);

/* ---------------------------------- sort ---------------------------------- */

const directionSchema = z.enum(["asc", "desc"]);

/** Sort — an array of `{ key, direction }`. */
export const sortSchema = z.array(z.object({ key: z.string(), direction: directionSchema.optional() }));

/* -------------------------------- params ---------------------------------- */

/** Umumiy params (paginatsiyasiz): filter/sort/columns/with/withDeleted. */
export const baseParamsSchema = z.object({
  filter: filterSchema.optional(),
  sort: sortSchema.optional(),
  columns: z.record(z.string(), z.boolean()).optional(),
  with: z.record(z.string(), z.unknown()).optional(),
  withDeleted: z.boolean().optional(),
});

/** Offset (sahifali) params — `page` + `perPage`. */
export const offsetParamsSchema = baseParamsSchema.extend({
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
});

/** Infinite-scroll params — `limit` + `offset`. */
export const infiniteParamsSchema = baseParamsSchema.extend({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
});

/**
 * Cursor (keyset) params — `limit`/`cursor`/`cursorKey`/`order`/`direction`.
 * No `sort`: cursor pagination is driven by `order` + `direction`, not `sort`.
 */
export const cursorParamsSchema = baseParamsSchema.omit({ sort: true }).extend({
  limit: z.number().int().positive().optional(),
  cursor: z.string().nullish(),
  cursorKey: z.string().optional(),
  order: directionSchema.optional(),
  direction: z.enum(["forward", "backward"]).optional(),
});

/* ------------------------------ inferred types ---------------------------- */

export type FilterInput = z.infer<typeof filterSchema>;
export type FieldConditionInput = z.infer<typeof fieldConditionSchema>;
export type BaseParams = z.infer<typeof baseParamsSchema>;
export type OffsetParams = z.infer<typeof offsetParamsSchema>;
export type InfiniteParams = z.infer<typeof infiniteParamsSchema>;
export type CursorParams = z.infer<typeof cursorParamsSchema>;

/* ---------------------- compile-time core alignment ----------------------- */
/* Schema chiqishi core tiplariga assignable ekanini typecheck darajasida qat'iy tekshiradi. */

type Expect<T extends true> = T;
type _Op = Expect<z.infer<typeof filterOperatorSchema> extends FilterOperator ? true : false>;
type _Val = Expect<z.infer<typeof filterValueSchema> extends FilterValue ? true : false>;
type _Cond = Expect<FieldConditionInput extends FieldCondition ? true : false>;
type _Filter = Expect<FilterInput extends Filter ? true : false>;

/* Schema chiqishi core'ning **wire** param shakllariga mos — backend adapterlari
 * shu shakllarni qabul qiladi, ya'ni route'da `as` cast kerak emas. Halqa core
 * orqali yopiladi: zod backendni ko'rmaydi, backend zod'ni ko'rmaydi. */
type _WireOffset = Expect<OffsetParams extends WireOffsetParams ? true : false>;
type _WireInfinite = Expect<InfiniteParams extends WireInfiniteParams ? true : false>;
type _WireCursor = Expect<CursorParams extends WireCursorParams ? true : false>;
