/**
^ * A route query as vue-router gives it: v4 has `string | null | (string | null)[]` per key,
 * v5 always an array. `null` is a key without `=` (`?q`).
 */
export type RouteQuery = Record<string, string | null | (string | null)[] | undefined>;

/** Route query → search params: a repeated key keeps every value; `null` becomes an empty value. */
export function queryToSearchParams(query: RouteQuery): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) searchParams.append(key, item ?? "");
    }
  }
  return searchParams;
}

/** Search params → route query for `router.push({ query })`: one value → string, a repeated key → array. */
export function searchParamsToQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return query;
}
