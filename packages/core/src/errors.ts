/**
 * querykit xatolari. Backend adapterlari (`drizzle-pg`, `mongoose`) `strict`
 * rejimda shu bitta klassni tashlaydi — ya'ni ikkala backend uchun xatoni
 * ushlash usuli bir xil.
 */
import type { SkippedCondition } from "./types";

/**
 * `strict` rejimda noto'g'ri so'rov shartida tashlanadi (noma'lum kalit yoki
 * operatorga mos kelmagan qiymat). Backend'da 400 qilib qaytarish uchun:
 *
 * ```ts
 * try {
 *   return await usersRepository.findList(params);
 * } catch (err) {
 *   if (err instanceof QueryKitError) return c.json({ error: err.message }, 400);
 *   throw err;
 * }
 * ```
 */
export class QueryKitError extends Error {
  /** Barqaror kod — `instanceof` ishlamaydigan chegaralarda (RPC, worker) tekshirish uchun. */
  readonly code = "QUERYKIT_INVALID_CONDITION";

  /** Tashlab yuborilgan shart haqida to'liq ma'lumot (hook argumenti bilan bir xil shakl). */
  readonly info: SkippedCondition;

  constructor(info: SkippedCondition) {
    super(`querykit: ${info.reason} — "${info.key}" (${info.site}) on "${info.source}".`);
    this.name = "QueryKitError";
    this.info = info;
  }
}
