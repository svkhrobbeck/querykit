/**
 * Xabar formatlash. Kataloglar `locales.ts`da; `formatMessage` core'da
 * (boshqa validatorlar bilan bitta), bu yerda faqat `localizeIssue`.
 *
 * Har bir {@link ValidationIssue} uchta narsani olib yuradi: `key` (tarjima
 * kaliti), `message` (tayyor matn) va `args` (interpolatsiya qiymatlari). Shu
 * sababli paket i18n'ga **majburlamaydi**, lekin unga to'liq mos.
 */
import { formatMessage, type MessageArgs, type QueryKitMessageCatalog, type QueryKitMessageKey } from "@querykitjs/core/internal";

/** Kalitni matnga aylantirish va argument tipi — core'dan (`formatMessage(key, args, catalog)`, default inglizcha). */
export { formatMessage };
export type { MessageArgs };

/**
 * Issue'ni tanlangan tilda qayta formatlaydi — `message` inglizcha yozilgan
 * bo'lsa ham, javobni boshqa tilda berish uchun.
 *
 * @example
 * ```ts
 * issues.map(issue => localizeIssue(issue, QUERYKIT_MESSAGES_RU));
 * ```
 */
export function localizeIssue(issue: { key: QueryKitMessageKey; args: MessageArgs }, catalog: QueryKitMessageCatalog): string {
  return formatMessage(issue.key, issue.args, catalog);
}
