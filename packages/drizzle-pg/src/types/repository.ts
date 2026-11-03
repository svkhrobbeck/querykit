import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { AllRows, MutationCount, MutationRows } from "@querykitjs/core";

import type {
  AggregateRow,
  AggregateSpec,
  ByIdParams,
  ColumnKey,
  ColumnsConfig,
  Filter,
  Id,
  InferResult,
  Insert,
  QueryParams,
  Row,
  Scope,
  TableNameOf,
  UpsertOptions,
  WithConfig,
} from "./common";
import type { CursorParams, CursorResult, InfiniteParams, InfiniteResult, OffsetParams, OffsetResult } from "./pagination";

/* ------------------------------- repository ------------------------------- */

/** Table name of a repository's table within its schema. */
type Name<TSchema extends Record<string, unknown>, TTable extends AnyPgTable> = TableNameOf<TSchema, TTable>;

/** Any `with` config valid for this repository's table. */
type AnyWith<TSchema extends Record<string, unknown>, TTable extends AnyPgTable> = WithConfig<TSchema, Name<TSchema, TTable>>;

/** Any `columns` selection valid for this repository's table. */
type AnyColumns<TSchema extends Record<string, unknown>, TTable extends AnyPgTable> = ColumnsConfig<TSchema, Name<TSchema, TTable>>;

/**
 * Query params whose `columns` and `with` are typed to the passed selection —
 * this is what drives return-type inference.
 */
type Params<
  TBase,
  TSchema extends Record<string, unknown>,
  TTable extends AnyPgTable,
  TColumns extends AnyColumns<TSchema, TTable>,
  TWith extends AnyWith<TSchema, TTable>,
> = Omit<TBase, "columns" | "with"> & { columns?: TColumns; with?: TWith };

/** The exact result row for this table + selected columns + loaded relations. */
type Result<
  TSchema extends Record<string, unknown>,
  TTable extends AnyPgTable,
  TColumns extends AnyColumns<TSchema, TTable>,
  TWith extends AnyWith<TSchema, TTable>,
> = InferResult<TSchema, Name<TSchema, TTable>, TColumns, TWith>;

/**
 * The table-scoped repository surface. Read methods infer their return type
 * from the `columns` and `with` arguments, so selected fields and relations
 * come back fully typed with no manual generics.
 */
export interface Repository<TTable extends AnyPgTable, TSchema extends Record<string, unknown> = Record<string, unknown>> {
  /** Asosidagi Drizzle jadval — maxsus so'rovlar uchun escape-hatch. */
  readonly table: TTable;

  /**
   * Filterga mos **barcha** qatorlarni qaytaradi (paginatsiyasiz).
   *
   * @param params - `filter`, `sort`, `columns`, `with`, `withDeleted`.
   * @returns Qatorlar massivi (tip `columns`/`with` bo'yicha aniqlanadi).
   * @example
   * ```ts
   * const active = await usersRepository.findAll({
   *   filter: [{ key: "status", operation: "=", value: "active" }],
   *   sort: [{ key: "createdAt", direction: "desc" }],
   * });
   * ```
   */
  findAll<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    params?: Params<QueryParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<Result<TSchema, TTable, TColumns, TWith>[]>;

  /**
   * Mos keladigan **birinchi** qatorni qaytaradi (topilmasa `undefined`).
   *
   * @param params - `filter`, `sort`, `columns`, `with`, `withDeleted`.
   * @example
   * ```ts
   * const user = await usersRepository.findOne({
   *   filter: [{ key: "email", operation: "=", value: "a@b.com" }],
   * });
   * ```
   */
  findOne<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    params?: Params<QueryParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<Result<TSchema, TTable, TColumns, TWith> | undefined>;

  /**
   * `id` bo'yicha bitta qatorni qaytaradi (topilmasa `undefined`). Boshqa
   * ustunni kalit qilish uchun `params.idKey` bering.
   *
   * @param id - qidiriladigan qiymat.
   * @param params - `idKey` (default `"id"`) + odatiy `filter`/`with`/`columns`.
   * @example
   * ```ts
   * const post = await postsRepository.findById(1, { with: { author: true } });
   * post?.author.name; // relation avtomatik tiplangan
   * ```
   */
  findById<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    id: Id,
    params?: Params<ByIdParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<Result<TSchema, TTable, TColumns, TWith> | undefined>;

