import type { AnyPgTable } from "drizzle-orm/pg-core";
import { clampOffset, clampPage, clampPageSize, infinitePage, offsetMeta } from "@querykitjs/core/internal";

import type { ByIdParams, Filter, Id, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult, QueryParams } from "../types";
import { buildOrderBy } from "../internal/order-by";
import type { RepoContext } from "./context";

/** `findAll`, `findOne`, `findById`, `findList`, `findInfinite`, `count`, `exists`. */
export function readMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>) {
  const { runtime, table, diag, handle, composeWhere, withId, countWhere } = ctx;
  const { pickColumns } = ctx.projection;

  return {
    async findAll(params: QueryParams<TTable> = {}) {
      const rows = await handle().findMany({
        where: composeWhere(params.filter, params.withDeleted),
        orderBy: buildOrderBy(table, params.sort, diag),
        columns: pickColumns(params.columns),
        with: params.with,
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TTable> = {}) {
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
      const row = await handle().findFirst({
        where: composeWhere(withId(filter, idKey, id), params.withDeleted),
        columns: pickColumns(rest.columns),
        with: rest.with,
      });
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TTable> = {}) {
      const page = clampPage(params.page);
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      const where = composeWhere(params.filter, params.withDeleted);

      const [data, totalItems] = await Promise.all([
        handle().findMany({
          where,
          orderBy: buildOrderBy(table, params.sort, diag),
          limit: perPage,
          offset: (page - 1) * perPage,
          columns: pickColumns(params.columns),
          with: params.with,
        }),
        countWhere(where),
      ]);

      return { data, meta: offsetMeta(page, perPage, totalItems) } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TTable> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = clampOffset(params.offset);

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

    count(filter?: Filter<TTable>) {
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TTable>) {
      return (await countWhere(composeWhere(filter))) > 0;
    },
  };
}
