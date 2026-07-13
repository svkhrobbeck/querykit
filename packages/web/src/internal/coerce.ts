import type { FilterScalar, FilterValue, FilterValueType } from "../types";

/** Bo'sh (yuborilmaydigan) qiymatmi: undefined/null/""/[] . `false`/`0` — bo'sh emas. */
export function isEmptyValue(value: FilterValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** `Date` yoki parse qilinadigan string → ISO string. Aks holda o'zi. */
function toIsoDate(value: FilterScalar | Date): FilterScalar {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return null;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

/**
 * Qiymatni berilgan tipga coerce qiladi. `in`/`notIn` uchun massivlar element
 * bo'yicha map qilinadi. Sana native `Date` bilan ISO'ga aylanadi (dayjs'siz).
 */
export function coerceValue(type: FilterValueType | undefined, value: FilterValue | undefined): FilterValue | undefined {
  if (type === undefined || value === undefined || value === null) return value;

  switch (type) {
    case "date":
      return Array.isArray(value) ? value.map(v => toIsoDate(v)) : toIsoDate(value);
    case "number":
      return Array.isArray(value) ? value.map(Number) : Number(value);
    case "boolean":
      if (Array.isArray(value)) return value.map(toBoolean);
      return toBoolean(value);
    case "string":
      return Array.isArray(value) ? value.map(String) : String(value);
    default:
      return value;
  }
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}