  /**
   * **Offset (sahifali) paginatsiya** — `total_items`/`total_pages` bilan.
   *
   * @param params - `page`, `perPage` + `filter`/`sort`/`columns`/`with`.
   * @returns `{ data, meta }` — meta ichida umumiy soni va sahifa ma'lumoti.
   * @example
   * ```ts
   * const { data, meta } = await usersRepository.findList({ page: 2, perPage: 20 });
   * meta.total_pages; // jami sahifalar
   * ```
   */
  findList<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    params?: Params<OffsetParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<OffsetResult<Result<TSchema, TTable, TColumns, TWith>>>;

  /**
   * **Infinite-scroll paginatsiya** — `limit`+`offset`, `COUNT`siz. `has_more`
   * va `next_offset` qaytaradi (keyingi bo'lakni yuklash uchun).
   *
   * @param params - `limit`, `offset` + `filter`/`sort`/`columns`/`with`.
   * @example
   * ```ts
   * const { data, meta } = await feedRepository.findInfinite({ limit: 20, offset: 40 });
   * if (meta.has_more) load(meta.next_offset);
   * ```
   */
  findInfinite<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    params?: Params<InfiniteParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<InfiniteResult<Result<TSchema, TTable, TColumns, TWith>>>;

  /**
   * **Cursor (keyset) paginatsiya** — insert'larga barqaror, feed uchun ideal.
   * `next_cursor`/`prev_cursor` (base64 token) qaytaradi.
   *
   * @param params - `limit`, `cursor`, `cursorKey` (default `"id"`), `order`,
   *   `direction` (`"forward"`/`"backward"`) + odatiy filter/columns/with.
   * @example
   * ```ts
   * const p1 = await usersRepository.findCursor({ limit: 20, order: "asc" });
   * const p2 = await usersRepository.findCursor({ limit: 20, cursor: p1.meta.next_cursor });
   * ```
   */
  findCursor<TColumns extends AnyColumns<TSchema, TTable> = undefined, TWith extends AnyWith<TSchema, TTable> = undefined>(
    params?: Params<CursorParams<TTable>, TSchema, TTable, TColumns, TWith>,
  ): Promise<CursorResult<Result<TSchema, TTable, TColumns, TWith>>>;

  /** Filterga mos qatorlar sonini qaytaradi. */
  count(filter?: Filter<TTable>): Promise<number>;
  /** Filterga mos qator mavjudligini tekshiradi (`count > 0`). */
  exists(filter?: Filter<TTable>): Promise<boolean>;

  /**
   * **Agregatsiya** — `count`/`sum`/`avg`/`min`/`max` va ixtiyoriy `groupBy`.
   * Dashboard hisobotlari uchun.
   *
   * @param spec - agregat maydonlar, `groupBy`, `filter`.
   * @returns Har bir guruh uchun bitta qator (`{ <groupCols>, count, sum_x, … }`).
   * @example
   * ```ts
   * await visitsRepository.aggregate({ count: true, groupBy: "supervisorId" });
   * await ordersRepository.aggregate({ sum: "amount", groupBy: "region" });
   * ```
   */
  aggregate(spec: AggregateSpec<TTable>): Promise<AggregateRow[]>;

  /** Bitta qator yaratadi va uni qaytaradi. */
  create(values: Insert<TTable>): Promise<Row<TTable>>;
  /** Bir nechta qatorni bitta so'rovda yaratadi. */
  createMany(values: Insert<TTable>[]): Promise<Row<TTable>[]>;

  /**
   * **Upsert** — insert qiladi, unique-constraint to'qnashsa update qiladi
   * (`INSERT … ON CONFLICT`). `set` berilmasa, `values` (target ustunlarsiz)
   * asosida quriladi; update qiladigan narsa qolmasa `DO NOTHING` bo'ladi va
   * mavjud qator qaytariladi.
   *
   * @param values - kiritiladigan qiymatlar.
   * @param options - `target` (conflict ustun(lar)i) va ixtiyoriy `set`.
   * @example
   * ```ts
   * await usersRepository.upsert({ email: "a@b.com", name: "Ali" }, { target: "email" });
   * ```
   */
  upsert(values: Insert<TTable>, options: UpsertOptions<TTable>): Promise<Row<TTable>>;

