/**
 * Sof TS validatsiya yadrosi — **framework-agnostik**. Tekshiruv mantiqi core
 * `checkFilter`/`checkSort` da (`@querykitjs/core/internal`) — boshqa validatorlar
 * bilan bitta; bu yerda faqat yo'l satri va xabar matni quriladi.
 * `class-validator` dekoratorlari (`decorators.ts`) faqat yupqa o'rov, shuning
 * uchun yadroni Nest'siz ham (Express, Hono, oddiy funksiya) ishlatish mumkin.
 */
import { DEFAULT_MAX_FILTER_DEPTH } from "@querykitjs/core";
import type { FilterOperator } from "@querykitjs/core";
import { checkFilter, checkSort, type LimitPath, type WireFilterIssueKey, type WireIssue, type WireSortIssueKey } from "@querykitjs/core/internal";
import { formatMessage, type MessageArgs } from "./messages";
import type { QueryKitMessageKey } from "./locales";

/** Filter daraxti chuqurligi default limiti — core'dan (yagona manba, R7). */
export { DEFAULT_MAX_FILTER_DEPTH };

export interface QueryFilterOptions {
  /**
   * Berilsa — faqat shu kalitlarga ruxsat; noma'lum kalit **rad etiladi**.
   * Backend adapterlari noma'lum kalitni jimgina tashlaydi, bu qatlam esa
   * qat'iyroq: mijoz mavjud bo'lmagan maydon bo'yicha filtr yubora olmaydi.
   * Berilmasa — istalgan string kalit o'tadi (`@querykitjs/zod` bilan parity).
   */
  allowedKeys?: readonly string[];
  /** Ruxsat etilgan operatorlar. Default — core `FILTER_OPERATORS`ning hammasi. */
  allowedOperators?: readonly FilterOperator[];
  /** Ildizdan bargacha tugunlar soni (ildiz 1, har `and`/`or`/`not` va shart +1). Default — core `DEFAULT_MAX_FILTER_DEPTH` (5). */
  maxDepth?: number;
  /** Barcha guruhlardagi shartlar (barglar) soni. Default — core `DEFAULT_MAX_CONDITIONS` (30). */
  maxConditions?: number;
  /** Bitta massiv qiymatdagi elementlar (`in`, `notIn`, …). Default — core `DEFAULT_MAX_IN_ITEMS` (200). */
  maxInItems?: number;
  /** Bitta satr qiymatdagi belgilar (massiv ichida ham). Default — core `DEFAULT_MAX_STRING_LENGTH` (256). */
  maxStringLength?: number;
  /**
   * Operator↔qiymat shakli tekshiruvi (opt-in): `in`/`notIn` massiv talab qiladi,
   * `between`/`notBetween` — aynan ikki element, `isNull`/`isNotNull` — qiymatsiz.
   * Default `false`, ya'ni `@querykitjs/zod` bilan bir xil qat'iylik.
   */
  strictValue?: boolean;
  /**
   * `path`ning ildizi. Default `"filter"`. Dekorator buni DTO property nomiga
   * qo'yadi, ya'ni `where` deb nomlangan maydon xatosi `filter.operation` emas,
   * `where.operation` deb chiqadi.
   */
  rootPath?: string;
}

export interface QuerySortOptions {
  /** Berilsa — faqat shu kalitlar bo'yicha saralashga ruxsat. */
  allowedKeys?: readonly string[];
  /** `sort` massividagi maydonlar soni. Default — core `DEFAULT_MAX_SORT_FIELDS` (3). */
  maxSortFields?: number;
  /** `path`ning ildizi. Default `"sort"`. Qarang: {@link QueryFilterOptions.rootPath}. */
  rootPath?: string;
}

/** Bitta validatsiya xatosi. */
export interface ValidationIssue {
  /** Xato joyi, masalan `filter.and[1].or[0].value`. */
  path: string;
  /** i18n kaliti — iste'molchi tarjima faylida shu kalit qidiriladi. */
  key: QueryKitMessageKey;
  /** Tayyor inglizcha matn — tarjimasiz ham o'qiladi. */
  message: string;
  /** Interpolatsiya argumentlari (`path` har doim bor) — `I18nValidationPipe` uchun. */
  args: MessageArgs;
}

/* ------------------------------- internals -------------------------------- */

/** Core path → `filter.and[1].or[0].value`. */
const joinPath = (root: string, path: LimitPath): string =>
  path.reduce<string>((joined, part) => (typeof part === "number" ? `${joined}[${part}]` : `${joined}.${part}`), root);

/** A core issue as this package reports it: a string path under `root`, an English message, `path` first in the args. */
const toValidationIssue =
  (root: string) =>
  (found: WireIssue<WireFilterIssueKey | WireSortIssueKey>): ValidationIssue => {
    const path = joinPath(root, found.path);
    const args: MessageArgs = { path, ...found.args };
    return { path, key: found.key, message: formatMessage(found.key, args), args };
  };

/* -------------------------------- public ---------------------------------- */

/**
 * Filter daraxtini core kontraktiga tekshiradi. Bo'sh massiv = valid.
 *
 * @example
 * ```ts
 * const issues = validateFilter(body.filter, { allowedKeys: ["id", "name"] });
 * if (issues.length) throw new BadRequestException(issues);
 * ```
 */
export function validateFilter(value: unknown, options: QueryFilterOptions = {}): ValidationIssue[] {
  return checkFilter(value, options).map(toValidationIssue(options.rootPath ?? "filter"));
}

/**
 * Sort massivini core kontraktiga tekshiradi (`{ key, direction }[]`). Bo'sh massiv = valid.
 */
export function validateSort(value: unknown, options: QuerySortOptions = {}): ValidationIssue[] {
  return checkSort(value, options).map(toValidationIssue(options.rootPath ?? "sort"));
}
