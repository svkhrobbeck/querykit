/**
 * `@querykitjs/class-validator` — querykit so'rov kontraktini (filter/sort/
 * pagination) tekshiruvchi **class-validator** dekoratorlari va DTO'lari.
 * Operatorlar `@querykitjs/core`ning `FILTER_OPERATORS` manbasidan olinadi;
 * DTO chiqishi core'ning wire tiplariga **mos** (assignable) — validatsiyalangan
 * payload'ni to'g'ridan-to'g'ri querykit repository'siga uzatasiz.
 *
 * NestJS (`ValidationPipe`, `I18nValidationPipe`) uchun mo'ljallangan, lekin
 * yadro (`validateFilter` / `validateSort`) framework-agnostik.
 */

/* ------------------------------- messages --------------------------------- */
export { formatMessage, localizeIssue } from "./messages";
export type { MessageArgs } from "./messages";

export { QUERYKIT_LOCALES, QUERYKIT_MESSAGES_EN, QUERYKIT_MESSAGES_RU, QUERYKIT_MESSAGES_UZ } from "./locales";
export type { QueryKitLocale, QueryKitMessageCatalog, QueryKitMessageKey } from "./locales";

/* --------------------------------- core ----------------------------------- */
export { DEFAULT_MAX_FILTER_DEPTH, validateFilter, validateSort } from "./validate";
export type { QueryFilterOptions, QuerySortOptions, ValidationIssue } from "./validate";
