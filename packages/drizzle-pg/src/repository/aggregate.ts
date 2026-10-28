import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { reportSkip } from "@querykitjs/core/internal";

import type { AggregateRow, AggregateSpec } from "../types";
import { resolveColumn } from "../internal/columns";
import { toArray, type RepoContext } from "./context";

/** `aggregate` — `count`/`sum`/`avg`/`min`/`max`, optionally grouped. */
export function aggregateMethods<TTable extends AnyPgTable>(ctx: RepoContext<TTable>) {
  const { table, diag, executor, composeWhere } = ctx;
  const { permits } = ctx.projection;

  // An aggregate spec can also come from a request, and `min(password)` or a
  // `groupBy` on a hidden column leaks just as much as a projection — so the
  // same guard applies here.
  const aggregable = (key: string) => {
    const column = permits(key) ? resolveColumn(table, key) : undefined;
    if (!column) reportSkip(diag, { site: "aggregate", key, reason: "unknown-key" });
    return column;
  };

  return {
    async aggregate(spec: AggregateSpec<TTable>): Promise<AggregateRow[]> {
      const groupKeys = toArray(spec.groupBy).filter(key => Boolean(aggregable(key)));
      const selection: Record<string, SQL | AnyPgColumn> = {};

      for (const key of groupKeys) {
        const column = aggregable(key);
        if (column) selection[key] = column;
      }
      if (spec.count) selection.count = sql<number>`count(*)`.mapWith(Number);
      for (const key of toArray(spec.sum)) {
        const c = aggregable(key);
        if (c) selection[`sum_${key}`] = sql<number>`sum(${c})`.mapWith(Number);
      }
      for (const key of toArray(spec.avg)) {
        const c = aggregable(key);
        if (c) selection[`avg_${key}`] = sql<number>`avg(${c})`.mapWith(Number);
      }
      for (const key of toArray(spec.min)) {
        const c = aggregable(key);
        if (c) selection[`min_${key}`] = sql`min(${c})`;
      }
      for (const key of toArray(spec.max)) {
        const c = aggregable(key);
        if (c) selection[`max_${key}`] = sql`max(${c})`;
      }

      let query = executor()
        .select(selection as never)
        .from(table as AnyPgTable)
        .$dynamic();
      const where = composeWhere(spec.filter, spec.withDeleted);
      if (where) query = query.where(where);
      const groupColumns = groupKeys.map(key => aggregable(key)).filter((c): c is AnyPgColumn => Boolean(c));
      if (groupColumns.length) query = query.groupBy(...groupColumns);

      return (await query) as AggregateRow[];
    },
  };
}
