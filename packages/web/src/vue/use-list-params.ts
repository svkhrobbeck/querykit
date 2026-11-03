import { useRoute, useRouter } from "vue-router";

import type { AdapterName, WithFor } from "../adapter";
import type { Resource } from "../registry";
import type { ListSchema } from "../schema";
import type { UrlConfig } from "../url";
import { queryToSearchParams, searchParamsToQuery } from "./query";
import { useListParamsBase, type UseListParamsResult } from "./use-list-params-base";

export interface UseListParamsOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). */
  schema: ListSchema;
  /** URL param names (page/size/sortType) — optional. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

/**
 * List URL-state composable — turnkey with **vue-router** 4 / 5 (`useRoute` + `useRouter`).
 * Reads filters/sort/page from the route query via the schema, builds a ready-to-send
 * payload through the `resource`, and returns URL setters that `router.push({ query })` (a
 * new history entry; filter/sort/size changes reset `page`). Does **not** fetch.
 *
 * @example
 * ```ts
 * const users = qk.resource<IUser>("users");
 * const { params, setPage, setSort } = useListParams(users, { schema: usersSchema });
 * const { data } = useQuery({ queryKey: computed(() => users.keys.list(params.value)), queryFn: () => post("/users/list", params.value) });
 * ```
 */
export function useListParams<T, A extends AdapterName>(resource: Resource<T, A>, options: UseListParamsOptions<A>): UseListParamsResult {
  const route = useRoute();
  const router = useRouter();
  return useListParamsBase(resource, {
    ...options,
    searchParams: () => queryToSearchParams(route.query),
    setSearchParams: next => void router.push({ query: searchParamsToQuery(next) }),
  });
}
