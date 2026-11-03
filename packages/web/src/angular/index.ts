/**
 * `@querykitjs/web/angular` — Angular signals (peers `@angular/core`, `rxjs`; `injectListParams`
 * also peers `@angular/router`, v21 / v22). Plain functions: no decorator, no Angular compilation.
 *
 * @example
 * ```ts
 * import { injectListParams } from "@querykitjs/web/angular";       // Angular Router
 * import { injectListParamsBase } from "@querykitjs/web/angular";   // bring your own searchParams signal
 * ```
 */
export { injectListParams, type InjectListParamsOptions } from "./inject-list-params";
export { injectListParamsBase, type InjectListParamsBaseOptions, type InjectListParamsResult } from "./inject-list-params-base";
