import type { BuildQueryResult, DBQueryConfig, ExtractTablesWithRelations, InferInsertModel, InferSelectModel, SQL } from "drizzle-orm";
import type { AnyPgTable, PgDatabase } from "drizzle-orm/pg-core";
import type * as Core from "@querykitjs/core";

/** Any Drizzle Postgres database or transaction, regardless of the driver. */
export type AnyDb = PgDatabase<any, any, any>;

/** Row shape inferred from a Drizzle table (SELECT). */
export type Row<TTable extends AnyPgTable> = InferSelectModel<TTable>;

/** Insertable shape inferred from a Drizzle table (INSERT). */
export type Insert<TTable extends AnyPgTable> = InferInsertModel<TTable>;

/** Value accepted anywhere an id is expected. */
export type Id = string | number;

/* ----------------------- relation-aware result types ---------------------- */

/** Drizzle's relational view of a schema (tables + their relations). */
export type SchemaTables<TSchema extends Record<string, unknown>> = ExtractTablesWithRelations<TSchema>;

/** The `with` argument shape for a given table in a schema. */
export type WithConfig<TSchema extends Record<string, unknown>, TTableName extends keyof SchemaTables<TSchema>> = DBQueryConfig<
  "many",
  true,
  SchemaTables<TSchema>,
  SchemaTables<TSchema>[TTableName]
>["with"];

/** The `columns` selection shape for a given table in a schema. */
export type ColumnsConfig<TSchema extends Record<string, unknown>, TTableName extends keyof SchemaTables<TSchema>> = DBQueryConfig<
  "many",
  true,
  SchemaTables<TSchema>,
  SchemaTables<TSchema>[TTableName]
>["columns"];

/**
 * The exact row type Drizzle returns for a table when the given relations are
 * loaded — fully typed, with autocomplete. Bind it to your schema once:
 *
 * ```ts
 * type With<T extends keyof SchemaTables<typeof schema>, W> =
 *   InferWith<typeof schema, T, W>;
 *
 * type PostFull = With<"posts", { author: true; comments: true }>;
 * ```
 */
export type InferWith<
  TSchema extends Record<string, unknown>,
  TTableName extends keyof SchemaTables<TSchema>,
  TWith extends WithConfig<TSchema, TTableName> = undefined,
> = BuildQueryResult<SchemaTables<TSchema>, SchemaTables<TSchema>[TTableName], { with: TWith }>;

/**
 * The exact row type Drizzle returns for a table given both a `columns`
 * selection and loaded relations — the full inference used by read methods.
 */
export type InferResult<
  TSchema extends Record<string, unknown>,
  TTableName extends keyof SchemaTables<TSchema>,
  TColumns extends ColumnsConfig<TSchema, TTableName> = undefined,
  TWith extends WithConfig<TSchema, TTableName> = undefined,
> = BuildQueryResult<SchemaTables<TSchema>, SchemaTables<TSchema>[TTableName], { columns: TColumns; with: TWith }>;

/** Resolve a table object back to its key name within the schema. */
export type TableNameOf<TSchema extends Record<string, unknown>, TTable extends AnyPgTable> = {
  [K in keyof TSchema]: TSchema[K] extends TTable ? (TTable extends TSchema[K] ? K : never) : never;
}[keyof TSchema] &
  keyof SchemaTables<TSchema>;

/** Union of a table's column keys (property names). */
export type ColumnKey<TTable extends AnyPgTable> = keyof Row<TTable> & string;

/**
 * A column key that also accepts any `string`. Filter/sort keys arrive from the
 * wire as plain strings and the adapter skips the ones it cannot resolve, so a
 * validated payload can go straight into a repository call with no `as` cast.
 * Autocomplete still suggests the table's real columns.
 */
export type LooseColumnKey<TTable extends AnyPgTable> = Core.LooseKey<ColumnKey<TTable>>;

/* -------------------------------- filters --------------------------------- */
/* DSL `@querykitjs/core`dan; jadval ustuni (`ColumnKey`) va raw `SQL` bilan ixtisos. */

export type FilterOperator = Core.FilterOperator;
export type FilterScalar = Core.FilterScalar;
export type FilterValue = Core.FilterValue;

/** A single field comparison (`operation` defaults to `"="`). */
export type FieldCondition<TTable extends AnyPgTable = AnyPgTable> = Core.FieldCondition<LooseColumnKey<TTable>>;
export type AndGroup<TTable extends AnyPgTable = AnyPgTable> = Core.AndGroup<LooseColumnKey<TTable>, SQL>;
export type OrGroup<TTable extends AnyPgTable = AnyPgTable> = Core.OrGroup<LooseColumnKey<TTable>, SQL>;
export type NotGroup<TTable extends AnyPgTable = AnyPgTable> = Core.NotGroup<LooseColumnKey<TTable>, SQL>;

/**
 * Any node in a filter tree: a field comparison, a logical group, or a raw
 * Drizzle `SQL` fragment (escape hatch for expressions the DSL can't express).
 */
export type FilterNode<TTable extends AnyPgTable = AnyPgTable> = Core.FilterNode<LooseColumnKey<TTable>, SQL>;

/**
 * Public filter input. Either a filter tree/node, or a flat array of
 * conditions (treated as implicit AND — backward compatible with db-service).
 */
export type Filter<TTable extends AnyPgTable = AnyPgTable> = Core.Filter<LooseColumnKey<TTable>, SQL>;

/* --------------------------------- sorting -------------------------------- */

export type SortDirection = Core.SortDirection;

