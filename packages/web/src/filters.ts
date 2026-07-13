import type { AndGroup, FieldCondition, FieldKey, FilterNode, FilterOperator, FilterScalar, FilterValue, FilterValueType, NotGroup, OrGroup } from "./types";

function field<T>(key: FieldKey<T>, operation: FilterOperator, value?: FilterValue, type?: FilterValueType): FieldCondition<T> {
  return type === undefined ? { key, operation, value } : { key, operation, value, type };
}

/**
 * Filter shartlarini tipli, ergonomik quruvchilar to'plamini qaytaradi. Entity
 * tipiga bog'lasangiz, maydon nomlari uchun autocomplete ishlaydi.
 *
 * Top-level `and`/`or`/`not` — nested guruh (querykit backend). Oddiy shartlar
 * ro'yxati esa flat massiv sifatida ham beriladi (legacy `IFilter[]` bilan mos).
 *
 * @typeParam T - list qilinadigan entity tipi (`Buyer`, `Product`, ...).
 * @example
 * ```ts
 * const f = createFilters<Buyer>();
 * const filter = f.and(f.contains("buyerName", s), f.eq("status", st));
 * // yoki flat:
 * const filter = [f.contains("buyerName", s), f.eq("status", st)];
 * ```
 */
export function createFilters<T = Record<string, unknown>>() {
  type K = FieldKey<T>;
  type Node = FilterNode<T>;

  return {
    eq: (key: K, value: FilterValue) => field<T>(key, "=", value),
    ne: (key: K, value: FilterValue) => field<T>(key, "!=", value),
    gt: (key: K, value: FilterValue) => field<T>(key, ">", value),
    gte: (key: K, value: FilterValue) => field<T>(key, ">=", value),
    lt: (key: K, value: FilterValue) => field<T>(key, "<", value),
    lte: (key: K, value: FilterValue) => field<T>(key, "<=", value),

    contains: (key: K, value: string) => field<T>(key, "%_%", value),
    startsWith: (key: K, value: string) => field<T>(key, "%_", value),
    endsWith: (key: K, value: string) => field<T>(key, "_%", value),

    in: (key: K, value: Array<string | number>) => field<T>(key, "in", value),
    notIn: (key: K, value: Array<string | number>) => field<T>(key, "notIn", value),

    isNull: (key: K) => field<T>(key, "isNull"),
    isNotNull: (key: K) => field<T>(key, "isNotNull"),

    /** Sana sharti (`type: "date"` bilan). */
    dateGte: (key: K, value: FilterScalar | Date) => field<T>(key, ">=", value, "date"),
    dateLte: (key: K, value: FilterScalar | Date) => field<T>(key, "<=", value, "date"),
    /** Diapazon — ikkita shart (`>=` va `<=`) massivi (flat filterga spread qilinadi). */
    range: (key: K, from: FilterScalar | Date, to: FilterScalar | Date, type?: FilterValueType): FieldCondition<T>[] => [
      field<T>(key, ">=", from, type),
      field<T>(key, "<=", to, type),
    ],

    and: (...nodes: Node[]): AndGroup<T> => ({ and: nodes }),
    or: (...nodes: Node[]): OrGroup<T> => ({ or: nodes }),
    not: (node: Node): NotGroup<T> => ({ not: node }),
  };
}

/** Tipsiz (entity'ga bog'lanmagan) filter quruvchilar — tez foydalanish uchun. */
export const f = createFilters();
