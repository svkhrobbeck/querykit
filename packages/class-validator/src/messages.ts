/**
 * Xabar formatlash. Kataloglarning o'zi `locales.ts`da — bu fayl faqat
 * `{placeholder}` interpolatsiyasini biladi va hech qanday tilga bog'lanmagan.
 *
 * Har bir {@link ValidationIssue} uchta narsani olib yuradi: `key` (tarjima
 * kaliti), `message` (tayyor matn) va `args` (interpolatsiya qiymatlari). Shu
 * sababli paket i18n'ga **majburlamaydi**, lekin unga to'liq mos.
 */
import { QUERYKIT_MESSAGES_EN, type QueryKitMessageCatalog, type QueryKitMessageKey } from "./locales";

/** Shablon interpolatsiyasi argumentlari — `I18nValidationPipe`ga ham shu shaklda uzatiladi. */
export type MessageArgs = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Kalitni matnga aylantiradi: katalogdan shablon olinadi va `{placeholder}` lar
 * `args` bilan almashtiriladi. Mos argument topilmasa placeholder o'z holicha
 * qoladi — xabar hech qachon bo'sh chiqmaydi.
 *
 * @param catalog Til katalogi. Default — inglizcha; `QUERYKIT_MESSAGES_UZ`,
 *   `QUERYKIT_MESSAGES_RU` yoki o'zingizniki uzatilishi mumkin.
 *
 * @example
 * ```ts
 * formatMessage(issue.key, issue.args, QUERYKIT_MESSAGES_UZ);
 * ```
 */
export function formatMessage(key: QueryKitMessageKey, args: MessageArgs = {}, catalog: QueryKitMessageCatalog = QUERYKIT_MESSAGES_EN): string {
  return catalog[key].replace(PLACEHOLDER, (match, name: string) => {
    const value = args[name];
    return value === undefined ? match : String(value);
  });
}

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
