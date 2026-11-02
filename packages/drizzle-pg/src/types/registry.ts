import type { Relations } from "@querykitjs/core";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type * as Core from "@querykitjs/core";

import type { ColumnKey, ColumnSelection, Scope } from "./common";
import type { Repository, RepositoryExtender } from "./repository";

/** {@link createRegistry} sozlamalari — pagination default'lari va chegaralari. */
export interface RegistryOptions {
  /** `findList` uchun default sahifa o'lchami (core `DEFAULT_PER_PAGE` = 20). */
  defaultPerPage?: number;
  /** `findInfinite`/`findCursor` uchun default `limit` (core `DEFAULT_LIMIT` = 20). */
  defaultLimit?: number;
  /**
   * `findList` uchun **maksimal** `perPage` (core `DEFAULT_MAX_PER_PAGE` = 200).
   * Validatsiya (`@querykitjs/zod` factory'lari) chetlab o'tilsa ham repository
   * o'zi clamp qiladi — defense in depth. Cheklovni o'chirish: `Infinity`.
   */
  maxPerPage?: number;
  /** `findInfinite`/`findCursor` uchun maksimal `limit` (core `DEFAULT_MAX_LIMIT` = 200). */
  maxLimit?: number;
  /**
   * **Qattiq rejim.** Noma'lum filter/sort kaliti yoki operatorga mos kelmagan
   * qiymat jimgina tashlab yuborilmaydi — `QueryKitError` tashlanadi (backend
   * uni 400 qilib qaytaradi). Default `false`: legacy (DbService) xulqi
   * saqlanadi, chunki tashlab yuborish o'nlab mavjud endpointning xulqi.
   *
   * Nega kerak: filter natijani **cheklash** uchun ishlatiladi, shuning uchun
   * typo qilingan kalit jimgina yo'qolsa endpoint kutilganidan **ko'proq** data
   * qaytaradi va buni hech kim sezmaydi.
   */
  strict?: boolean;
  /**
   * Tashlab yuborilgan har bir shart uchun chaqiriladi (`strict: false`da ham).
   * Migratsiya yo'li: avval hook bilan kuzatish → log tozalanganda `strict: true`.
   */
  onSkippedCondition?: (info: Core.SkippedCondition) => void;
  /**
   * Server-side so'rov limitlari (core `DEFAULT_QUERY_LIMITS`: chuqurlik 5, shartlar 30,
   * massiv 200, satr 256, offset 10 000, sort 3) — validator chetlab o'tilsa ham.
   * Oshgan so'rov `QueryKitError` (`reason: "limit-exceeded"`) bilan to'xtaydi. Repository
   * `limits` bundan ustun.
   */
  limits?: Partial<Core.QueryLimits>;
  /**
   * Signs cursor tokens (HMAC-SHA256, task 012). With it a token that was not
   * issued by this server — or was changed — is `invalid-value`. Without it tokens
   * are unsigned but still checked (scalar values, v2 shape).
   */
  cursorSecret?: string;
  /**
   * The createdAt / deletedAt field names (task 014; default `createdAt`, `deletedAt`): the default
   * sort and the default `sortable` use `createdAt`, soft delete uses `deletedAt`.
   */
  timestamps?: { createdAt?: string; deletedAt?: string };
}

/**
 * Per-repository sozlamalari — `registry.repository(table, options)`ga beriladi.
 * Falsafa: himoya **repository'da**, route'da emas — `scope` (RBAC) allaqachon
 * shu yo'lda, projection ham shu yerga tushadi. Mongoose adapteridagi
 * `RepositoryOptions` bilan bir xil nom va bir xil semantika.
 *
 * ⚠️ `forcedColumns`/`allowedColumns` **faqat o'qish** metodlariga ta'sir qiladi
 * (`findAll`/`findOne`/`findById`/`findList`/`findInfinite`/`findCursor` +
 * `aggregate`). Yozish metodlari (`create`, `upsert`, `updateById`, `softDelete`, …)
 * tip kontrakti bo'yicha to'liq `Row`ni qaytaradi — runtime'da uni qirqish tipni
 * yolg'onga aylantirardi. Yozish natijasini clientga qaytarishdan oldin
 * `findById` bilan qayta o'qing yoki o'zingiz map qiling.
 */
