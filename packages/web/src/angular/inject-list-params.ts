import { computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, type ParamMap, Router } from "@angular/router";

import type { AdapterName, WithFor } from "../adapter";
import type { Resource } from "../registry";
import { searchParamsToQuery } from "../route-query";
import type { ListSchema } from "../schema";
import type { UrlConfig } from "../url";
import { injectListParamsBase, type InjectListParamsResult } from "./inject-list-params-base";

export interface InjectListParamsOptions<A extends AdapterName> {
  /** URL↔filter schema ({@link defineListSchema} / `resource.schema`). */
  schema: ListSchema;
  /** URL param names (page/size/sortType) — optional. */
  url?: UrlConfig;
  /** Fixed relations to load on every request (not URL-driven). */
  with?: WithFor<A>;
}

function paramMapToSearchParams(paramMap: ParamMap): URLSearchParams {
  return new URLSearchParams(paramMap.keys.flatMap(key => paramMap.getAll(key).map(value => [key, value])));
}

/**
 * List URL state as signals, with the Angular **Router** (`ActivatedRoute` + `Router`).
 * Reads filters/sort/page from the query params via the schema, builds a ready-to-send
 * payload through the `resource`, and returns URL setters that `router.navigate` (a new
 * history entry; filter/sort/size changes reset `page`). Does **not** fetch. Call it in an
 * injection context (a field initializer or a constructor); elsewhere Angular throws `NG0203`.
 *
 * @example
 * ```ts
 * @Component({ template: `<button (click)="list.setPage(2)">2</button>` })
 * class UsersPage {
 *   readonly list = injectListParams(users, { schema: usersSchema });
 *   readonly payload = computed(() => this.list.params());
 * }
 * ```
 */
export function injectListParams<T, A extends AdapterName>(resource: Resource<T, A>, options: InjectListParamsOptions<A>): InjectListParamsResult {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  // `queryParamMap` replays its current value on subscribe, so the signal is never empty.
  const paramMap = toSignal(route.queryParamMap, { requireSync: true });
  return injectListParamsBase(resource, {
    ...options,
    searchParams: computed(() => paramMapToSearchParams(paramMap())),
    setSearchParams: next => void router.navigate([], { relativeTo: route, queryParams: searchParamsToQuery(next) }),
  });
}
