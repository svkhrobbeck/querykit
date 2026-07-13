import type { AnyPgTable } from "drizzle-orm/pg-core";

import type { AndGroup, ColumnKey, FieldCondition, FilterNode, FilterValue, NotGroup, OrGroup } from "./types";

/** Bitta `{ key, op, value }` shartini quruvchi ichki yordamchi. */
function field<TTable extends AnyPgTable>(key: ColumnKey<TTable>, op: FieldCondition<TTable>["op"], value?: FilterValue): FieldCondition<TTable> {
  return { key, op, value };
}

/**
 * Filter daraxtini obyekt shovqinisiz quruvchi **ergonomik yordamchilar**
 * to'plamini qaytaradi. Jadval tipiga bog'lasangiz, ustun nomlari uchun
 * avtomatik to'ldirish (autocomplete) ishlaydi.
 *
 * @typeParam TTable - filter quriladigan Drizzle jadval tipi (`typeof users`).
 * @returns `eq/ne/gt/gte/lt/lte`, `like/ilike/contains/startsWith/endsWith`,
 *   `in/notIn/between`, `isNull/isNotNull` va guruh (`and/or/not`) quruvchilari.
 * @example
 * ```ts
 * const uf = createFilters<typeof users>();
 * await usersRepository.findAll({
 *   filter: uf.and(
 *     uf.eq("status", "active"),
 *     uf.or(uf.gte("age", 18), uf.in("role", ["admin", "owner"])),
 *     uf.not(uf.isNull("deletedAt")),
 *   ),
 * });
 * ```
 */
export function createFilters<TTable extends AnyPgTable>() {
  type Key = ColumnKey<TTable>;
  type Node = FilterNode<TTable>;

  return {
    eq: (key: Key, value: FilterValue) => field<TTable>(key, "=", value),
    ne: (key: Key, value: FilterValue) => field<TTable>(key, "!=", value),
    gt: (key: Key, value: FilterValue) => field<TTable>(key, ">", value),
    gte: (key: Key, value: FilterValue) => field<TTable>(key, ">=", value),
    lt: (key: Key, value: FilterValue) => field<TTable>(key, "<", value),
    lte: (key: Key, value: FilterValue) => field<TTable>(key, "<=", value),

    like: (key: Key, value: string) => field<TTable>(key, "like", value),
    ilike: (key: Key, value: string) => field<TTable>(key, "ilike", value),
    contains: (key: Key, value: string) => field<TTable>(key, "contains", value),
    startsWith: (key: Key, value: string) => field<TTable>(key, "startsWith", value),
    endsWith: (key: Key, value: string) => field<TTable>(key, "endsWith", value),

    in: (key: Key, value: Array<string | number>) => field<TTable>(key, "in", value),
    notIn: (key: Key, value: Array<string | number>) => field<TTable>(key, "notIn", value),
    between: (key: Key, min: string | number, max: string | number) => field<TTable>(key, "between", [min, max]),

    isNull: (key: Key) => field<TTable>(key, "isNull"),
    isNotNull: (key: Key) => field<TTable>(key, "isNotNull"),

    and: (...nodes: Node[]): AndGroup<TTable> => ({ and: nodes }),
    or: (...nodes: Node[]): OrGroup<TTable> => ({ or: nodes }),
    not: (node: Node): NotGroup<TTable> => ({ not: node }),
  };
}

/**
 * Tipsiz (ustunga bog'lanmagan) filter yordamchilari — tez foydalanish uchun.
 * Ustun-nomi autocomplete kerak bo'lsa {@link createFilters} ni jadval bilan
 * chaqiring.
 *
 * @example
 * ```ts
 * import { f } from "@querykit/drizzle-pg";
 * const filter = f.or(f.contains("name", "ali"), f.eq("email", "a@b.com"));
 * ```
 */
export const f = createFilters<AnyPgTable>();
