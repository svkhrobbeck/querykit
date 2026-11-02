import type { Document } from "mongodb";
import { reportSkip } from "@querykitjs/core/internal";

import type { AggregateRow, AggregateSpec } from "../types";
import { resolveField } from "../internal/fields";
import { toArr, type RepoContext } from "./context";

/** `aggregate` as one `$match` + `$group` pipeline; values in `$match` are already cast by the filter compiler. */
export function aggregateMethods<TDoc extends Document>(ctx: RepoContext<TDoc>) {
  const { collection, shape, diag, permits, policy, composeWhere, timed } = ctx;

  const aggregable = (key: string) => {
    const field = permits(key) ? resolveField(shape, key) : undefined;
    if (!field) reportSkip(diag, { site: "aggregate", key, reason: "unknown-key" });
    return field;
  };

  return {
    async aggregate(spec: AggregateSpec<TDoc>) {
      policy.checkFilter(spec.filter);
      for (const key of [spec.groupBy, spec.sum, spec.avg, spec.min, spec.max].flatMap(value => toArr(value as string | string[] | undefined)))
        policy.checkAggregateKey(key);
      const groupKeys = (toArr(spec.groupBy) as string[]).filter(key => Boolean(aggregable(key)));
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

      const pipeline = [{ $match: composeWhere(spec.filter, spec.withDeleted) }, { $group: group }];
      const rows = await timed(options => collection.aggregate<Record<string, unknown>>(pipeline, options).toArray());
      return rows.map(({ _id, ...rest }) => ({ ...(typeof _id === "object" && _id ? _id : {}), ...rest })) as AggregateRow[];
    },
  };
}
