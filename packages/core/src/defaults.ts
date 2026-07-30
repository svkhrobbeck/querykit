/**
 * Umumiy pagination default'lari — yagona manba. Backend adapter (`createRegistry`
 * options) va frontend (`createQuery` config) shu qiymatlarni fallback sifatida
 * ishlatadi, shuning uchun ular hech qachon bir-biridan farq qilmaydi.
 */

/** Offset (list) sahifa o'lchami default'i. */
export const DEFAULT_PER_PAGE = 20;

/** Infinite/cursor `limit` default'i. */
export const DEFAULT_LIMIT = 20;

/**
 * `perPage` uchun yuqori chegara — cap'siz paginatsiya DoS yuzasi. Validatsiya
 * (`@querykitjs/zod` factory'lari), backend repositorylari va frontend `createQuery`
 * shu bitta qiymatga tayanadi, shuning uchun ular hech qachon farq qilmaydi.
 */
export const DEFAULT_MAX_PER_PAGE = 200;

/** Infinite/cursor `limit` uchun yuqori chegara. Qarang: {@link DEFAULT_MAX_PER_PAGE}. */
export const DEFAULT_MAX_LIMIT = 200;
