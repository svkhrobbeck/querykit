import { clampOffset, clampPage, clampPageSize, infinitePage, offsetMeta, offsetPageWithoutTotal } from "@querykitjs/core/internal";

import type { ByIdParams, Filter, Id, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult, QueryParams } from "../types";
import type { RepoContext } from "./context";

/** `findAll`, `findOne`, `findById`, `findList`, `findInfinite`, `count`, `exists`. */
export function readMethods<TDelegate>(ctx: RepoContext<TDelegate>) {
  const { runtime, delegate, projection, policy, sortBy, composeWhere, withId, countWhere } = ctx;

  /** The client's filter and sort, checked before Prisma is called. */
  const checked = (params: QueryParams<TDelegate>) => {
    policy.checkFilter(params.filter);
    policy.checkSort(params.sort as never);
  };

  return {
    async findAll(params: QueryParams<TDelegate> = {}) {
      checked(params);
      const rows = await delegate().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: sortBy(params.sort as never),
        ...projection(params.columns, params.with),
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TDelegate> = {}) {
      checked(params);
      const row = await delegate().findFirst({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: sortBy(params.sort as never),
        ...projection(params.columns, params.with),
      });
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TDelegate> = {}) {
      const { idKey = "id", filter } = params;
      // Only the client's filter: `idKey` is the server's own choice.
      policy.checkFilter(filter);
      const row = await delegate().findFirst({
        where: composeWhere(withId(filter, idKey as string, id), params.withDeleted),
        ...projection(params.columns, params.with),
      });
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TDelegate> = {}) {
      checked(params);
      const page = clampPage(params.page);
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      policy.checkPage({ page, perPage });
      const where = composeWhere(params.filter, params.withDeleted);
      const rows = (take: number) =>
        delegate().findMany({
          where,
          orderBy: sortBy(params.sort as never),
          take,
          skip: (page - 1) * perPage,
          ...projection(params.columns, params.with),
        });

      // Task 013: no count — one extra row tells whether a next page exists.
      if (params.withTotal === false) return offsetPageWithoutTotal(await rows(perPage + 1), page, perPage) as OffsetResult<never>;
      const [data, totalItems] = await Promise.all([rows(perPage), countWhere(where)]);
      return { data, meta: offsetMeta(page, perPage, totalItems) } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TDelegate> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = clampOffset(params.offset);
      checked(params);
      policy.checkPage({ offset });

      const rows = await delegate().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: sortBy(params.sort as never),
        take: limit + 1,
        skip: offset,
        ...projection(params.columns, params.with),
      });

      return infinitePage(rows, limit, offset) as InfiniteResult<never>;
    },

    async count(filter?: Filter<TDelegate>) {
      policy.checkFilter(filter);
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TDelegate>) {
      policy.checkFilter(filter);
      return (await countWhere(composeWhere(filter))) > 0;
    },
  };
}
