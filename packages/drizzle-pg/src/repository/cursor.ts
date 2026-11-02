import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable as PgTable } from "drizzle-orm/pg-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursorToken } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { castForColumn, INVALID_VALUE } from "../internal/coerce";
import { resolveColumn, tableColumns } from "../internal/columns";
import type { RepoContext } from "./context";

/** `findCursor` — keyset pagination on one column. */
export function cursorMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>) {
  const { runtime, table, diag, handle, policy, composeWhere } = ctx;
  const { guarded, permits, pickColumns } = ctx.projection;

  return {
    async findCursor(params: CursorParams<TTable> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";
      policy.checkFilter(params.filter);
      // The default `id` is the server's choice; a client-sent key must be sortable.
      if (params.cursorKey !== undefined) policy.checkCursorKey(cursorKey);

      const column = resolveColumn(table, cursorKey);
      // Always fatal: without a usable cursor column there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (both adapters agree).
      if (!column) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // Task 012: the token carries the cursor value and the primary key (tie-break),
      // both re-cast to their column's type; a token that does not fit is invalid-value.
      const [idKey, idColumn] = primaryKeyOf(table);
      const token = await decodeCursorToken(params.cursor, { source: diag.source, secret: runtime.cursorSecret });
      const cursorValue = token === undefined ? undefined : castForColumn(column, token.k);
      const idValue = token === undefined ? undefined : castForColumn(idColumn, token.id);
      if (cursorValue === INVALID_VALUE || idValue === INVALID_VALUE) {
        throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "invalid-value" });
      }
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const past = ascInQuery ? gt : lt;
      // (k > v) OR (k = v AND id > i); a primary-key cursor needs no tie-break.
      const tieBreak = column !== idColumn;
      const seek =
        token === undefined
          ? undefined
          : tieBreak
            ? or(past(column, cursorValue), and(eq(column, cursorValue), past(idColumn, idValue)))
            : past(column, cursorValue);
      const where = seek && baseWhere ? and(baseWhere, seek) : (seek ?? baseWhere);

      // Force-include the cursor column when a columns selection is given —
      // otherwise its value is missing and next/prev cursors break. `cursorKey`
      // is client-supplied, so under a projection guard this would be a way to
      // read a forbidden column: keep it in the query (pagination needs it) but
      // strip it from the rows we hand back.
      const selected = pickColumns(params.columns);
      const columns = selected ? { ...selected, [cursorKey]: true, [idKey]: true } : undefined;
      // The cursor and tie-break columns are queried for the tokens; under a projection guard
      // the ones the caller may not see are stripped from the rows afterwards.
      const hidden = guarded && selected !== undefined ? [cursorKey, idKey].filter(key => !permits(key) || !selected[key as keyof typeof selected]) : [];

      const rows = (await handle().findMany({
        where,
        orderBy: tieBreak ? [ascInQuery ? asc(column) : desc(column), ascInQuery ? asc(idColumn) : desc(idColumn)] : [ascInQuery ? asc(column) : desc(column)],
        limit: limit + 1,
        columns,
        with: params.with,
      })) as Record<string, unknown>[];

      const page = await cursorPage(rows, {
        limit,
        direction,
        hasCursor: cursorValue !== undefined,
        cursorField: cursorKey,
        idField: idKey,
        secret: runtime.cursorSecret,
      });

      // Token values are read above, so the hidden columns can go now.
      if (hidden.length > 0) {
        page.data = page.data.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.includes(key))));
      }

      return page as CursorResult<never>;
    },
  };
}

/** The primary-key column (JS key and column): the tie-break of every cursor seek (task 012). */
function primaryKeyOf(table: PgTable): [string, AnyPgColumn] {
  const columns = tableColumns(table);
  const primary = columns.find(([, column]) => column.primary) ?? columns.find(([key]) => key === "id");
  if (!primary)
    throw new Error(`findCursor: table "${String((table as unknown as { _: { name?: string } })._?.name ?? "?")}" has no primary key to break cursor ties`);
  return primary;
}
