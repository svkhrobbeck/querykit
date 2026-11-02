import { reportSkip } from "@querykitjs/core/internal";

import type { AggregateRow, AggregateSpec, Filter } from "../types";
import { resolveField } from "../internal/fields";
import { toArray, type RepoContext } from "./context";

/** Flatten Prisma's `{_count, _sum: {x}}` into drizzle's `{count, sum_x}` shape. */
function flatten(row: Record<string, unknown>): AggregateRow {
  const out: AggregateRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("_")) {
      out[key] = value;
      continue;
    }
    if (key === "_count") {
      if (typeof value === "number") out.count = value;
      continue;
    }
    const prefix = key.slice(1); // "_sum" → "sum"
    for (const [field, aggregated] of Object.entries((value ?? {}) as Record<string, unknown>)) {
      if (aggregated !== undefined) out[`${prefix}_${field}`] = aggregated;
    }
  }
  return out;
}

/** `aggregate` — `_count`/`_sum`/`_avg`/`_min`/`_max`, optionally `groupBy`. */
export function aggregateMethods<TDelegate>(ctx: RepoContext<TDelegate>) {
  const { meta, diag, delegate, permits, policy, composeWhere } = ctx;

  // An aggregate spec can also come from a request, and `min(password)` or a
  // `groupBy` on a hidden field leaks just as much as a projection — so the
  // same guard applies here (matching drizzle-pg and mongoose).
  const aggregable = (key: string): string | undefined => {
    const field = permits(key) ? resolveField(meta, key) : undefined;
    if (!field) reportSkip(diag, { site: "aggregate", key, reason: "unknown-key" });
    return field;
  };

  const selectionFor = (keys: string[]): Record<string, true> | undefined => {
    const picked: Record<string, true> = {};
    for (const key of keys) {
      const field = aggregable(key);
      if (field) picked[field] = true;
    }
    return Object.keys(picked).length ? picked : undefined;
  };

  return {
    async aggregate(spec: AggregateSpec<TDelegate>): Promise<AggregateRow[]> {
      // `groupBy` or `max(secret)` reads a field as surely as a filter does.
      policy.checkFilter(spec.filter);
      for (const key of [spec.groupBy, spec.sum, spec.avg, spec.min, spec.max].flatMap(value => toArray(value as string | string[] | undefined)))
        policy.checkAggregateKey(key);
      const groupFields = toArray(spec.groupBy as string | string[] | undefined)
        .map(aggregable)
        .filter((field): field is string => Boolean(field));

      const sum = selectionFor(toArray(spec.sum as string | string[] | undefined));
      const avg = selectionFor(toArray(spec.avg as string | string[] | undefined));
      const min = selectionFor(toArray(spec.min as string | string[] | undefined));
      const max = selectionFor(toArray(spec.max as string | string[] | undefined));

      const args: Record<string, unknown> = { where: composeWhere(spec.filter as Filter<TDelegate> | undefined, spec.withDeleted) };
      if (spec.count) args._count = true;
      if (sum) args._sum = sum;
      if (avg) args._avg = avg;
      if (min) args._min = min;
      if (max) args._max = max;

      if (groupFields.length > 0) {
        const rows = await delegate().groupBy({ ...args, by: groupFields });
        return rows.map(flatten);
      }
      return [flatten(await delegate().aggregate(args))];
    },
  };
}
