/**
 * `@querykitjs/core/internal` — **for adapter and validator authors only.** The
 * driver-neutral pieces the querykit packages share: cursor tokens, skip
 * diagnostics, the per-call repository context, sort normalization, pagination
 * metas, the request-limit walk, the request policy, the bulk-mutation guards and the wire-contract
 * checks (filter, sort, params) the validators share. Not part of the application-facing API; it
 * may change in a minor release.
 */
export { decodeCursor, decodeCursorToken, encodeCursor, encodeCursorToken, type CursorToken } from "./cursor";
export { reportSkip, type Diagnostics } from "./diagnostics";
export { createContextStore, type ContextStore } from "./context";
export { normalizeSort, type NormalizedSortItem } from "./sort";
export { clampOffset, clampPage, clampPageSize, cursorPage, infinitePage, offsetMeta, offsetPageWithoutTotal, type CursorPageOptions } from "./pagination";
export { isAllRows, isEmptyFilter, refuseEmptyFilter } from "./mutation";
export { scopeConditions, scopeDefaults, type ScopeCondition } from "./scope";
export { checkWith, type WithDialect } from "./with";
export {
  findFilterLimitViolation,
  formatLimit,
  isLikeOperator,
  likeWildcards,
  offsetOf,
  type FilterLimits,
  type LimitPath,
  type LimitViolation,
} from "./limits";
export { resolvePolicy, type Policy, type PolicyOptions } from "./policy";
export {
  checkFilter,
  checkParams,
  checkSort,
  type WireFilterIssueKey,
  type WireFilterOptions,
  type WireIssue,
  type WireIssueArgs,
  type WireIssueKey,
  type WireParamsIssueKey,
  type WireParamsKind,
  type WireParamsOptions,
  type WireParamsResult,
  type WireServerOwnedField,
  type WireSortIssueKey,
  type WireSortOptions,
} from "./wire-checks";
export { isRaw } from "../raw";
export {
  QUERYKIT_MESSAGES_EN,
  QUERYKIT_PARAMS_MESSAGES_EN,
  formatMessage,
  interpolate,
  type MessageArgs,
  type QueryKitMessageCatalog,
  type QueryKitMessageKey,
} from "./messages";