export interface RepositoryOptions<TTable extends AnyPgTable> {
  /**
   * Mijoz `with` bilan ochishi mumkin bo'lgan relation'lar (task 014, R21): relation → `{ columns, nested? }`.
   * `columns` majburiy (ro'yxat yoki `"*"`); ro'yxatda yo'q relation, ustun yoki ichki `with` —
   * `QueryKitError` `forbidden-key`, `site: "with"`. Berilmasa `with` umuman ochilmaydi.
   */
  relations?: Relations;
  /** Har bir o'qish/yozishga qo'shiladigan doimiy tenglik filtri (RBAC / multi-tenancy). */
  scope?: Scope<TTable>;
  /**
   * Majburiy projection — client `columns` **butunlay e'tiborsiz** qoldiriladi.
   * `users` kabi jadvallarda parol chiqib ketishining oldini oladi; route'da
   * `{ ...params, columns: SAFE_COLUMNS }` spread-trick'i kerak bo'lmaydi.
   * Kamida bitta ustun tanlanishi shart (aks holda repository yaratilishida xato).
   */
  forcedColumns?: ColumnSelection<TTable>;
  /**
   * Ruxsat etilgan ustunlar — client `columns` shu ro'yxat bilan kesiladi.
   * Kesishma bo'sh bo'lsa natija **to'liq qator emas**, ro'yxatning o'zi bo'ladi.
   * Bo'sh massiv berilishi xato (hech narsa tanlanmagan projection = to'liq qator).
   */
  allowedColumns?: readonly ColumnKey<TTable>[];
  /**
   * Mijoz filtrlay oladigan ustunlar va har biri uchun operatorlar (`"*"` — hammasi).
   * Ro'yxatda yo'q ustun → `reason: "forbidden-key"`, yo'q operator →
   * `"forbidden-operator"` — `strict`dan qat'i nazar `QueryKitError`, so'rov bazaga yetmaydi.
   * **Berilmasa** — `allowedColumns` (yo'q bo'lsa `forcedColumns` kalitlari, u ham yo'q
   * bo'lsa faqat primary key) va faqat `"="` / `"in"`. `aggregate` kalitlari ham shu ro'yxatdan.
   *
   * @example
   * ```ts
   * filterable: { status: ["=", "in"], createdAt: ["between", ">=", "<="], name: ["contains"] }
   * ```
   */
  filterable?: Core.Filterable<ColumnKey<TTable>>;
  /**
   * Mijoz saralay oladigan (va `cursorKey` qila oladigan) ustunlar. Berilmasa — primary
   * key va `createdAt` (jadvalda bo'lsa). Boshqasi → `reason: "forbidden-key"`.
   */
  sortable?: readonly ColumnKey<TTable>[];
  /** Shu repository uchun so'rov limitlari — registry `limits` ustidan. */
  limits?: Partial<Core.QueryLimits>;
}

/** DB registry: bir marta yaratiladi, jadval repositorylarini chiqaradi. */
export interface Registry<TSchema extends Record<string, unknown>> {
  /** Registry yaratishda berilgan schema. */
  readonly schema: TSchema;

  /**
   * Jadval uchun {@link Repository} qaytaradi. Ikkinchi argument bilan custom
   * metodlar qo'shsa bo'ladi (base metodlar ustiga).
   *
   * @example
   * ```ts
   * export const usersRepository = registry.repository(users, base => ({
   *   findByEmail: (email: string) =>
   *     base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
   * }));
   * ```
   */
  repository<TTable extends AnyPgTable>(table: TTable): Repository<TTable, TSchema>;
  repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    extend: RepositoryExtender<TTable, TSchema, TExt>,
  ): Repository<TTable, TSchema> & TExt;

  /**
   * …with per-repository options (`scope`, `forcedColumns`, `allowedColumns`).
   *
   * @example
   * ```ts
   * export const usersRepository = registry.repository(users, {
   *   forcedColumns: { id: true, fullName: true }, // parol hech qachon chiqmaydi
   * });
   * ```
   */
  repository<TTable extends AnyPgTable>(table: TTable, options: RepositoryOptions<TTable>): Repository<TTable, TSchema>;
  /** …with both options and custom methods. */
  repository<TTable extends AnyPgTable, TExt extends Record<string, unknown>>(
    table: TTable,
    options: RepositoryOptions<TTable>,
    extend: RepositoryExtender<TTable, TSchema, TExt>,
  ): Repository<TTable, TSchema> & TExt;

  /**
   * `fn` ni DB **tranzaksiyasi** ichida bajaradi. Ichida ishlatilgan
   * repositorylar avtomatik ravishda tranzaksiya ulanishini ishlatadi (ambient
   * kontekst orqali). Ichma-ich chaqirilsa **savepoint** yaratiladi. `fn` xato
   * tashlasa — hammasi **rollback** bo'ladi.
   *
   * @example
   * ```ts
   * await registry.transaction(async () => {
   *   await dispatchesRepository.create({ ... });
   *   await stockRepository.updateById(stockId, { qty: next });
   * });
   * ```
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
