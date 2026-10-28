import { and, asc, desc, gt, lt } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursor } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { castForColumn, INVALID_VALUE } from "../internal/coerce";
import { resolveColumn } from "../internal/columns";
import type { RepoContext } from "./context";

/** `findCursor` — keyset pagination on one column. */
export function cursorMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>) {
  const { runtime, table, diag, handle, composeWhere } = ctx;
  const { guarded, permits, pickColumns } = ctx.projection;

  return {
    async findCursor(params: CursorParams<TTable> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const column = resolveColumn(table, cursorKey);
      // Always fatal: without a usable cursor column there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (both adapters agree).
      if (!column) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // A cursor token carries dates as ISO strings, so re-cast to the column's
      // type — otherwise `gt(timestampColumn, "2026-…")` crashes in drizzle's
      // driver mapping and page 2 of a date-keyed feed 500s. A token that does
      // not fit the column is treated as "no cursor" (like an undecodable one).
      const decoded = castForColumn(column, decodeCursor(params.cursor));
      const cursorValue = decoded === INVALID_VALUE ? undefined : decoded;
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek = cursorValue !== undefined ? (ascInQuery ? gt(column, cursorValue) : lt(column, cursorValue)) : undefined;
      const where = seek && baseWhere ? and(baseWhere, seek) : (seek ?? baseWhere);

      // Force-include the cursor column when a columns selection is given —
      // otherwise its value is missing and next/prev cursors break. `cursorKey`
      // is client-supplied, so under a projection guard this would be a way to
      // read a forbidden column: keep it in the query (pagination needs it) but
      // strip it from the rows we hand back.
      const selected = pickColumns(params.columns);
      const columns = selected ? { ...selected, [cursorKey]: true } : undefined;
      const leaksCursorColumn = guarded && selected !== undefined && !permits(cursorKey);

      const rows = (await handle().findMany({
        where,
        orderBy: [ascInQuery ? asc(column) : desc(column)],
        limit: limit + 1,
        columns,
        with: params.with,
      })) as Record<string, unknown>[];

      const page = cursorPage(rows, { limit, direction, hasCursor: cursorValue !== undefined, cursorField: cursorKey });

      // Cursor values are read above, so the column can go now.
      if (leaksCursorColumn) {
        page.data = page.data.map(row => {
          const { [cursorKey]: _cursor, ...rest } = row;
          return rest;
        });
      }

      return page as CursorResult<never>;
    },
  };
}
