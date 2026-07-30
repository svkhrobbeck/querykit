/**
 * `@querykitjs/core` — querykit oilasi uchun umumiy, ORM-agnostik query DSL va
 * **yagona manba**:
 *
 * - filter tiplari + `createFilters` builder (`filters.ts`, `types.ts`);
 * - operatorlar va ularning tasnifi (`FILTER_OPERATORS`, `TEXT_FILTER_OPERATORS`);
 * - wire (JSON) param shakllari — `Wire{Base,Offset,Infinite,Cursor}Params` — va
 *   `LooseKey`, ya'ni validatsiyalangan payload repo'ga cast'siz tushadi;
 * - paginatsiya default'lari **va chegaralari** (`DEFAULT_PER_PAGE`,
 *   `DEFAULT_MAX_PER_PAGE`, …) — zod factory'lari, ikkala backend va frontend
 *   shu bitta qiymatga tayanadi;
 * - skip diagnostikasi (`SkippedCondition`) va `QueryKitError` — ikkala backend
 *   bir xil xato/hookni beradi;
 * - wire-meta shakllari (server javobi, snake_case).
 *
 * Bevosita ishlatilmaydi; `@querykitjs/drizzle-pg` / `@querykitjs/mongoose`
 * (backend), `@querykitjs/zod` (validatsiya) va `@querykitjs/web` (frontend) shu
 * paketga tayanadi — shuning uchun ular kontrakt bo'yicha bir-biridan uzoqlashib
 * ketolmaydi.
 */
export { createFilters, f } from "./filters";
export * from "./defaults";
export * from "./errors";
export * from "./operators";
export * from "./types";
