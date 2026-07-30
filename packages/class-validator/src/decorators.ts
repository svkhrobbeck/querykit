/**
 * `class-validator` o'rovi. Butun mantiq `validate.ts`da — bu yerda faqat
 * konstraint klasslari va ularni property'ga bog'laydigan dekorator factory'lari.
 *
 * Rekursiya `validateFilter` ichida bo'lgani uchun nested DTO klassi ham,
 * `@ValidateNested` ham kerak emas: butun `and`/`or`/`not` daraxti bitta
 * dekorator bilan tekshiriladi.
 */
import { registerDecorator, ValidatorConstraint } from "class-validator";
import type { ValidationArguments, ValidationOptions, ValidatorConstraintInterface } from "class-validator";
import { validateFilter, validateSort, type QueryFilterOptions, type QuerySortOptions, type ValidationIssue } from "./validate";

/** Dekorator darajasidagi qo'shimcha — yadro buni o'qimaydi. */
export interface MessageStyleOptions {
  /**
   * Xato matni qanday shaklda qaytsin:
   * - `"text"` (default) — tayyor inglizcha jumla, i18n'siz app ham o'qiydi;
   * - `"key"` — `querykit.filter.*` kaliti, `nestjs-i18n`ning `I18nValidationPipe`i
   *   uni so'rovning tiliga tarjima qiladi.
   */
  messageStyle?: "text" | "key";
}

export type IsQueryFilterOptions = QueryFilterOptions & MessageStyleOptions;
export type IsQuerySortOptions = QuerySortOptions & MessageStyleOptions;

/* -------------------------------- helpers --------------------------------- */

const optionsOf = <TOptions extends MessageStyleOptions>(args: ValidationArguments | undefined, fallbackPath: string): TOptions => {
  const given = (args?.constraints?.[0] ?? {}) as TOptions;
  /* Xato yo'li DTO property nomidan boshlansin: `where` deb nomlangan maydon
   * `filter.operation` emas, `where.operation` deb chiqadi. */
  return { rootPath: args?.property ?? fallbackPath, ...given };
};

const firstMessage = (issues: ValidationIssue[], options: MessageStyleOptions, args: ValidationArguments | undefined, fallback: string): string => {
  const first = issues[0];
  if (!first) return `${args?.property ?? "value"} ${fallback}`;
  return options.messageStyle === "key" ? first.key : first.message;
};

/* ------------------------------- constraints ------------------------------ */
/* DIQQAT: class-validator konstraint instansiyasini bir marta yaratib, barcha
 * so'rovlar uchun qayta ishlatadi. Shu sababli issue'lar `this`da HECH QACHON
 * keshlanmaydi — parallel so'rovlarda xabarlar aralashib ketardi. `defaultMessage`
 * `validateFilter`ni qayta chaqiradi: u sof, holatsiz va arzon. */

/** `@IsQueryFilter()` ortidagi konstraint — test va qayta ishlatish uchun ochiq. */
@ValidatorConstraint({ name: "isQueryFilter", async: false })
export class IsQueryFilterConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    return validateFilter(value, optionsOf<IsQueryFilterOptions>(args, "filter")).length === 0;
  }

  defaultMessage(args?: ValidationArguments): string {
    const options = optionsOf<IsQueryFilterOptions>(args, "filter");
    return firstMessage(validateFilter(args?.value, options), options, args, "is not a valid querykit filter");
  }
}

/** `@IsQuerySort()` ortidagi konstraint. */
@ValidatorConstraint({ name: "isQuerySort", async: false })
export class IsQuerySortConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: ValidationArguments): boolean {
    return validateSort(value, optionsOf<IsQuerySortOptions>(args, "sort")).length === 0;
  }

  defaultMessage(args?: ValidationArguments): string {
    const options = optionsOf<IsQuerySortOptions>(args, "sort");
    return firstMessage(validateSort(args?.value, options), options, args, "is not a valid querykit sort");
  }
}

/* ------------------------------- decorators ------------------------------- */

/**
 * Property'ni querykit `Filter` kontraktiga tekshiradi: flat massiv (implicit AND),
 * nested `and`/`or`/`not` daraxti va core `FILTER_OPERATORS`ning to'liq to'plami.
 *
 * `undefined` qiymatni **rad etmaydi** — maydonni ixtiyoriy qilish uchun
 * `@IsOptional()` bilan birga ishlating (DTO'lardagi kabi).
 *
 * @example
 * ```ts
 * class ListUsersDto extends OffsetParamsDto {
 *   @IsOptional()
 *   @IsQueryFilter({ allowedKeys: ["id", "name", "createdAt"] })
 *   declare filter?: Filter;
 * }
 * ```
 */
export function IsQueryFilter(options?: IsQueryFilterOptions, validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [options],
      validator: IsQueryFilterConstraint,
    });
  };
}

/**
 * Property'ni querykit `Sort` kontraktiga tekshiradi — `{ key, direction }[]`.
 * Qarang: {@link IsQueryFilter}.
 */
export function IsQuerySort(options?: IsQuerySortOptions, validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [options],
      validator: IsQuerySortConstraint,
    });
  };
}