  /**
   * **Bulk upsert** — katta massivlarni avtomatik bo'laklarga (chunk) bo'lib
   * yozadi. Import/sync uchun. Qarang: {@link Repository.upsert}.
   *
   * @example
   * ```ts
   * await productsRepository.upsertMany(rows, { target: "externalId" });
   * ```
   */
  upsertMany(values: Insert<TTable>[], options: UpsertOptions<TTable>): Promise<Row<TTable>[]>;

  /** `id` bo'yicha bitta qatorni yangilaydi (topilmasa `undefined`). */
  updateById(id: Id, patch: Partial<Insert<TTable>>, idKey?: ColumnKey<TTable>): Promise<Row<TTable> | undefined>;
  /**
   * Filterga mos qatorlarni bitta atomar `UPDATE` bilan yangilaydi → `{ count }`.
   * Filtrsiz faqat `{ all: true }` bilan (scope baribir qo'llanadi); bo'sh yoki to'liq tashlab
   * yuborilgan filtr — `QueryKitError` `empty-filter`. Filtr o'qishdagidek siyosatdan o'tadi.
   */
  updateWhere(filter: Filter<TTable> | AllRows, patch: Partial<Insert<TTable>>, options?: { returning?: false }): Promise<MutationCount>;
  /** `returning: { limit }` bilan: `{ count, rows }` — `RETURNING` natijasidan ko'pi bilan `limit` ta qator. */
  updateWhere(filter: Filter<TTable> | AllRows, patch: Partial<Insert<TTable>>, options: { returning: { limit: number } }): Promise<MutationRows<Row<TTable>>>;
  /** `id` bo'yicha qatorni **butunlay** o'chiradi (hard delete). */
  deleteById(id: Id, idKey?: ColumnKey<TTable>): Promise<Row<TTable> | undefined>;
  /** Filterga mos qatorlarni bitta atomar `DELETE` bilan **butunlay** o'chiradi → `{ count }` (`updateWhere` qoidalari). */
  deleteWhere(filter: Filter<TTable> | AllRows, options?: { returning?: false }): Promise<MutationCount>;
  /** `returning: { limit }` bilan: `{ count, rows }`. */
  deleteWhere(filter: Filter<TTable> | AllRows, options: { returning: { limit: number } }): Promise<MutationRows<Row<TTable>>>;

  /**
   * **Yumshoq o'chirish** — `deletedAt` ustunini `now()` ga qo'yadi (fizik
   * o'chirmaydi). Jadvalda `deletedAt` ustuni bo'lishini talab qiladi.
   * O'chirilgan qatorlar o'qishlardan avtomatik chiqarib tashlanadi.
   *
   * @example
   * ```ts
   * await postsRepository.softDelete(id);
   * await postsRepository.findAll({ withDeleted: true }); // o'chirilganlar ham
   * ```
   */
  softDelete(id: Id, idKey?: ColumnKey<TTable>): Promise<Row<TTable> | undefined>;
  /** Yumshoq o'chirilgan qatorni tiklaydi (`deletedAt = null`). */
  restore(id: Id, idKey?: ColumnKey<TTable>): Promise<Row<TTable> | undefined>;

  /**
   * **Scoped repository** — barcha o'qish/yangilash/o'chirishga doimiy base
   * filter qo'shadi, `create`da esa scope maydonlarini default qiladi (scope
   * ustun keladi). RBAC / multi-tenancy uchun.
   *
   * @param scope - ustun → qiymat (tenglik) juftliklari.
   * @example
   * ```ts
   * const mine = roadmapsRepository.scoped({ supervisorId: user.id });
   * await mine.findList({ page: 1 }); // faqat shu supervisor ma'lumoti
   * ```
   */
  scoped(scope: Scope<TTable>): Repository<TTable, TSchema>;
}

/** Extends a base repository with custom, table-specific methods. */
export type RepositoryExtender<TTable extends AnyPgTable, TSchema extends Record<string, unknown>, TExt extends Record<string, unknown>> = (
  base: Repository<TTable, TSchema>,
) => TExt;
