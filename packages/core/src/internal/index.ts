/**
 * `@querykitjs/core/internal` — **for adapter and validator authors only.** The
 * driver-neutral pieces the querykit packages share: cursor tokens, skip
 * diagnostics, the per-call repository context, sort normalization, pagination
 * metas, the request-limit walk and the request policy. Not part of the application-facing API; it
 * may change in a minor release.
 */
export { decodeCursor, encodeCursor } from "./cursor";
export { reportSkip, type Diagnostics } from "./diagnostics";
export { createContextStore, type ContextStore } from "./context";
export { normalizeSort, type NormalizedSortItem } from "./sort";
export { clampOffset, clampPage, clampPageSize, cursorPage, infinitePage, offsetMeta, type CursorPageOptions } from "./pagination";
export { findFilterLimitViolation, formatLimit, offsetOf, type FilterLimits, type LimitPath, type LimitViolation } from "./limits";
export { resolvePolicy, type Policy, type PolicyOptions } from "./policy";
