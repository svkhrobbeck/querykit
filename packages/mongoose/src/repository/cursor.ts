import { QueryKitError } from "@querykitjs/core";
import { clampPageSize, cursorPage, decodeCursorToken } from "@querykitjs/core/internal";

import type { CursorParams, CursorResult, SortDirection } from "../types";
import { resolveField } from "../internal/fields";
import { castForPath, INVALID_VALUE } from "../internal/coerce";
import type { Query } from "../internal/where";
import type { AnyQuery, RepoContext } from "./context";

/** `findCursor` — keyset pagination on one field. */
export function cursorMethods<TDoc>(ctx: RepoContext<TDoc>) {
  const { runtime, m, diag, guarded, permits, projection, policy, withOf, composeWhere, applyPopulate, attachSession } = ctx;

  return {
    async findCursor(params: CursorParams<TDoc> = {}) {
      const limit = clampPageSize(params.limit, runtime.defaultLimit, runtime.maxLimit);
      const cursorKey = (params.cursorKey ?? "id") as string;
      policy.checkFilter(params.filter);
      // The default `id` is the server's choice; a client-sent key must be sortable.
      if (params.cursorKey !== undefined) policy.checkCursorKey(cursorKey);
      const order: SortDirection = params.order ?? "asc";
      const direction = params.direction ?? "forward";

      const field = resolveField(m, cursorKey);
      // Always fatal: without a usable cursor field there is no pagination to
      // fall back to. Reported as a `QueryKitError` so the backend maps it to a
      // 400 the same way as any other bad condition (both adapters agree).
      if (!field) throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "unknown-key" });

      // The token carries the cursor value and _id (tie-break), both cast
      // to their path's type; a token that does not fit is invalid-value.
      const token = await decodeCursorToken(params.cursor, { source: diag.source, secret: runtime.cursorSecret, key: cursorKey });
      const cursorValue = token === undefined ? undefined : castForPath(m, field, token.k);
      const idValue = token === undefined ? undefined : castForPath(m, "_id", token.id);
      if (cursorValue === INVALID_VALUE || idValue === INVALID_VALUE) {
        throw new QueryKitError({ source: diag.source, site: "cursorKey", key: cursorKey, reason: "invalid-value" });
      }
      const baseWhere = composeWhere(params.filter, params.withDeleted);

      const ascInQuery = direction === "forward" ? order === "asc" : order === "desc";
      const past = ascInQuery ? "$gt" : "$lt";
      // (k > v) OR (k = v AND _id > i); an _id cursor needs no tie-break.
      const tieBreak = field !== "_id";
      const seek: Query | undefined =
        token === undefined
          ? undefined
          : tieBreak
            ? { $or: [{ [field]: { [past]: cursorValue } }, { [field]: cursorValue, _id: { [past]: idValue } }] }
            : { [field]: { [past]: cursorValue } };
      const where: Query = seek ? (Object.keys(baseWhere).length ? { $and: [baseWhere, seek] } : seek) : baseWhere;

      // Force-include the cursor field in the projection so next/prev tokens work.
      // `cursorKey` is client-supplied, so under a projection guard this would be
      // a way to read a forbidden field: keep it in the query (pagination needs
      // it) but strip it from the documents we hand back.
      const selected = projection(params.columns);
      // `_id` too: an exact selection carries `_id: 0`, and the token needs it for the tie-break.
      const proj = selected ? { ...selected, [field]: 1, _id: 1 } : undefined;
      // Stripped from the rows afterwards: under a projection guard the cursor / tie-break
      // keys the caller may not see; always the tie-break key added only for the token.
      const picked = (key: string) => selected !== undefined && Boolean((selected as Record<string, unknown>)[key]);
      const hidden =
        selected === undefined
          ? []
          : [field, "_id"].filter(key => (guarded && (!permits(key) || !picked(key))) || (key === "_id" && key !== field && !picked(key)));

      let q: AnyQuery = m
        .find(where, proj)
        .sort(tieBreak ? { [field]: ascInQuery ? 1 : -1, _id: ascInQuery ? 1 : -1 } : { [field]: ascInQuery ? 1 : -1 })
        .limit(limit + 1);
      q = applyPopulate(q, withOf(params.with));
      const rows = (await attachSession(q).lean().exec()) as Record<string, unknown>[];

      const page = await cursorPage(rows, {
        limit,
        direction,
        hasCursor: token !== undefined,
        cursorField: field,
        idField: "_id",
        secret: runtime.cursorSecret,
      });

      // Token values are read above, so the hidden fields can go now.
      if (hidden.length > 0) {
        page.data = page.data.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.includes(key))));
      }

      return page as CursorResult<never>;
    },
  };
}
