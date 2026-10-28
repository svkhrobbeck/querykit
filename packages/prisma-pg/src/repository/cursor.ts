import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursor } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { castValue, resolveField } from "../internal/fields";
import { pickColumns } from "../internal/projection";
import { andWhere, type Where } from "../internal/where";
import type { RepoContext } from "./context";

/** `findCursor` — keyset pagination on one field. */
export function cursorMethods<TDelegate>(ctx: RepoContext<TDelegate>) {
  const { runtime, meta, diag, delegate, guard, guarded, permits, projection, composeWhere } = ctx;

  return {
    async findCursor(params: CursorParams<TDelegate> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(meta, cursorKey);
      // Always fatal: without a usable cursor field there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (all three adapters agree).
      if (!field) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // A cursor token carries dates as ISO strings, so re-cast to the field's
      // type — otherwise Prisma rejects `gt(dateTimeField, "2026-…")` and page 2
      // of a date-keyed feed 500s. A token that does not fit is treated as "no
      // cursor" (like an undecodable one).
      const decoded = decodeCursor(params.cursor);
      const cursorValue = decoded === undefined ? undefined : castValue(meta, field, decoded);
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      // Keyset via WHERE (not Prisma's native `cursor`+`skip`) so the token stays
      // interchangeable with the drizzle-pg and mongoose adapters.
      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek: Where | undefined = cursorValue !== undefined ? { [field]: ascInQuery ? { gt: cursorValue } : { lt: cursorValue } } : undefined;
      const where = andWhere([baseWhere, seek]);

      // Force-include the cursor field when a selection is given — otherwise its
      // value is missing and next/prev tokens break. `cursorKey` is
      // client-supplied, so under a projection guard this would be a way to read
      // a forbidden field: keep it in the query (pagination needs it) but strip
      // it from the rows we hand back.
      const selected = pickColumns(guard, params.columns as Record<string, boolean> | undefined);
      const leaksCursorField = guarded && selected !== undefined && !permits(cursorKey) && !permits(field);

      const rows = await delegate().findMany({
        where,
        orderBy: [{ [field]: ascInQuery ? "asc" : "desc" }],
        take: limit + 1,
        ...projection(params.columns, params.with, [field]),
      });

      const page = cursorPage(rows, { limit, direction, hasCursor: cursorValue !== undefined, cursorField: field });

      // Cursor values are read above, so the field can go now.
      if (leaksCursorField) {
        page.data = page.data.map(row => {
          const { [field]: _cursor, ...rest } = row;
          return rest;
        });
      }

      return page as CursorResult<never>;
    },
  };
}
