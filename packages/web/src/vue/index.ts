/**
 * `@querykitjs/web/vue` — Vue 3 composables (peer `vue`; `useListParams` also peers
 * `vue-router` 4 / 5).
 *
 * @example
 * ```ts
 * import { useListParams } from "@querykitjs/web/vue";       // vue-router
 * import { useListParamsBase } from "@querykitjs/web/vue";   // bring your own searchParams
 * ```
 */
export { useListParams, type UseListParamsOptions } from "./use-list-params";
export { useListParamsBase, type UseListParamsBaseOptions, type UseListParamsResult } from "./use-list-params-base";
