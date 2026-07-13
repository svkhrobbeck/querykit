import type { FilterOperator, FilterValueType } from "./types";

/**
 * Bitta list maydonining deklarativ ta'rifi: URL param → filter shartiga qanday
 * aylantirilishi. `key` berilmasa param nomi ishlatiladi; `operation` default `=`.
 */
export interface FieldDescriptor {
  /** Backend ustun kaliti (default — schema'dagi param nomi). */
  key?: string;
  /** Filter operatori (default `"="`). */
  operation?: FilterOperator;
  /** Qiymat tipi (coerce uchun). */
  type?: FilterValueType;
  /** String qiymatni trim qilish. */
  trim?: boolean;
  /** Diapazon: `[fromParam, toParam]` URL param nomlari → `>=` va `<=` shartlar. */
  range?: [string, string];
}

/** URL param → {@link FieldDescriptor} tavsiflar to'plami. */
export type ListSchema = Record<string, FieldDescriptor>;

/**
 * List filter schema'sini e'lon qiladi (identity helper — tiplarni saqlaydi).
 * URL param'larni `{key, operation, type}` shartlariga bog'laydi, shu bilan har
 * sahifada qo'lda `IFilter[]` qurishni bartaraf qiladi.
 *
 * @example
 * ```ts
 * const buyersSchema = defineListSchema({
 *   id: { operation: "=" },
 *   buyerName: { operation: "%_%", trim: true },
 *   status: { operation: "=" },
 *   createdAt: { type: "date", range: ["fromDate", "toDate"] },
 * });
 * ```
 */
export function defineListSchema<S extends ListSchema>(schema: S): S {
  return schema;
}
