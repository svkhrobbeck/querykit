/**
 * `@querykitjs/core` — querykit oilasi uchun umumiy, ORM-agnostik query DSL:
 * filter tiplari, operatorlar, `createFilters` builder va wire-meta shakllari.
 *
 * Bevosita ishlatilmaydi; `@querykitjs/drizzle-pg` (backend) va `@querykitjs/web`
 * (frontend) shu paketga tayanadi.
 */
export { createFilters, f } from "./filters";
export * from "./defaults";
export * from "./operators";
export * from "./types";
