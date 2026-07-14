import { createFilters as coreCreateFilters, f } from "@querykitjs/core";

import type { AndGroup, FieldCondition, FieldKey, FilterNode, FilterScalar, FilterValue, NotGroup, OrGroup } from "./types";

/** Keys of `T` whose value is assignable to `V`. */
type ValueKeys<T, V> = { [K in keyof T]-?: NonNullable<T[K]> extends V ? Extract<K, string> : never }[keyof T];
/** String-valued field keys (for `contains`/`startsWith`/`like`/…). */
type StringKeys<T> = ValueKeys<T, string>;
/** Comparable field keys — string/number/bigint/Date (for `gt`/`between`/…). */
type ComparableKeys<T> = ValueKeys<T, string | number | bigint | Date>;

type Node<T> = FilterNode<T>;

/**
 * Field-type-aware filter builder: string-match operators are offered only for
 * string fields, comparison only for comparable fields, so nonsensical filters
 * (e.g. `contains` on a number) are compile errors. Runtime is
 * `@querykitjs/core`'s builder unchanged.
 */
export interface TypedFilters<T> {
  eq<K extends FieldKey<T>>(key: K, value: FilterValue): FieldCondition<T>;
  ne<K extends FieldKey<T>>(key: K, value: FilterValue): FieldCondition<T>;

  gt<K extends ComparableKeys<T>>(key: K, value: FilterValue): FieldCondition<T>;
  gte<K extends ComparableKeys<T>>(key: K, value: FilterValue): FieldCondition<T>;
  lt<K extends ComparableKeys<T>>(key: K, value: FilterValue): FieldCondition<T>;
  lte<K extends ComparableKeys<T>>(key: K, value: FilterValue): FieldCondition<T>;
  between<K extends ComparableKeys<T>>(key: K, min: FilterScalar | Date, max: FilterScalar | Date): FieldCondition<T>;
  range<K extends ComparableKeys<T>>(key: K, from: FilterScalar | Date, to: FilterScalar | Date): FieldCondition<T>[];

  contains<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;
  startsWith<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;
  endsWith<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;
  like<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;
  ilike<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;
  notLike<K extends StringKeys<T>>(key: K, value: string): FieldCondition<T>;

  in<K extends FieldKey<T>>(key: K, value: Array<string | number>): FieldCondition<T>;
  notIn<K extends FieldKey<T>>(key: K, value: Array<string | number>): FieldCondition<T>;

  isNull<K extends FieldKey<T>>(key: K): FieldCondition<T>;
  isNotNull<K extends FieldKey<T>>(key: K): FieldCondition<T>;

  and(...nodes: Node<T>[]): AndGroup<T>;
  or(...nodes: Node<T>[]): OrGroup<T>;
  not(node: Node<T>): NotGroup<T>;
}

/**
 * Typed, ergonomic filter builder for an entity — field-name autocomplete plus
 * field-type-aware operators (see {@link TypedFilters}).
 *
 * @typeParam T - the list entity type (`Buyer`, `Product`, …).
 * @example
 * ```ts
 * const f = createFilters<Buyer>();
 * const filter = f.and(f.contains("buyerName", s), f.gte("age", 18));
 * // f.contains("age", …) → compile error (age is a number)
 * ```
 */
export function createFilters<T = Record<string, unknown>>(): TypedFilters<T> {
  return coreCreateFilters<FieldKey<T>>() as unknown as TypedFilters<T>;
}

/** Untyped (entity-agnostic) filter builder — quick use, no field-type checks. */
export { f };
