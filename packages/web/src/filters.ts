import type { AndGroup, FieldCondition, FieldKey, FilterNode, FilterOperator, FilterScalar, FilterValue, NotGroup, OrGroup } from "./types";

function field<T>(key: FieldKey<T>, operation: FilterOperator, value?: FilterValue): FieldCondition<T> {
  return { key, operation, value };
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
    like: (key: K, value: string) => field<T>(key, "like", value),
    ilike: (key: K, value: string) => field<T>(key, "ilike", value),
    notLike: (key: K, value: string) => field<T>(key, "notLike", value),

    in: (key: K, value: Array<string | number>) => field<T>(key, "in", value),
    notIn: (key: K, value: Array<string | number>) => field<T>(key, "notIn", value),
    between: (key: K, min: FilterScalar | Date, max: FilterScalar | Date) => field<T>(key, "between", [min, max] as FilterValue),

    isNull: (key: K) => field<T>(key, "isNull"),
    isNotNull: (key: K) => field<T>(key, "isNotNull"),

    /** Diapazon — ikkita shart (`>=` va `<=`) massivi (flat filterga spread qilinadi). */
    range: (key: K, from: FilterScalar | Date, to: FilterScalar | Date): FieldCondition<T>[] => [
      field<T>(key, ">=", from as FilterValue),
      field<T>(key, "<=", to as FilterValue),
    ],

    and: (...nodes: Node[]): AndGroup<T> => ({ and: nodes }),
    or: (...nodes: Node[]): OrGroup<T> => ({ or: nodes }),
    not: (node: Node): NotGroup<T> => ({ not: node }),
  };
}

/** Tipsiz (entity'ga bog'lanmagan) filter quruvchilar — tez foydalanish uchun. */
export const f = createFilters();
