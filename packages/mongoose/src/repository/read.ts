import { clampOffset, clampPage, clampPageSize, infinitePage, offsetMeta } from "@querykitjs/core/internal";

import type { ByIdParams, Filter, Id, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult, QueryParams } from "../types";
import type { AnyQuery, RepoContext } from "./context";

/** `findAll`, `findOne`, `findById`, `findList`, `findInfinite`, `count`, `exists`. */
export function readMethods<TDoc>(ctx: RepoContext<TDoc>) {
  const { runtime, m, projection, sortSpec, composeWhere, withId, applyPopulate, attachSession, runFind, countWhere } = ctx;

  return {
    async findAll(params: QueryParams<TDoc> = {}) {
      const rows = await runFind(composeWhere(params.filter, params.withDeleted), {
        sort: sortSpec(params.sort),
        columns: params.columns,
        with: params.with,
      });
      return rows as never;
    },

    async findOne(params: QueryParams<TDoc> = {}) {
      let q: AnyQuery = m.findOne(composeWhere(params.filter, params.withDeleted), projection(params.columns));
      q = q.sort(sortSpec(params.sort));
      q = applyPopulate(q, params.with);
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as never;
    },

    async findById(id: Id, params: ByIdParams<TDoc> = {}) {
      const { idKey = "id", filter, columns, with: withRel } = params;
      let q: AnyQuery = m.findOne(composeWhere(withId(filter, idKey as string, id), params.withDeleted), projection(columns));
      q = applyPopulate(q, withRel);
      const row = await attachSession(q).lean().exec();
      return (row ?? undefined) as never;
    },

    async findList(params: OffsetParams<TDoc> = {}) {
      const page = clampPage(params.page);
      const perPage = clampPageSize(params.perPage, runtime.defaultPerPage, runtime.maxPerPage);
      const where = composeWhere(params.filter, params.withDeleted);

      const [data, totalItems] = await Promise.all([
        runFind(where, { sort: sortSpec(params.sort), columns: params.columns, with: params.with, limit: perPage, skip: (page - 1) * perPage }),
        countWhere(where),
      ]);

      return { data, meta: offsetMeta(page, perPage, totalItems) } as OffsetResult<never>;
    },

    async findInfinite(params: InfiniteParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const offset = clampOffset(params.offset);

      const rows = await runFind(composeWhere(params.filter, params.withDeleted), {
        sort: sortSpec(params.sort),
        columns: params.columns,
        with: params.with,
        limit: limit + 1,
        skip: offset,
      });

      return infinitePage(rows, limit, offset) as InfiniteResult<never>;
    },

    count(filter?: Filter<TDoc>) {
      return countWhere(composeWhere(filter));
    },

    async exists(filter?: Filter<TDoc>) {
      return (await countWhere(composeWhere(filter))) > 0;
    },
  };
}
