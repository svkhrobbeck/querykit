import type { Document } from "mongodb";
import { clampOffset, clampPage, clampPageSize, infinitePage, offsetMeta, offsetPageWithoutTotal } from "@querykitjs/core/internal";

import type { ByIdParams, Filter, Id, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult, QueryParams } from "../types";
import { EXPLAIN } from "../internal/explain-key";
import type { RepoContext } from "./context";

/** Reads: every one checks the policy first, so a refused request never reaches the driver. */
export function readMethods<TDoc extends Document>(ctx: RepoContext<TDoc>) {
  const { runtime, collection, policy, sortSpec, withOf, composeWhere, withId, runFind, countWhere, timed } = ctx;

  const checked = (params: QueryParams<TDoc>) => {
    policy.checkFilter(params.filter);
    policy.checkSort(params.sort as never);
    withOf(params.with);
  };

  const first = async (params: QueryParams<TDoc>, filter: Filter<TDoc> | undefined) => {
    const [row] = await runFind(composeWhere(filter, params.withDeleted), { sort: sortSpec(params.sort), columns: params.columns, limit: 1 });
    return row;
  };

  return {
    async findAll(params: QueryParams<TDoc> = {}) {
      checked(params);
      return (await runFind(composeWhere(params.filter, params.withDeleted), { sort: sortSpec(params.sort), columns: params.columns })) as never;
    },

    async findOne(params: QueryParams<TDoc> = {}) {
      checked(params);
      return (await first(params, params.filter)) as never;
    },

    async findById(id: Id, params: ByIdParams<TDoc> = {}) {
      const { idKey = "id", filter } = params;
      policy.checkFilter(filter);
      withOf(params.with);
      return (await first({ ...params, sort: undefined }, withId(filter, idKey as string, id))) as never;
    },

    async findList(params: OffsetParams<TDoc> = {}) {
      checked(params);
      const page = clampPage(params.page);
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      policy.checkPage({ page, perPage });
      const where = composeWhere(params.filter, params.withDeleted);
      const rows = (limit: number) => runFind(where, { sort: sortSpec(params.sort), columns: params.columns, limit, skip: (page - 1) * perPage });

      // `withTotal: false` (task 013): one read of perPage + 1 rows, no count.
      if (params.withTotal === false) return offsetPageWithoutTotal(await rows(perPage + 1), page, perPage) as OffsetResult<never>;
      const [data, totalItems] = await Promise.all([rows(perPage), countWhere(where)]);
      return { data, meta: offsetMeta(page, perPage, totalItems) } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = clampOffset(params.offset);
      checked(params);
      policy.checkPage({ offset });
      const rows = await runFind(composeWhere(params.filter, params.withDeleted), {
        sort: sortSpec(params.sort),
        columns: params.columns,
        limit: limit + 1,
        skip: offset,
      });
      return infinitePage(rows, limit, offset) as InfiniteResult<never>;
    },

    async count(filter?: Filter<TDoc>) {
      policy.checkFilter(filter);
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TDoc>) {
      policy.checkFilter(filter);
      return (await countWhere(composeWhere(filter))) > 0;
    },

    /** The query plan of `findAll(params)` — the same checks and filter, `explain()` instead of rows. */
    async [EXPLAIN](params: QueryParams<TDoc> = {}) {
      checked(params);
      const where = composeWhere(params.filter, params.withDeleted);
      return timed(options => collection.find(where as never, { ...options, sort: sortSpec(params.sort) }).explain("queryPlanner"));
    },
  };
}
