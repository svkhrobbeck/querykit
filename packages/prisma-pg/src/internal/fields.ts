/**
 * Model metadata — the Prisma counterpart of drizzle's `columns.ts` and
 * mongoose's `fields.ts`.
 *
 * Prisma's `where` is keyed by **model field name** (camelCase), never by the DB
 * column, so resolution is simpler than drizzle's (which also matches
 * `created_at`). What is *not* simpler is getting the field list without
 * importing the generated client: this package must typecheck with no generated
 * client present, so the metadata is read off the client **instance** at runtime
 * through a fallback chain.
 */

/** One model field, normalized across every metadata source. */
export interface FieldMeta {
  name: string;
  /** Prisma type name: `"Int"`, `"String"`, `"DateTime"`, an enum or model name, … */
  type: string;
  kind: "scalar" | "enum" | "object" | "unsupported";
  isId: boolean;
  /** `@updatedAt` — Prisma bumps these itself, so the adapter must not. */
  isUpdatedAt: boolean;
  isList: boolean;
}

/** Everything the repository needs to know about one model. */
export interface ModelMeta {
  /** Prisma model name (`"User"`) — used as the diagnostics `source`. */
  name: string;
  fields: Map<string, FieldMeta>;
  /** The `@id` field name; undefined for a composite `@@id`. */
  idField: string | undefined;
  hasDeletedAt: boolean;
  /** Present only when the field exists **and** is not `@updatedAt`-managed. */
  stampUpdatedAt: string | undefined;
  hasCreatedAt: boolean;
}

/** Structural shape of a Prisma model delegate (`prisma.user`). */
export interface AnyDelegate {
  findMany(args?: unknown): Promise<unknown>;
  findFirst(args?: unknown): Promise<unknown>;
  count(args?: unknown): Promise<unknown>;
}

/**
 * Whether a client property is a model delegate.
 *
 * ⚠️ Filtering by a `$`/`_` name prefix is **not** enough: `Object.keys(prisma)`
 * also yields `"constructor"`. The check is therefore structural.
 */
export function isDelegate(value: unknown): value is AnyDelegate {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return typeof d.findMany === "function" && typeof d.findFirst === "function" && typeof d.count === "function";
}

/** Model delegate keys of a Prisma client (`["user", "post"]`). */
export function delegateKeys(client: Record<string, unknown>): string[] {
  return Object.keys(client).filter(key => !key.startsWith("$") && !key.startsWith("_") && key !== "constructor" && isDelegate(client[key]));
}

const uncapitalize = (name: string): string => (name ? name[0]!.toLowerCase() + name.slice(1) : name);

/* -------------------------- metadata sources ------------------------------ */

interface RuntimeField {
  name?: unknown;
  kind?: unknown;
  type?: unknown;
  isId?: unknown;
  isUpdatedAt?: unknown;
  isList?: unknown;
}

const KINDS = new Set(["scalar", "enum", "object", "unsupported"]);

const normalizeKind = (kind: unknown): FieldMeta["kind"] => (typeof kind === "string" && KINDS.has(kind) ? (kind as FieldMeta["kind"]) : "scalar");

/**
 * Source 1 — `client._runtimeDataModel` (Prisma 5/6). Internal, but the only
 * source that carries `isId` / `isUpdatedAt`, which soft-delete, id aliasing and
 * the `updatedAt` bump all depend on.
 */
function fromRuntimeDataModel(client: Record<string, unknown>, delegateKey: string): { name: string; fields: FieldMeta[] } | undefined {
  const rdm = client._runtimeDataModel as { models?: Record<string, { fields?: RuntimeField[] }> } | undefined;
  const models = rdm?.models;
  if (!models || typeof models !== "object") return undefined;

  const modelName = Object.keys(models).find(name => uncapitalize(name) === delegateKey);
  if (!modelName) return undefined;

  const raw = models[modelName]?.fields;
  if (!Array.isArray(raw)) return undefined;

  const fields: FieldMeta[] = [];
  for (const field of raw) {
    if (typeof field?.name !== "string") continue;
    fields.push({
      name: field.name,
      type: typeof field.type === "string" ? field.type : "",
      kind: normalizeKind(field.kind),
      isId: field.isId === true,
      isUpdatedAt: field.isUpdatedAt === true,
      isList: field.isList === true,
    });
  }
  return fields.length ? { name: modelName, fields } : undefined;
}

/**
 * Source 2 — `delegate.fields`, Prisma's public field-reference API. It exposes
 * `{ modelName, name, typeName, isList, isEnum }` but **no** `isId`/`isUpdatedAt`,
 * so a model whose primary key is not literally named `id` needs `fields`
 * (source 3) for `findById` to work off the wire's `"id"` key.
 */
