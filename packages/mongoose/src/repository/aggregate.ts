import { reportSkip } from "@querykitjs/core/internal";

import type { AggregateRow, AggregateSpec } from "../types";
import { resolveField } from "../internal/fields";
import { toArr, type RepoContext } from "./context";

/** `aggregate` — `$match` + `$group` with `count`/`$sum`/`$avg`/`$min`/`$max`. */
export function aggregateMethods<TDoc>(ctx: RepoContext<TDoc>) {
  const { runtime, m, diag, permits, policy, composeWhere } = ctx;

  // An aggregate spec can also come from a request, and `min(password)` or a
  // `groupBy` on a hidden field leaks just as much as a projection — so the
  // same guard applies here (matching the drizzle-pg adapter).
  const aggregable = (key: string) => {
    const field = permits(key) ? resolveField(m, key) : undefined;
    if (!field) reportSkip(diag, { site: "aggregate", key, reason: "unknown-key" });
    return field;
  };

  /**
   * Aggregate `$match` doesn't auto-cast values the way `find()` does; cast the
   * filter against the schema so wire strings (dates / ObjectIds) become proper
   * BSON types — keeping aggregate filters consistent with reads.
   */
  const castMatch = (rawMatch: Record<string, unknown>): Record<string, unknown> => {
    try {
      const q = m.find(rawMatch);
      q.cast(m);
      return q.getFilter();
    } catch {
      return rawMatch; // fall back to the uncast filter
    }
  };

  return {
    async aggregate(spec: AggregateSpec<TDoc>) {
      // `$group` or `$max` on a hidden path reads it as surely as a filter does.
      policy.checkFilter(spec.filter);
      for (const key of [spec.groupBy, spec.sum, spec.avg, spec.min, spec.max].flatMap(value =>
        value === undefined ? [] : Array.isArray(value) ? value : [value],
      ))
        policy.checkAggregateKey(key as string);
      const groupKeys = (toArr(spec.groupBy) as string[]).filter(key => Boolean(aggregable(key)));
      const match = castMatch(composeWhere(spec.filter, spec.withDeleted));
      const groupId = groupKeys.length ? Object.fromEntries(groupKeys.map(k => [k, `$${aggregable(k) ?? k}`])) : null;
      const group: Record<string, unknown> = { _id: groupId };
      if (spec.count) group.count = { $sum: 1 };
      const addAgg = (op: "$sum" | "$avg" | "$min" | "$max", keys: string[], prefix: string) => {
        for (const k of keys) {
          const field = aggregable(k);
          if (field) group[`${prefix}_${k}`] = { [op]: `$${field}` };
        }
      };
      addAgg("$sum", toArr(spec.sum) as string[], "sum");
      addAgg("$avg", toArr(spec.avg) as string[], "avg");
      addAgg("$min", toArr(spec.min) as string[], "min");
      addAgg("$max", toArr(spec.max) as string[], "max");

      let agg = m.aggregate([{ $match: match }, { $group: group }] as never);
      const session = runtime.getSession();
      if (session) agg = agg.session(session);
      const rows = (await agg.exec()) as Record<string, unknown>[];
      // Flatten the group `_id` fields back into each row (matches drizzle's shape).
      return rows.map(({ _id, ...rest }) => ({ ...(typeof _id === "object" && _id ? _id : {}), ...rest })) as AggregateRow[];
    },
  };
}
