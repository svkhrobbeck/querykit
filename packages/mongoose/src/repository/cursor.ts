import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursor } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { castValue, resolveField } from "../internal/fields";
import type { Query } from "../internal/where";
import type { AnyQuery, RepoContext } from "./context";

/** `findCursor` — keyset pagination on one field. */
export function cursorMethods<TDoc>(ctx: RepoContext<TDoc>) {
  const { runtime, m, diag, guarded, permits, projection, composeWhere, applyPopulate, attachSession } = ctx;

  return {
    async findCursor(params: CursorParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(m, cursorKey);
      // Always fatal: without a usable cursor field there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (both adapters agree).
      if (!field) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      const decoded = decodeCursor(params.cursor);
      const cursorValue = decoded !== undefined ? castValue(m, field, decoded) : undefined;
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const seek: Query | undefined = cursorValue !== undefined ? { [field]: ascInQuery ? { $gt: cursorValue } : { $lt: cursorValue } } : undefined;
      const where: Query = seek ? (Object.keys(baseWhere).length ? { $and: [baseWhere, seek] } : seek) : baseWhere;

      // Force-include the cursor field in the projection so next/prev tokens work.
      // `cursorKey` is client-supplied, so under a projection guard this would be
      // a way to read a forbidden field: keep it in the query (pagination needs
      // it) but strip it from the documents we hand back.
      const selected = projection(params.columns);
      const proj = selected ? { ...selected, [field]: 1 } : undefined;
      const leaksCursorField = guarded && selected !== undefined && !permits(cursorKey) && !permits(field);

      let q: AnyQuery = m
        .find(where, proj)
        .sort({ [field]: ascInQuery ? 1 : -1 })
        .limit(limit + 1);
      q = applyPopulate(q, params.with);
      const rows = (await attachSession(q).lean().exec()) as Record<string, unknown>[];

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
