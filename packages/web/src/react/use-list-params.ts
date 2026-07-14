import { useSearchParams } from "react-router-dom";

import type { AdapterName, WithFor } from "../adapter";
import type { Resource } from "../registry";
import type { ListSchema } from "../schema";
import type { UrlConfig } from "../url";
import { useListParamsBase, type UseListParamsResult } from "./use-list-params-base";

export interface UseListParamsOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). Memoize it. */
  schema: ListSchema;
  /** URL param names (page/size/sortType) — optional. Memoize it. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

/**
 * List URL-state hook — turnkey with **react-router-dom** (uses `useSearchParams`
 * internally). Reads filters/sort/page from the URL via the schema, builds a
 * ready-to-send payload through the `resource`, and returns URL setters (which
 * reset `page` on filter/sort/size change). Does **not** fetch — pass `params`
 * to your own axios / TanStack Query.
 *
 * For other routers (Next.js, TanStack Router), use {@link useListParamsBase} and
 * supply `searchParams`/`setSearchParams` yourself.
 *
 * @example
 * ```tsx
 * const users = qk.resource<IUser>("users");
 * const { params, setPage, setSort } = useListParams(users, { schema: usersSchema });
 * const { data } = useQuery({ queryKey: users.keys.list(params), queryFn: () => post("/users/list", params) });
 * ```
 */
export function useListParams<T, A extends AdapterName>(resource: Resource<T, A>, options: UseListParamsOptions<A>): UseListParamsResult {
  const [searchParams, setSearchParams] = useSearchParams();
  return useListParamsBase(resource, {
    ...options,
    searchParams,
    setSearchParams: next => setSearchParams(next),
  });
}