export type SortItem<TTable extends AnyPgTable = AnyPgTable> = Core.SortItem<LooseColumnKey<TTable>>;

/** Sort is **always an array** of `{ key, direction }` items (multi-field). */
export type Sort<TTable extends AnyPgTable = AnyPgTable> = SortItem<TTable>[];

/* ---------------------------- selection / params -------------------------- */

export type ColumnSelection<TTable extends AnyPgTable> = Partial<Record<ColumnKey<TTable>, boolean>>;

/** Relation config forwarded to Drizzle's relational `with`. */
export type WithRelations = Record<string, unknown>;

export interface QueryParams<TTable extends AnyPgTable> {
  filter?: Filter<TTable>;
  sort?: Sort<TTable>;
  columns?: ColumnSelection<TTable>;
  with?: WithRelations;
  /** Include soft-deleted rows (tables with a `deletedAt` column). */
  withDeleted?: boolean;
}

/** Equality scope applied to every operation of a scoped repository. */
export type Scope<TTable extends AnyPgTable> = Core.Scope<ColumnKey<TTable>>;

export interface ByIdParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  /** Column to match against the id. Defaults to `"id"`. */
  idKey?: LooseColumnKey<TTable>;
}

/** Options for {@link Repository.upsert} / {@link Repository.upsertMany}. */
export type UpsertOptions<TTable extends AnyPgTable> = Core.UpsertOptions<ColumnKey<TTable>, Insert<TTable>>;

/* ------------------------------ aggregation ------------------------------- */

/** Aggregate query specification (`count`/`sum`/`avg`/`min`/`max` + `groupBy`). */
export type AggregateSpec<TTable extends AnyPgTable> = Core.AggregateSpec<ColumnKey<TTable>, Filter<TTable>>;

/** One aggregated result row (group columns + aggregate values). */
export type AggregateRow = Record<string, string | number | boolean | null>;

/* ------------------------------- pagination ------------------------------- */

/** Offset (classic page-based) pagination. */
export interface OffsetParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  page?: number;
  perPage?: number;
}

export type OffsetMeta = Core.OffsetMeta;

export interface OffsetResult<T> {
  data: T[];
  meta: OffsetMeta;
}

/** Offset-window pagination tuned for infinite scroll (limit + offset). */
export interface InfiniteParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  limit?: number;
  offset?: number;
}

export type InfiniteMeta = Core.InfiniteMeta;

export interface InfiniteResult<T> {
  data: T[];
  meta: InfiniteMeta;
}

/** Keyset (cursor) pagination — stable under inserts, ideal for feeds. */
export interface CursorParams<TTable extends AnyPgTable> extends QueryParams<TTable> {
  limit?: number;
  /** Opaque cursor token from a previous result's meta. */
  cursor?: string | null;
  /** Column the cursor walks over. Must be unique & sortable. Defaults to `"id"`. */
  cursorKey?: LooseColumnKey<TTable>;
  /** Stable order of the dataset. Defaults to `"asc"`. */
  order?: SortDirection;
  /** Navigation relative to the cursor. Defaults to `"forward"`. */
  direction?: "forward" | "backward";
}

export type CursorMeta = Core.CursorMeta;

export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}

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
  /** Filterga mos barcha qatorlarni yangilaydi va ularni qaytaradi. */
  updateWhere(filter: Filter<TTable>, patch: Partial<Insert<TTable>>): Promise<Row<TTable>[]>;
  /** `id` bo'yicha qatorni **butunlay** o'chiradi (hard delete). */
  deleteById(id: Id, idKey?: ColumnKey<TTable>): Promise<Row<TTable> | undefined>;
  /** Filterga mos qatorlarni **butunlay** o'chiradi va ularni qaytaradi. */
  deleteWhere(filter: Filter<TTable>): Promise<Row<TTable>[]>;

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
}

/**
 * Per-repository sozlamalari — `registry.repository(table, options)`ga beriladi.
 * Falsafa: himoya **repository'da**, route'da emas — `scope` (RBAC) allaqachon
 * shu yo'lda, projection ham shu yerga tushadi. Mongoose adapteridagi
 * `RepositoryOptions` bilan bir xil nom va bir xil semantika.
 */
export interface RepositoryOptions<TTable extends AnyPgTable> {
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

/* ---------------------- compile-time wire alignment ----------------------- */
/* Validatsiyalangan (string-keyed) payload repository params'ga assignable —
 * ya'ni route'da `as OffsetParams<typeof table>` cast'i kerak emas. Halqa core
 * orqali yopiladi: `@querykitjs/zod` chiqishi shu wire shakllariga mos ekanini
 * o'sha paketda tekshiradi, bu yerda esa ularning repo'ga tushishi tekshiriladi.
 * `test/` typecheck qilinmaydi (`include: ["src"]`), shuning uchun `src` ichida. */

type Expect<T extends true> = T;
type _WireOffset = Expect<Core.WireOffsetParams extends OffsetParams<AnyPgTable> ? true : false>;
type _WireInfinite = Expect<Core.WireInfiniteParams extends InfiniteParams<AnyPgTable> ? true : false>;
type _WireCursor = Expect<Core.WireCursorParams extends CursorParams<AnyPgTable> ? true : false>;
/* Loose kalitlar autocomplete'ni yo'qotmaydi: haqiqiy ustun nomi hali ham tip a'zosi. */
type _KeepsAutocomplete = Expect<"id" extends LooseColumnKey<AnyPgTable> ? true : false>;
