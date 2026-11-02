import type { SkipReason, SkippedCondition, SkipSite } from "@querykitjs/core";

/**
 * The `QueryKitError.info` shape a backend may put in its 400 response body. The
 * response envelope is the project's own; web only types this part.
 */
export type QueryKitErrorBody = Pick<SkippedCondition, "site" | "key" | "reason"> & Partial<Pick<SkippedCondition, "source" | "operation">>;

/* Records keyed by the core unions: a new core reason or site fails the typecheck here until it is listed. */
const REASONS: Record<SkipReason, true> = {
  "unknown-key": true,
  "invalid-value": true,
  "forbidden-key": true,
  "forbidden-operator": true,
  "limit-exceeded": true,
  "empty-filter": true,
};
const SITES: Record<SkipSite, true> = { filter: true, sort: true, cursorKey: true, aggregate: true, page: true, mutation: true, with: true };

const isMember = <K extends string>(table: Record<K, true>, value: unknown): value is K => typeof value === "string" && Object.hasOwn(table, value);

/**
 * Is `body` a querykit error (`reason`, `site`, `key`)? Lets the frontend tell a
 * rejected query (forbidden key, limit exceeded, …) from any other 400.
 *
 * @example
 * ```ts
 * const body = error.response?.data?.error;
 * if (isQueryKitError(body) && body.reason === "forbidden-key") showFieldError(body.key);
 * ```
 */
export function isQueryKitError(body: unknown): body is QueryKitErrorBody {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return isMember(REASONS, candidate.reason) && isMember(SITES, candidate.site) && typeof candidate.key === "string";
}
