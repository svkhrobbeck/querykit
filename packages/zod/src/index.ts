/**
 * `@querykitjs/zod` — querykit so'rov kontraktini (filter/sort/pagination)
 * tekshiruvchi zod schema'lar. Operatorlar `@querykitjs/core`ning `FILTER_OPERATORS`
 * manbasidan olinadi; schema'lar `z.infer` chiqishi core tiplariga **mos**
 * (assignable) — validatsiyalangan payload'ni to'g'ridan-to'g'ri repo'ga uzatasiz.
 *
 * Backend (Hono, Express, …) so'rov body'sini shu bilan validatsiya qiladi.
 */
import { z } from "zod";
import { DEFAULT_MAX_LIMIT, DEFAULT_MAX_PER_PAGE, DEFAULT_QUERY_LIMITS, FILTER_OPERATORS, resolveLimits } from "@querykitjs/core";
import type {
  FieldCondition,
  Filter,
  FilterNode,
  FilterOperator,
  FilterValue,
  QueryLimits,
  WireCursorParams,
  WireInfiniteParams,
  WireOffsetParams,
} from "@querykitjs/core";
import { findFilterLimitViolation, formatLimit, offsetOf } from "@querykitjs/core/internal";

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

/**
 * Nested filter tuguni: shart yoki `and`/`or`/`not` guruh (rekursiv).
 * ⚠️ O'zi **limitsiz** — so'rov body'si uchun {@link filterSchema} yoki factory'lardan
 * foydalaning: ular daraxtni shu sxemaga berishdan oldin hajm limitlarini tekshiradi.
 */
export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([
    fieldConditionSchema,
    z.object({ and: z.array(filterNodeSchema) }),
    z.object({ or: z.array(filterNodeSchema) }),
    z.object({ not: filterNodeSchema }),
  ]),
);

const filterShapeSchema = z.union([filterNodeSchema, z.array(fieldConditionSchema)]);

/**
 * Hajm limitlari (chuqurlik, shartlar, massiv elementlari, satr uzunligi) xom
 * payload'da, iterativ, **`z.lazy` daraxtidan oldin** tekshiriladi: limitdan oshgan
 * payload rekursiv sxemaga yetib bormaydi, ya'ni 10 000 darajali `not` zanjiri stekni
 * to'ldirmaydi.
 */
const limitedFilterSchema = (limits: QueryLimits) =>
  z
    .unknown()
    .superRefine((value, ctx) => {
      const violation = findFilterLimitViolation(value, limits);
      if (violation) ctx.addIssue({ code: "custom", path: violation.path, message: `filter exceeds ${formatLimit(violation.limit, violation.max)}` });
    })
    .pipe(filterShapeSchema);

/** Public filter — daraxt/tugun yoki flat massiv (implicit AND), core default limitlari bilan. */
export const filterSchema = limitedFilterSchema(DEFAULT_QUERY_LIMITS);

/* ---------------------------------- sort ---------------------------------- */

const directionSchema = z.enum(["asc", "desc"]);

const sortItemSchema = z.object({ key: z.string(), direction: directionSchema.optional() });

const limitedSortSchema = (maxSortFields: number) => z.array(sortItemSchema).max(maxSortFields, `sort exceeds ${formatLimit("maxSortFields", maxSortFields)}`);

/** Sort — an array of `{ key, direction }`, at most core `DEFAULT_MAX_SORT_FIELDS` (3) items. */
export const sortSchema = limitedSortSchema(DEFAULT_QUERY_LIMITS.maxSortFields);

/* ------------------------------ offset depth ------------------------------ */

/** `(page - 1) × perPage` ≤ `maxOffset`; `perPage` yo'q bo'lsa core `DEFAULT_PER_PAGE` (20). */
const offsetDepthCheck =
  (maxOffset: number) =>
  (params: { page?: unknown; perPage?: unknown }, ctx: z.RefinementCtx): void => {
    /* The factories' output type is generic over `allow`; field errors are reported by the fields themselves. */
    const page = typeof params.page === "number" ? params.page : undefined;
    const perPage = typeof params.perPage === "number" ? params.perPage : undefined;
    if (offsetOf(page, perPage) <= maxOffset) return;
    ctx.addIssue({
      code: "custom",
      path: ["page"],
      message: `(page - 1) × perPage exceeds ${formatLimit("maxOffset", maxOffset)}; use cursor pagination for deeper pages`,
    });
  };

