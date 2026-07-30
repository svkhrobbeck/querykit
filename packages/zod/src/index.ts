/**
 * `@querykitjs/zod` — querykit so'rov kontraktini (filter/sort/pagination)
 * tekshiruvchi zod schema'lar. Operatorlar `@querykitjs/core`ning `FILTER_OPERATORS`
 * manbasidan olinadi; schema'lar `z.infer` chiqishi core tiplariga **mos**
 * (assignable) — validatsiyalangan payload'ni to'g'ridan-to'g'ri repo'ga uzatasiz.
 *
 * Backend (Hono, Express, …) so'rov body'sini shu bilan validatsiya qiladi.
 */
import { z } from "zod";
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, FILTER_OPERATORS } from "@querykitjs/core";
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

/* ------------------------------- factories -------------------------------- */
/* Sozlanadigan schema quruvchilar — **xavfsiz default** bilan. Yuqoridagi
 * konstantalar legacy-parity uchun o'z holida qoladi (cap yo'q, uch maydon ochiq);
 * yangi kod shu factory'lardan foydalanadi. */

/** Server'ga tegishli, default'da clientdan **qabul qilinmaydigan** maydonlar. */
export type ServerOwnedField = "columns" | "with" | "withDeleted";

const serverOwnedShape = {
  /** Client `{ password: true }` so'ramasin — projection server ishi. */
  columns: z.record(z.string(), z.boolean()).optional(),
  /** Client istalgan relation'ni tortmasin — data exposure. */
  with: z.record(z.string(), z.unknown()).optional(),
  /** Client soft-delete himoyasini o'chirmasin. */
  withDeleted: z.boolean().optional(),
};

type ServerOwnedShape = typeof serverOwnedShape;

/** Factory'lar uchun opsiyalar. */
export interface ParamsSchemaOptions<TAllow extends readonly ServerOwnedField[] = []> {
  /**
   * `perPage` yuqori chegarasi. Default — core `DEFAULT_MAX_PER_PAGE` (200).
   * Cap'ni butunlay o'chirish: `Infinity` (⚠️ DoS yuzasi).
   */
  maxPerPage?: number;
  /** `limit` yuqori chegarasi. Default — core `DEFAULT_MAX_LIMIT` (200). */
  maxLimit?: number;
  /**
   * Server-owned maydonlarni **ataylab** ochish. Default — bo'sh: `columns`,
   * `with` va `withDeleted` schema'ga umuman kirmaydi va client yuborsa
   * jimgina strip qilinadi. Repository darajasidagi ikkinchi himoya qatlami —
   * `forcedColumns`/`allowedColumns` (backend adapterlarida).
   */
  allow?: TAllow;
}

const pickServerOwned = <TAllow extends readonly ServerOwnedField[]>(allow?: TAllow) => {
  const picked: Record<string, z.ZodTypeAny> = {};
  for (const key of allow ?? []) picked[key] = serverOwnedShape[key];
  return picked as Pick<ServerOwnedShape, TAllow[number]>;
};

/* Uch factory bir xil `filter`/`sort` maydonlarini ulashadi — takrorlanmasin. */
const filterField = filterSchema.optional();
const sortField = sortSchema.optional();

const positive = (max: number) => z.number().int().positive().max(max).optional();

/**
 * Offset (sahifali) params schema — `perPage` cap'i bilan va server-owned
 * maydonlarsiz.
 *
 * @example
 * ```ts
 * const listSchema = makeOffsetParamsSchema({ maxPerPage: 100 });
 * type ListParams = z.infer<typeof listSchema>;
 * // `withDeleted`ni ataylab ochish:
 * const adminSchema = makeOffsetParamsSchema({ allow: ["withDeleted"] });
 * ```
 */
export function makeOffsetParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(options: ParamsSchemaOptions<TAllow> = {}) {
  return z.object({
    filter: filterField,
    sort: sortField,
    ...pickServerOwned(options.allow),
    page: z.number().int().positive().optional(),
    perPage: positive(options.maxPerPage ?? DEFAULT_MAX_PER_PAGE),
  });
}

