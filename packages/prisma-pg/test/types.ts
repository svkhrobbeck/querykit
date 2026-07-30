/**
 * Type-level test — checked with `tsc`, never executed.
 *
 *   bun run test:types
 *
 * `src/` is typechecked without a generated Prisma client on purpose (so CI needs
 * no `prisma generate`). That means the *inference* — the part a consumer
 * actually feels — has to be proven separately, here, against a real generated
 * client. Every `const _x: T = …` below fails to compile if inference drifts.
 */
import { createRegistry, createFilters, type Row, type Insert, type RawWhere, type FieldKey } from "../src/index";
import { PrismaClient } from "./prisma/generated/index.js";

const prisma = new PrismaClient();
const registry = createRegistry(prisma);

const users = registry.repository("user");
const posts = registry.repository("post");

/* --- the model key is constrained to real delegates --- */
// @ts-expect-error "nope" is not a model on this client
registry.repository("nope");
// @ts-expect-error `$connect` is not a model delegate
registry.repository("$connect");

/* --- Row / Insert / WhereInput come from the delegate --- */
type UserRow = Row<typeof prisma.user>;
const _row: UserRow = { id: 1, name: "a", email: "b", age: null, createdAt: new Date() };
const _age: number | null = _row.age;
// @ts-expect-error `title` belongs to Post, not User
const _wrongField: string = _row.title;

const _insert: Insert<typeof prisma.user> = { name: "a", email: "b" };
const _raw: RawWhere<typeof prisma.user> = { email: { contains: "a", mode: "insensitive" } };
const _key: FieldKey<typeof prisma.user> = "email";

/* --- read inference: no args → the full row --- */
async function reads() {
  const all = await users.findAll();
  const _full: { id: number; name: string; email: string; age: number | null; createdAt: Date } = all[0]!;

  // `columns` narrows through Prisma's own select inference.
  const picked = await users.findAll({ columns: { id: true, email: true } });
  const _picked: { id: number; email: string } = picked[0]!;
  // @ts-expect-error `name` was not selected
  const _noName = picked[0]!.name;

  // A false selection does not narrow (inclusion-only, like the other adapters).
  const notNarrowed = await users.findAll({ columns: { id: false } });
  const _stillFull: string = notNarrowed[0]!.name;

  // `with` loads and types the relation.
  const withPosts = await users.findAll({ with: { posts: true } });
  const _title: string = withPosts[0]!.posts[0]!.title;
  const _alsoScalar: string = withPosts[0]!.email;

  // Both together compose into one select — scalars *and* the relation.
  const both = await users.findAll({ columns: { id: true }, with: { posts: true } });
  const _bothId: number = both[0]!.id;
  const _bothTitle: string = both[0]!.posts[0]!.title;
  // @ts-expect-error `email` was not selected
  const _noEmail = both[0]!.email;

  // findOne / findById are the same row type, optional.
  const one = await users.findOne({ columns: { email: true } });
  const _oneEmail: string | undefined = one?.email;
  const byId = await users.findById(1, { columns: { id: true } });
  const _byId: number | undefined = byId?.id;

  // Pagination keeps `data` typed and `meta` shaped by core.
  const list = await users.findList({ page: 1, columns: { id: true } });
  const _listId: number = list.data[0]!.id;
  const _totalPages: number = list.meta.total_pages;
  const _hasPrev: boolean = list.meta.has_prev;

  const infinite = await users.findInfinite({ limit: 5 });
  const _nextOffset: number | null = infinite.meta.next_offset;

  const cursor = await users.findCursor({ limit: 5 });
  const _nextCursor: string | null = cursor.meta.next_cursor;
  const _cursorRow: string = cursor.data[0]!.name;
}

/* --- writes --- */
async function writes() {
  const created = await users.create({ name: "a", email: "b" });
  const _createdId: number = created.id;
  // @ts-expect-error `email` is required by the model
  await users.create({ name: "a" });

  const updated = await users.updateById(1, { name: "b" });
  const _updatedName: string | undefined = updated?.name;

  const upserted = await users.upsert({ name: "a", email: "b" }, { target: "email" });
  const _upsertedId: number = upserted.id;
  // @ts-expect-error "nope" is not a field of User
  await users.upsert({ name: "a", email: "b" }, { target: "nope" });

  const many = await users.createMany([{ name: "a", email: "b" }]);
  const _manyId: number = many[0]!.id;

  const deleted = await users.deleteById(1);
  const _deletedEmail: string | undefined = deleted?.email;

  // posts has deletedAt → soft delete is available and returns the row.
  const soft = await posts.softDelete(1);
  const _softTitle: string | undefined = soft?.title;
}

/* --- filters: typed keys + the raw escape hatch --- */
async function filters() {
  const uf = createFilters<typeof prisma.user>();
  await users.findAll({ filter: uf.and(uf.eq("email", "a"), uf.gte("age", 18)) });
  await users.findAll({ filter: [{ key: "name", operation: "%_%", value: "ali" }] });

  // Wire payloads are string-keyed; they must go straight in with no cast.
  const fromWire: { filter?: unknown; page?: number } = JSON.parse("{}");
  await users.findList(fromWire as Parameters<typeof users.findList>[0]);

  // A raw Prisma where is a valid filter node (relation predicates, etc.).
  await users.findAll({ filter: { posts: { some: { title: { contains: "x" } } } } });
  await users.findAll({ filter: uf.or(uf.eq("name", "a"), { posts: { some: { title: "x" } } }) });
}

/* --- scoped / extended repositories keep their types --- */
async function composition() {
  const scoped = users.scoped({ name: "ali" });
  const _scopedEmail: string = (await scoped.findAll())[0]!.email;
  // @ts-expect-error "nope" is not a field of User
  users.scoped({ nope: 1 });

  const extended = registry.repository("user", base => ({
    findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", value: email }] }),
  }));
  const _extendedName: string | undefined = (await extended.findByEmail("a"))?.name;
  const _baseStillThere: number = (await extended.findAll())[0]!.id;

  const guarded = registry.repository("user", { forcedColumns: { id: true }, scope: { name: "ali" } });
  const _guardedId: number = (await guarded.findAll())[0]!.id;

  const _tx: number = await registry.transaction(async () => (await users.findAll()).length);
}

void reads;
void writes;
void filters;
void composition;
void [_row, _age, _wrongField, _insert, _raw, _key, users, posts];
