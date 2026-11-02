import type { AnyPgTable } from "drizzle-orm/pg-core";
import { clampOffset, clampPage, clampPageSize, infinitePage, offsetMeta, offsetPageWithoutTotal } from "@querykitjs/core/internal";

import type { ByIdParams, Filter, Id, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult, QueryParams } from "../types";
import { buildOrderBy } from "../internal/order-by";
import type { RepoContext } from "./context";

/** `findAll`, `findOne`, `findById`, `findList`, `findInfinite`, `count`, `exists`. */
export function readMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>) {
  const { runtime, table, diag, handle, policy, composeWhere, withId, countWhere } = ctx;
  const { pickColumns } = ctx.projection;

  /** The client's filter and sort, checked before any SQL is built. */
  const checked = (params: QueryParams<TTable>) => {
    policy.checkFilter(params.filter);
    policy.checkSort(params.sort);
  };

  return {
    async findAll(params: QueryParams<TTable> = {}) {
      checked(params);
      const rows = await handle().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort, diag),
        columns: pickColumns(params.columns),
        with: params.with,
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TTable> = {}) {
      checked(params);
      const row = await handle().findFirst({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort, diag),
        columns: pickColumns(params.columns),
        with: params.with,
      });
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TTable> = {}) {
      const { idKey = "id", filter, ...rest } = params;
      // Only the client's filter: `idKey` is the server's own choice.
      policy.checkFilter(filter);
      const row = await handle().findFirst({
        where: composeWhere(withId(filter, idKey, id), params.withDeleted),
        columns: pickColumns(rest.columns),
        with: rest.with,
      });
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TTable> = {}) {
      checked(params);
      const page = clampPage(params.page);
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      policy.checkPage({ page, perPage });
      const where = composeWhere(params.filter, params.withDeleted);
      const rows = (limit: number) =>
        handle().findMany({
          where,
          orderBy: buildOrderBy(table, params.sort, diag),
          limit,
          offset: (page - 1) * perPage,
          columns: pickColumns(params.columns),
          with: params.with,
        });

      // Task 013: no count — one extra row tells whether a next page exists.
      if (params.withTotal === false) return offsetPageWithoutTotal(await rows(perPage + 1), page, perPage) as OffsetResult<never>;
      const [data, totalItems] = await Promise.all([rows(perPage), countWhere(where)]);
      return { data, meta: offsetMeta(page, perPage, totalItems) } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TTable> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = clampOffset(params.offset);
      checked(params);
      policy.checkPage({ offset });

      const rows = await handle().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort, diag),
        limit: limit + 1,
        offset,
        columns: pickColumns(params.columns),
        with: params.with,
      });

      return infinitePage(rows, limit, offset) as InfiniteResult<never>;
    },

    async count(filter?: Filter<TTable>) {
      policy.checkFilter(filter);
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TTable>) {
      policy.checkFilter(filter);
      return (await countWhere(composeWhere(filter))) > 0;
    },
  };
}
