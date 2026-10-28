/**
 * `@querykitjs/core/internal` — **for adapter authors only.** The driver-neutral
 * pieces every querykit adapter shares: cursor tokens, skip diagnostics, the
 * per-call repository context, sort normalization and pagination metas. Not part
 * of the application-facing API; it may change in a minor release.
 */
export { decodeCursor, encodeCursor } from "./cursor";
export { reportSkip, type Diagnostics } from "./diagnostics";
export { createContextStore, type ContextStore } from "./context";
export { normalizeSort, type NormalizedSortItem } from "./sort";
export { clampOffset, clampPage, clampPageSize, cursorPage, infinitePage, offsetMeta, type CursorPageOptions } from "./pagination";
