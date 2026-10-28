/**
 * Sof TS validatsiya yadrosi — **framework-agnostik**. Butun rekursiya va qaror
 * mantiqi shu yerda; `class-validator` dekoratorlari (`decorators.ts`) faqat
 * yupqa o'rov. Shu sababli yadroni Nest'siz ham (Express, Hono, oddiy funksiya)
 * ishlatish mumkin va uni test qilish uchun dekorator mashinasi kerak emas.
 *
 * Kontrakt manbasi — `@querykitjs/core`: operatorlar `FILTER_OPERATORS`dan,
 * daraxt shakli esa `Filter`/`FilterNode`/`FieldCondition` tiplaridan.
 */
import { DEFAULT_MAX_FILTER_DEPTH, FILTER_OPERATORS, resolveLimits } from "@querykitjs/core";
import type { FilterOperator } from "@querykitjs/core";
import { findFilterLimitViolation, type LimitPath } from "@querykitjs/core/internal";
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

const ALL_OPERATORS: ReadonlySet<string> = new Set<string>(FILTER_OPERATORS);

/* `strictValue` uchun operator tasnifi. */
const ARRAY_OPERATORS: ReadonlySet<string> = new Set(["in", "notIn"]);
const TUPLE_OPERATORS: ReadonlySet<string> = new Set(["between", "notBetween"]);
const NULLARY_OPERATORS: ReadonlySet<string> = new Set(["isNull", "isNotNull"]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Wire skalyari — `Date`siz (JSON'da sana ISO string bo'ladi) va `NaN`/`Infinity`siz
 * (ikkalasi ham JSON'da mavjud emas va SQL/Mongo'ga tushsa xato beradi).
 */
const isScalar = (value: unknown): boolean =>
  value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const isFilterValue = (value: unknown): boolean => (Array.isArray(value) ? value.every(isScalar) : isScalar(value));

/** Xabarga qo'yish uchun xavfsiz matn — kirish ishonchsiz, `String()` yiqilishi mumkin. */
const label = (value: unknown): string => {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

/** Core walk'ining yo'li → `filter.and[1].or[0].value` shakli. */
const joinPath = (root: string, path: LimitPath): string =>
  path.reduce<string>((joined, part) => (typeof part === "number" ? `${joined}[${part}]` : `${joined}.${part}`), root);

const issue = (key: QueryKitMessageKey, path: string, extra: MessageArgs = {}): ValidationIssue => {
  const args: MessageArgs = { path, ...extra };
  return { path, key, message: formatMessage(key, args), args };
};

interface FilterContext {
  issues: ValidationIssue[];
  allowedKeys?: ReadonlySet<string>;
  operators: ReadonlySet<string>;
  maxDepth: number;
  strictValue: boolean;
}

/**
 * Bitta maydon sharti. Noma'lum propertylar (masalan legacy `type`) **e'tiborsiz**
 * qoldiriladi — `@querykitjs/zod` ham ularni rad etmay, jimgina tashlaydi.
 */
function checkCondition(node: unknown, path: string, ctx: FilterContext): void {
  if (!isRecord(node)) {
    ctx.issues.push(issue("querykit.filter.invalid_node", path));
    return;
  }

  const { key, operation, value } = node;

  if (typeof key !== "string") {
    ctx.issues.push(issue("querykit.filter.missing_key", path));
    return;
  }
  if (ctx.allowedKeys && !ctx.allowedKeys.has(key)) {
    ctx.issues.push(issue("querykit.filter.unknown_key", path, { key }));
  }

  let operator: string | undefined;
  if (operation !== undefined) {
    if (typeof operation === "string" && ctx.operators.has(operation)) {
      operator = operation;
    } else {
      ctx.issues.push(issue("querykit.filter.invalid_operator", `${path}.operation`, { operation: label(operation) }));
    }
  }

  if (value !== undefined && !isFilterValue(value)) {
    ctx.issues.push(issue("querykit.filter.invalid_value", `${path}.value`));
  }

  if (ctx.strictValue && operator !== undefined) {
    checkValueShape(operator, value, path, ctx);
  }
}

/** `strictValue` shoxobchasi — operator qanday qiymat shaklini talab qilishi. */
function checkValueShape(operator: string, value: unknown, path: string, ctx: FilterContext): void {
  const valuePath = `${path}.value`;

  if (ARRAY_OPERATORS.has(operator)) {
    if (!Array.isArray(value)) {
      ctx.issues.push(issue("querykit.filter.value_requires_array", valuePath, { operation: operator }));
    }
    return;
  }
  if (TUPLE_OPERATORS.has(operator)) {
    if (!Array.isArray(value) || value.length !== 2) {
      ctx.issues.push(issue("querykit.filter.value_requires_tuple", valuePath, { operation: operator }));
    }
    return;
  }
  if (NULLARY_OPERATORS.has(operator) && value !== undefined) {
    ctx.issues.push(issue("querykit.filter.value_forbidden", valuePath, { operation: operator }));
  }
}

function walkGroup(group: unknown, depth: number, path: string, ctx: FilterContext): void {
  if (!Array.isArray(group)) {
    ctx.issues.push(issue("querykit.filter.invalid_group", path));
    return;
  }
  group.forEach((child, index) => walkNode(child, depth + 1, `${path}[${index}]`, ctx));
}

function walkNode(node: unknown, depth: number, path: string, ctx: FilterContext): void {
  if (depth > ctx.maxDepth) {
    ctx.issues.push(issue("querykit.filter.max_depth", path, { max: ctx.maxDepth }));
    return;
  }
  if (!isRecord(node)) {
    ctx.issues.push(issue("querykit.filter.invalid_node", path));
    return;
  }

  /* Diskriminatsiya zod union tartibini aynan takrorlaydi: u yerda
   * `fieldConditionSchema` birinchi turadi, ya'ni `key` olib yurgan har qanday
   * obyekt shart deb o'qiladi va ortiqcha propertylar tashlanadi. */
  if ("key" in node) {
    checkCondition(node, path, ctx);
    return;
  }
  if ("and" in node) {
    walkGroup(node.and, depth, `${path}.and`, ctx);
    return;
  }
  if ("or" in node) {
    walkGroup(node.or, depth, `${path}.or`, ctx);
    return;
  }
  if ("not" in node) {
    walkNode(node.not, depth + 1, `${path}.not`, ctx);
    return;
  }

  ctx.issues.push(issue("querykit.filter.missing_key", path));
}

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
  if (value === undefined) return [];

  const root = options.rootPath ?? "filter";
  const limits = resolveLimits(options);

  /* Hajm birinchi, iterativ: limitdan oshgan payload shakl tekshiruviga yetib bormaydi. */
  const violation = findFilterLimitViolation(value, limits);
  if (violation) {
    const key = violation.limit === "maxDepth" ? "querykit.filter.max_depth" : "querykit.limit.exceeded";
    return [issue(key, joinPath(root, violation.path), { limit: violation.limit, max: violation.max })];
  }

  const ctx: FilterContext = {
    issues: [],
    allowedKeys: options.allowedKeys ? new Set(options.allowedKeys) : undefined,
    operators: options.allowedOperators ? new Set<string>(options.allowedOperators) : ALL_OPERATORS,
    maxDepth: limits.maxDepth,
    strictValue: options.strictValue ?? false,
  };

  if (Array.isArray(value)) {
    /* Flat massiv = implicit AND. Core uni `FieldCondition[]` deb tiplaydi —
     * ya'ni elementlari faqat shart, nested guruh emas (zod'da ham shunday). */
    value.forEach((item, index) => checkCondition(item, `${root}[${index}]`, ctx));
    return ctx.issues;
  }

  walkNode(value, 1, root, ctx);
  return ctx.issues;
}

/**
 * Sort massivini core kontraktiga tekshiradi (`{ key, direction }[]`). Bo'sh massiv = valid.
 */
export function validateSort(value: unknown, options: QuerySortOptions = {}): ValidationIssue[] {
  if (value === undefined) return [];

  const root = options.rootPath ?? "sort";
  if (!Array.isArray(value)) return [issue("querykit.sort.not_array", root)];

  const { maxSortFields } = resolveLimits(options);
  if (value.length > maxSortFields) return [issue("querykit.limit.exceeded", root, { limit: "maxSortFields", max: maxSortFields })];

  const allowedKeys = options.allowedKeys ? new Set(options.allowedKeys) : undefined;
  const issues: ValidationIssue[] = [];

  value.forEach((item, index) => {
    const path = `${root}[${index}]`;

    if (!isRecord(item)) {
      issues.push(issue("querykit.sort.invalid_item", path));
      return;
    }

    const { key, direction } = item;

    if (typeof key !== "string") {
      issues.push(issue("querykit.sort.missing_key", path));
      return;
    }
    if (allowedKeys && !allowedKeys.has(key)) {
      issues.push(issue("querykit.sort.unknown_key", path, { key }));
    }
    if (direction !== undefined && direction !== "asc" && direction !== "desc") {
      issues.push(issue("querykit.sort.invalid_direction", `${path}.direction`));
    }
  });

  return issues;
}
