import type { AndGroup, FieldCondition, FilterNode, FilterOperator, FilterScalar, FilterValue, NotGroup, OrGroup } from "./types";

function field<TKey extends string>(key: TKey, operation: FilterOperator, value?: FilterValue): FieldCondition<TKey> {
  return { key, operation, value };
}

/**
 * Filter shartlarini tipli, ergonomik quruvchilar to'plamini qaytaradi. Kalit
 * tipiga (`TKey`) bog'lanadi; adapterlar uni o'z ustun/maydon kaliti bilan
 * chaqiradi. `TRaw` — guruhlarga (`and/or/not`) qo'shsa bo'ladigan raw tugun tipi.
 *
 * @typeParam TKey - ustun/maydon kaliti (string union).
 * @typeParam TRaw - raw escape-hatch tugun tipi (masalan Drizzle `SQL`).
 * @example
 * ```ts
 * const f = createFilters<"status" | "age">();
 * f.and(f.eq("status", "active"), f.gte("age", 18));
 * ```
 */
export function createFilters<TKey extends string = string, TRaw = never>() {
  type Node = FilterNode<TKey, TRaw>;

  return {
    eq: (key: TKey, value: FilterValue) => field(key, "=", value),
    ne: (key: TKey, value: FilterValue) => field(key, "!=", value),
    gt: (key: TKey, value: FilterValue) => field(key, ">", value),
    gte: (key: TKey, value: FilterValue) => field(key, ">=", value),
    lt: (key: TKey, value: FilterValue) => field(key, "<", value),
    lte: (key: TKey, value: FilterValue) => field(key, "<=", value),

    contains: (key: TKey, value: string) => field(key, "%_%", value),
    startsWith: (key: TKey, value: string) => field(key, "%_", value),
    endsWith: (key: TKey, value: string) => field(key, "_%", value),
    like: (key: TKey, value: string) => field(key, "like", value),
    ilike: (key: TKey, value: string) => field(key, "ilike", value),
    notLike: (key: TKey, value: string) => field(key, "notLike", value),

    in: (key: TKey, value: Array<string | number>) => field(key, "in", value),
    notIn: (key: TKey, value: Array<string | number>) => field(key, "notIn", value),
    between: (key: TKey, min: FilterScalar | Date, max: FilterScalar | Date) => field(key, "between", [min, max] as FilterValue),
    notBetween: (key: TKey, min: FilterScalar | Date, max: FilterScalar | Date) => field(key, "notBetween", [min, max] as FilterValue),
    /** Diapazon — ikkita shart (`>=` va `<=`) massivi (flat filterga spread qilinadi). */
    range: (key: TKey, from: FilterScalar | Date, to: FilterScalar | Date): FieldCondition<TKey>[] => [
      field(key, ">=", from as FilterValue),
      field(key, "<=", to as FilterValue),
    ],

    isNull: (key: TKey) => field(key, "isNull"),
    isNotNull: (key: TKey) => field(key, "isNotNull"),

    and: (...nodes: Node[]): AndGroup<TKey, TRaw> => ({ and: nodes }),
    or: (...nodes: Node[]): OrGroup<TKey, TRaw> => ({ or: nodes }),
    not: (node: Node): NotGroup<TKey, TRaw> => ({ not: node }),
  };
}

/** Tipsiz (kalitga bog'lanmagan) filter quruvchilar — tez foydalanish uchun. */
export const f = createFilters();
