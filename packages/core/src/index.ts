/**
 * `@querykit/core` — querykit oilasi uchun umumiy, ORM-agnostik query DSL:
 * filter tiplari, operatorlar, `createFilters` builder va wire-meta shakllari.
 *
 * Bevosita ishlatilmaydi; `@querykit/drizzle-pg` (backend) va `@querykit/web`
 * (frontend) shu paketga tayanadi.
 */
export { createFilters, f } from "./filters";
export * from "./operators";
export * from "./types";