/** Infinite-scroll params schema — `limit` cap'i bilan. Qarang: {@link makeOffsetParamsSchema}. */
export function makeInfiniteParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(options: ParamsSchemaOptions<TAllow> = {}) {
  return z.object({
    filter: filterField,
    sort: sortField,
    ...pickServerOwned(options.allow),
    limit: positive(options.maxLimit ?? DEFAULT_MAX_LIMIT),
    offset: z.number().int().nonnegative().optional(),
  });
}

/**
 * Cursor (keyset) params schema — `limit` cap'i bilan. `sort` yo'q: tartib
 * `order` + `direction` bilan boshqariladi.
 */
export function makeCursorParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(options: ParamsSchemaOptions<TAllow> = {}) {
  return z.object({
    filter: filterField,
    ...pickServerOwned(options.allow),
    limit: positive(options.maxLimit ?? DEFAULT_MAX_LIMIT),
    cursor: z.string().nullish(),
    cursorKey: z.string().optional(),
    order: directionSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  });
}

/* ------------------------------ inferred types ---------------------------- */

export type FilterInput = z.infer<typeof filterSchema>;
export type FieldConditionInput = z.infer<typeof fieldConditionSchema>;
export type BaseParams = z.infer<typeof baseParamsSchema>;
export type OffsetParams = z.infer<typeof offsetParamsSchema>;
export type InfiniteParams = z.infer<typeof infiniteParamsSchema>;
export type CursorParams = z.infer<typeof cursorParamsSchema>;

/* Factory chiqishlari. `ReturnType<typeof makeOffsetParamsSchema>` ishlatib
 * bo'lmaydi — `const` tip parametrli generic funksiyada u `any` beradi; shuning
 * uchun instantiatsiya aniq yoziladi. */

export type OffsetParamsSchema<TAllow extends readonly ServerOwnedField[] = []> = ReturnType<typeof makeOffsetParamsSchema<TAllow>>;
export type InfiniteParamsSchema<TAllow extends readonly ServerOwnedField[] = []> = ReturnType<typeof makeInfiniteParamsSchema<TAllow>>;
export type CursorParamsSchema<TAllow extends readonly ServerOwnedField[] = []> = ReturnType<typeof makeCursorParamsSchema<TAllow>>;

/** `makeOffsetParamsSchema(...)` chiqishining tipi. */
export type MadeOffsetParams<TAllow extends readonly ServerOwnedField[] = []> = z.infer<OffsetParamsSchema<TAllow>>;
export type MadeInfiniteParams<TAllow extends readonly ServerOwnedField[] = []> = z.infer<InfiniteParamsSchema<TAllow>>;
export type MadeCursorParams<TAllow extends readonly ServerOwnedField[] = []> = z.infer<CursorParamsSchema<TAllow>>;

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

/* Factory chiqishi ham xuddi shu wire shakllariga mos — `allow` bilan ham, usiz ham. */
type _FactoryOffset = Expect<MadeOffsetParams extends WireOffsetParams ? true : false>;
type _FactoryInfinite = Expect<MadeInfiniteParams extends WireInfiniteParams ? true : false>;
type _FactoryCursor = Expect<MadeCursorParams extends WireCursorParams ? true : false>;
type _FactoryOffsetAllowAll = Expect<MadeOffsetParams<["columns", "with", "withDeleted"]> extends WireOffsetParams ? true : false>;

/* `allow` bergan schema'da server-owned maydonlar tip darajasida ham paydo bo'ladi
 * (ya'ni `allow` faqat runtime hodisa emas — TS ham biladi)… */
type _AllowTyped = Expect<MadeOffsetParams<["withDeleted"]> extends { withDeleted?: boolean } ? true : false>;
/* …va bermagan schema'da yo'q — bu P1-4 ning tip darajasidagi kafolati. */
type _DefaultDropsWithDeleted = Expect<"withDeleted" extends keyof MadeOffsetParams ? false : true>;
type _DefaultDropsColumns = Expect<"columns" extends keyof MadeOffsetParams ? false : true>;
type _DefaultDropsWith = Expect<"with" extends keyof MadeOffsetParams ? false : true>;
type _AllowColumnsTyped = Expect<"columns" extends keyof MadeOffsetParams<["columns"]> ? true : false>;
