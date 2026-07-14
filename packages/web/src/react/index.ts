/**
 * `@querykitjs/web/react` — React hooks (peer `react`; `useListParams` also peers
 * `react-router-dom`).
 *
 * @example
 * ```tsx
 * import { useListParams } from "@querykitjs/web/react";       // react-router-dom
 * import { useListParamsBase } from "@querykitjs/web/react";   // bring your own searchParams
 * ```
 */
export { useListParams, type UseListParamsOptions } from "./use-list-params";
export { useListParamsBase, type UseListParamsBaseOptions, type UseListParamsResult } from "./use-list-params-base";