const offsetField = (maxOffset: number) =>
  z
    .number()
    .int()
    .nonnegative()
    .max(maxOffset, `offset exceeds ${formatLimit("maxOffset", maxOffset)}`)
    .optional();

/* -------------------------------- params ---------------------------------- */

/**
 * Umumiy params (paginatsiyasiz): filter/sort/columns/with/withDeleted.
 *
 * @deprecated Use `makeOffsetParamsSchema` / `makeInfiniteParamsSchema` / `makeCursorParamsSchema` (safe defaults, task 014 P3). Removed in the next major.
 */
export const baseParamsSchema = z.object({
  filter: filterSchema.optional(),
  sort: sortSchema.optional(),
  columns: z.record(z.string(), z.boolean()).optional(),
  with: z.record(z.string(), z.unknown()).optional(),
  withDeleted: z.boolean().optional(),
});

/**
 * Offset (sahifali) params — `page` + `perPage`; `(page - 1) × perPage` ≤ `DEFAULT_MAX_OFFSET`.
 *
 * @deprecated Use `makeOffsetParamsSchema` (safe defaults, task 014 P3). Removed in the next major.
 */
export const offsetParamsSchema = baseParamsSchema
  .extend({
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional(),
  })
  .superRefine(offsetDepthCheck(DEFAULT_QUERY_LIMITS.maxOffset));

/**
 * Infinite-scroll params — `limit` + `offset` (`offset` ≤ `DEFAULT_MAX_OFFSET`).
 *
 * @deprecated Use `makeInfiniteParamsSchema` (safe defaults, task 014 P3). Removed in the next major.
 */
export const infiniteParamsSchema = baseParamsSchema.extend({
  limit: z.number().int().positive().optional(),
  offset: offsetField(DEFAULT_QUERY_LIMITS.maxOffset),
});

/**
 * Cursor (keyset) params — `limit`/`cursor`/`cursorKey`/`order`/`direction`.
 * No `sort`: cursor pagination is driven by `order` + `direction`, not `sort`.
 *
 * @deprecated Use `makeCursorParamsSchema` (safe defaults, task 014 P3). Removed in the next major.
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
 * konstantalar ham core so'rov limitlarini oladi, lekin legacy-parity uchun
 * `perPage`/`limit` cap'siz va uch server-owned maydon ochiq qoladi; yangi kod shu
 * factory'lardan foydalanadi. */

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
   * So'rov limitlari; berilmaganlari core default'ida (`DEFAULT_QUERY_LIMITS`:
   * chuqurlik 5, shartlar 30, massiv 200, satr 256, offset 10 000, sort 3).
   * `Infinity` limitni o'chiradi (⚠️ DoS yuzasi).
   *
   * @example
   * ```ts
   * makeOffsetParamsSchema({ limits: { maxInItems: 500 } });
   * ```
   */
  limits?: Partial<QueryLimits>;
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
  const limits = resolveLimits(options.limits);
  return z
    .object({
      filter: limitedFilterSchema(limits).optional(),
      sort: limitedSortSchema(limits.maxSortFields).optional(),
      ...pickServerOwned(options.allow),
      page: z.number().int().positive().optional(),
      perPage: positive(options.maxPerPage ?? DEFAULT_MAX_PER_PAGE),
    })
    .superRefine(offsetDepthCheck(limits.maxOffset));
}

/** Infinite-scroll params schema — `limit` cap'i bilan. Qarang: {@link makeOffsetParamsSchema}. */
export function makeInfiniteParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(options: ParamsSchemaOptions<TAllow> = {}) {
  const limits = resolveLimits(options.limits);
  return z.object({
    filter: limitedFilterSchema(limits).optional(),
    sort: limitedSortSchema(limits.maxSortFields).optional(),
    ...pickServerOwned(options.allow),
    limit: positive(options.maxLimit ?? DEFAULT_MAX_LIMIT),
    offset: offsetField(limits.maxOffset),
  });
}

/**
 * Cursor (keyset) params schema — `limit` cap'i bilan. `sort` yo'q: tartib
 * `order` + `direction` bilan boshqariladi.
 */
export function makeCursorParamsSchema<const TAllow extends readonly ServerOwnedField[] = []>(options: ParamsSchemaOptions<TAllow> = {}) {
  return z.object({
    filter: limitedFilterSchema(resolveLimits(options.limits)).optional(),
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