function fromDelegateFields(delegate: unknown, delegateKey: string): { name: string; fields: FieldMeta[] } | undefined {
  const refs = (delegate as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (!refs || typeof refs !== "object") return undefined;

  const fields: FieldMeta[] = [];
  let modelName: string | undefined;
  for (const ref of Object.values(refs)) {
    const r = ref as { name?: unknown; typeName?: unknown; modelName?: unknown; isList?: unknown; isEnum?: unknown };
    if (typeof r.name !== "string") continue;
    if (typeof r.modelName === "string") modelName ??= r.modelName;
    fields.push({
      name: r.name,
      type: typeof r.typeName === "string" ? r.typeName : "",
      kind: r.isEnum === true ? "enum" : "scalar",
      isId: r.name === "id",
      isUpdatedAt: false,
      isList: r.isList === true,
    });
  }
  return fields.length ? { name: modelName ?? delegateKey, fields } : undefined;
}

/* ------------------------------ public API -------------------------------- */

/**
 * Read a model's metadata off a live Prisma client, trying, in order:
 * `_runtimeDataModel` → `delegate.fields` → the caller-supplied `override`.
 *
 * Throws when none of them work — the same reasoning as drizzle's "table not in
 * schema" error: a repository built on unknown metadata would silently skip
 * *every* filter key and return the whole table.
 */
export function readModelMeta(client: Record<string, unknown>, delegateKey: string, override?: readonly FieldMeta[]): ModelMeta {
  const delegate = client[delegateKey];
  if (!isDelegate(delegate)) {
    const available = delegateKeys(client);
    throw new Error(
      `createRegistry: "${delegateKey}" is not a model delegate on this Prisma client. ` +
        `Available models: ${available.join(", ") || "(none)"}. Note the key is camelCase — model "LegalEntity" is "legalEntity".`,
    );
  }

  const discovered = fromRuntimeDataModel(client, delegateKey) ?? fromDelegateFields(delegate, delegateKey);
  // An explicit `fields` override replaces the field list, but the model name is
  // still worth discovering — it is what diagnostics report as `source`.
  const source = override?.length ? { name: discovered?.name ?? delegateKey, fields: [...override] } : discovered;

  if (!source) {
    throw new Error(
      `createRegistry: could not read field metadata for model "${delegateKey}". ` +
        `This adapter reads it from the Prisma client at runtime (\`_runtimeDataModel\`, then \`delegate.fields\`); ` +
        `both were unavailable, which usually means an unsupported @prisma/client version (>=5 expected). ` +
        `Pass \`fields\` in the repository options to supply it explicitly.`,
    );
  }

  const fields = new Map<string, FieldMeta>();
  for (const field of source.fields) fields.set(field.name, field);

  const idField = fields.get("id")?.name ?? [...fields.values()].find(f => f.isId)?.name;
  const updatedAt = fields.get("updatedAt");

  return {
    name: source.name,
    fields,
    idField,
    hasDeletedAt: fields.has("deletedAt"),
    // Prisma maintains `@updatedAt` itself; stamping it again would be redundant
    // (mongoose does the same dance around schema `timestamps`).
    stampUpdatedAt: updatedAt && !updatedAt.isUpdatedAt ? updatedAt.name : undefined,
    hasCreatedAt: fields.has("createdAt"),
  };
}

/**
 * Map a public field key to a real Prisma field name. `"id"` resolves to the
 * model's `@id` field when no field is literally called `id`, so the wire
 * contract stays identical across adapters. Unknown keys return `undefined` and
 * the caller skips them silently (drizzle/mongoose parity).
 */
export function resolveField(meta: ModelMeta, key: string): string | undefined {
  if (key === "id") return meta.fields.has("id") ? "id" : meta.idField;
  return meta.fields.has(key) ? key : undefined;
}

/** Field metadata by resolved name. */
export function fieldMeta(meta: ModelMeta, field: string): FieldMeta | undefined {
  return meta.fields.get(field);
}

/** Whether a field stores a `DateTime` — the only type this adapter casts locally. */
export function isDateField(meta: ModelMeta, field: string): boolean {
  return meta.fields.get(field)?.type === "DateTime";
}

/** Whether a field stores a `String` — `mode: "insensitive"` is only valid there. */
export function isStringField(meta: ModelMeta, field: string): boolean {
  return meta.fields.get(field)?.type === "String";
}

/**
 * Cast a wire (JSON) value to the field's type — an ISO string / epoch number
 * becomes a `Date` on a `DateTime` field. An unparseable value is returned
 * unchanged (Prisma reports it); see `coerceCondition` for the operator-aware
 * wrapper. Mirrors the drizzle/mongoose `castValue` contract.
 */
export function castValue(meta: ModelMeta, field: string, value: unknown): unknown {
  if (!isDateField(meta, field)) return value;
  if (value === null || value === undefined || value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}
