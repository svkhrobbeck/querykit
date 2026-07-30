/**
 * Xabar kataloglari — **yagona manba**. Har bir til bir xil kalitlar to'plamini
 * to'ldiradi; kalitlarning o'zi shu yerdagi inglizcha katalogdan chiqadi.
 *
 * Paket xatoni kalit bilan qaytargani uchun tillar soni cheklanmagan: tarjima
 * har doim iste'molchi tomonida (`nestjs-i18n` `I18nValidationPipe` yoki oddiy
 * `formatMessage(key, args, catalog)`). Bu yerdagi uchta katalog shunchaki eng
 * ko'p kerak bo'ladiganini qutidan beradi — hech biri majburiy emas.
 *
 * `QueryKitMessageCatalog` ataylab qat'iy (`Record<QueryKitMessageKey, string>`):
 * inglizchaga yangi kalit qo'shilsa, qolgan kataloglar **compile-time**da yorilib
 * beradi va eskirib qololmaydi.
 */

/**
 * Inglizcha katalog — kalitlarning kanonik ro'yxati va default fallback.
 * `{placeholder}` lar `formatMessage` bilan to'ldiriladi.
 */
export const QUERYKIT_MESSAGES_EN = {
  "querykit.filter.invalid_node": "{path} must be a filter condition or an and/or/not group",
  "querykit.filter.missing_key": "{path} is missing the required `key` string",
  "querykit.filter.unknown_key": "{path}: `{key}` is not an allowed filter key",
  "querykit.filter.invalid_operator": "{path}: `{operation}` is not a supported filter operator",
  "querykit.filter.invalid_value": "{path} must be a string, number, boolean, null, or an array of those",
  "querykit.filter.invalid_group": "{path} must be an array of filter nodes",
  "querykit.filter.max_depth": "{path} exceeds the maximum filter depth of {max}",
  "querykit.filter.value_requires_array": "{path}: `{operation}` requires an array value",
  "querykit.filter.value_requires_tuple": "{path}: `{operation}` requires exactly two values",
  "querykit.filter.value_forbidden": "{path}: `{operation}` must not carry a value",
  "querykit.sort.not_array": "{path} must be an array of { key, direction } items",
  "querykit.sort.invalid_item": "{path} must be an object with a `key` string",
  "querykit.sort.missing_key": "{path} is missing the required `key` string",
  "querykit.sort.unknown_key": "{path}: `{key}` is not an allowed sort key",
  "querykit.sort.invalid_direction": "{path}: direction must be `asc` or `desc`",
} as const satisfies Record<string, string>;

/**
 * Har bir validatsiya xatosining i18n kaliti. Union inglizcha katalogdan chiqadi —
 * yangi xabar qo'shilsa tip o'zi kengayadi, qo'lda ro'yxat yuritilmaydi.
 */
export type QueryKitMessageKey = keyof typeof QUERYKIT_MESSAGES_EN;

/** Bitta tilning to'liq katalogi — barcha kalitlar majburiy. */
export type QueryKitMessageCatalog = Record<QueryKitMessageKey, string>;

/** O'zbekcha katalog. Placeholder nomlari inglizchasi bilan bir xil. */
export const QUERYKIT_MESSAGES_UZ: QueryKitMessageCatalog = {
  "querykit.filter.invalid_node": "{path} filter sharti yoki and/or/not guruhi bo'lishi kerak",
  "querykit.filter.missing_key": "{path} da majburiy `key` (string) yo'q",
  "querykit.filter.unknown_key": "{path}: `{key}` ruxsat etilgan filter kaliti emas",
  "querykit.filter.invalid_operator": "{path}: `{operation}` qo'llab-quvvatlanadigan filter operatori emas",
  "querykit.filter.invalid_value": "{path} string, raqam, boolean, null yoki shularning massivi bo'lishi kerak",
  "querykit.filter.invalid_group": "{path} filter tugunlari massivi bo'lishi kerak",
  "querykit.filter.max_depth": "{path} ruxsat etilgan filter chuqurligidan ({max}) oshib ketdi",
  "querykit.filter.value_requires_array": "{path}: `{operation}` massiv qiymat talab qiladi",
  "querykit.filter.value_requires_tuple": "{path}: `{operation}` aynan ikkita qiymat talab qiladi",
  "querykit.filter.value_forbidden": "{path}: `{operation}` qiymat qabul qilmaydi",
  "querykit.sort.not_array": "{path} `{ key, direction }` elementlaridan iborat massiv bo'lishi kerak",
  "querykit.sort.invalid_item": "{path} `key` (string) maydoniga ega obyekt bo'lishi kerak",
  "querykit.sort.missing_key": "{path} da majburiy `key` (string) yo'q",
  "querykit.sort.unknown_key": "{path}: `{key}` ruxsat etilgan sort kaliti emas",
  "querykit.sort.invalid_direction": "{path}: direction `asc` yoki `desc` bo'lishi kerak",
};

/** Ruscha katalog. */
export const QUERYKIT_MESSAGES_RU: QueryKitMessageCatalog = {
  "querykit.filter.invalid_node": "{path} должен быть условием фильтра или группой and/or/not",
  "querykit.filter.missing_key": "в {path} отсутствует обязательное поле `key` (строка)",
  "querykit.filter.unknown_key": "{path}: `{key}` — недопустимый ключ фильтра",
  "querykit.filter.invalid_operator": "{path}: `{operation}` — неподдерживаемый оператор фильтра",
  "querykit.filter.invalid_value": "{path} должен быть строкой, числом, boolean, null или массивом из них",
  "querykit.filter.invalid_group": "{path} должен быть массивом узлов фильтра",
  "querykit.filter.max_depth": "{path} превышает максимальную глубину фильтра ({max})",
  "querykit.filter.value_requires_array": "{path}: `{operation}` требует значение-массив",
  "querykit.filter.value_requires_tuple": "{path}: `{operation}` требует ровно два значения",
  "querykit.filter.value_forbidden": "{path}: `{operation}` не должен содержать значение",
  "querykit.sort.not_array": "{path} должен быть массивом элементов `{ key, direction }`",
  "querykit.sort.invalid_item": "{path} должен быть объектом с полем `key` (строка)",
  "querykit.sort.missing_key": "в {path} отсутствует обязательное поле `key` (строка)",
  "querykit.sort.unknown_key": "{path}: `{key}` — недопустимый ключ сортировки",
  "querykit.sort.invalid_direction": "{path}: direction должен быть `asc` или `desc`",
};

/**
 * Til kodi → katalog. Qutidagi tillar; iste'molchi o'z katalogini shu shaklda
 * qo'shib, `formatMessage`ga uzata oladi.
 */
export const QUERYKIT_LOCALES = {
  en: QUERYKIT_MESSAGES_EN,
  uz: QUERYKIT_MESSAGES_UZ,
  ru: QUERYKIT_MESSAGES_RU,
} as const satisfies Record<string, QueryKitMessageCatalog>;

/** Qutidan chiqadigan til kodlari. */
export type QueryKitLocale = keyof typeof QUERYKIT_LOCALES;
