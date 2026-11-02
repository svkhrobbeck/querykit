import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursorToken } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { resolveField } from "../internal/fields";
import { castForField, INVALID_VALUE } from "../internal/coerce";
import { pickColumns } from "../internal/projection";
import { andWhere, type Where } from "../internal/where";
import type { RepoContext } from "./context";

/** `findCursor` — keyset pagination on one field. */
export function cursorMethods<TDelegate>(ctx: RepoContext<TDelegate>) {
  const { runtime, meta, diag, delegate, guard, guarded, permits, projection, policy, withOf, composeWhere } = ctx;

  return {
    async findCursor(params: CursorParams<TDelegate> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      policy.checkFilter(params.filter);
      // The default `id` is the server's choice; a client-sent key must be sortable.
      if (params.cursorKey !== undefined) policy.checkCursorKey(cursorKey);
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(meta, cursorKey);
      // Always fatal: without a usable cursor field there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (all three adapters agree).
      if (!field) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // Task 012: the token carries the cursor value and the primary key (tie-break),
      // both re-cast to their field's type (ISO string → Date, else Prisma rejects
      // `gt(dateTimeField, "2026-…")`); a token that does not fit is invalid-value.
      const idField = meta.idField ?? "id";
      const token = await decodeCursorToken(params.cursor, { source: diag.source, secret: runtime.cursorSecret, key: cursorKey });
      const cursorValue = token === undefined ? undefined : castForField(meta, field, token.k);
      const idValue = token === undefined ? undefined : castForField(meta, idField, token.id);
      if (cursorValue === INVALID_VALUE || idValue === INVALID_VALUE) {
        throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "invalid-value" });
      }
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      // Keyset via WHERE (not Prisma's native `cursor`+`skip`) so the token stays
      // interchangeable with the drizzle-pg and mongoose adapters.
      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const past = ascInQuery ? "gt" : "lt";
      // (k > v) OR (k = v AND id > i); a primary-key cursor needs no tie-break.
      const tieBreak = field !== idField;
      const seek: Where | undefined =
        token === undefined
          ? undefined
          : tieBreak
            ? { OR: [{ [field]: { [past]: cursorValue } }, { AND: [{ [field]: { equals: cursorValue } }, { [idField]: { [past]: idValue } }] }] }
            : { [field]: { [past]: cursorValue } };
      const where = andWhere([baseWhere, seek]);

      // Force-include the cursor field when a selection is given — otherwise its
      // value is missing and next/prev tokens break. `cursorKey` is
      // client-supplied, so under a projection guard this would be a way to read
      // a forbidden field: keep it in the query (pagination needs it) but strip
      // it from the rows we hand back.
      const selected = pickColumns(guard, params.columns as Record<string, boolean> | undefined);
      // Stripped from the rows afterwards: under a projection guard the cursor / tie-break
      // keys the caller may not see; always the tie-break key added only for the token.
      const hidden =
        selected === undefined
          ? []
          : [field, idField].filter(
              key => (guarded && (!permits(key) || !selected.includes(key))) || (key === idField && key !== field && !selected.includes(key)),
            );

      const rows = await delegate().findMany({
        where,
        orderBy: tieBreak ? [{ [field]: ascInQuery ? "asc" : "desc" }, { [idField]: ascInQuery ? "asc" : "desc" }] : [{ [field]: ascInQuery ? "asc" : "desc" }],
        take: limit + 1,
        ...projection(params.columns, withOf(params.with), [field, idField]),
      });

      const page = await cursorPage(rows, { limit, direction, hasCursor: token !== undefined, cursorField: field, idField, secret: runtime.cursorSecret });

      // Token values are read above, so the hidden fields can go now.
      if (hidden.length > 0) {
        page.data = page.data.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.includes(key))));
      }

      return page as CursorResult<never>;
    },
  };
}
