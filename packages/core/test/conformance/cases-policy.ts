/**
 * Request-policy cases (task 009): `filterable`, `sortable` and server-side
 * `limits` on the repository. A case without `options.policy` runs under the
 * open 3.x policy (every field, every operator, every sort field); these set it.
 *
 * drizzle-pg (009), prisma-pg (010) and mongoose (011) all apply the policy.
 */
import type { ConformanceCase } from "./case-types";

const nameOnly = { filterable: { name: ["="] as const } };

export const POLICY_CASES: readonly ConformanceCase[] = [
  {
    name: "K1: a field outside filterable is refused (email startsWith)",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ key: "email", operation: "startsWith", value: "a" }] } },
    options: { policy: nameOnly },
    expect: { error: { site: "filter", key: "email", reason: "forbidden-key" } },
  },
  {
    name: "an operator outside the field's list is refused (name like)",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ key: "name", operation: "like", value: "A%" }] } },
    options: { policy: nameOnly },
    expect: { error: { site: "filter", key: "name", reason: "forbidden-operator" } },
  },
  {
    name: "an allowed field and operator pass (name = Alice)",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ key: "name", operation: "=", value: "Alice" }] } },
    options: { policy: nameOnly },
    expect: { names: ["Alice"] },
  },
  {
    name: "Y5: a sort field outside sortable is refused (email)",
    group: "policy",
    call: { method: "findAll", params: { sort: [{ key: "email", direction: "asc" }] } },
    options: { policy: { filterable: { name: "*" }, sortable: ["id", "createdAt"] } },
    expect: { error: { site: "sort", key: "email", reason: "forbidden-key" } },
  },
  {
    name: "Y4: an offset past maxOffset is refused (limits.maxOffset 40, page 4 × 20)",
    group: "policy",
    call: { method: "findList", params: { page: 4, perPage: 20 } },
    options: { policy: { filterable: { name: "*" }, limits: { maxOffset: 40 } } },
    expect: { error: { site: "page", key: "maxOffset", reason: "limit-exceeded" } },
  },
  {
    name: "safe default: no filterable, no column options — a non-key field is refused",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ key: "name", operation: "=", value: "Alice" }] } },
    options: { policy: "default" },
    expect: { error: { site: "filter", key: "name", reason: "forbidden-key" } },
  },
  {
    name: "safe default: the primary key with = passes",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ key: "id", operation: "=", value: 2 }] } },
    options: { policy: "default" },
    expect: { names: ["Bob"] },
    knownDifference: { mongoose: "the fixture id maps to `_id` (an ObjectId), so the numeric `id = 2` fails to cast — a fixture difference, not a policy one" },
  },
  {
    name: "R19: a JSON-shaped driver object is refused (no raw() brand)",
    group: "policy",
    call: { method: "findAll", params: { filter: [{ name: { startsWith: "A" } }] as never } },
    options: { policy: { filterable: { name: "*" } } },
    expect: { error: { site: "filter", key: "name", reason: "forbidden-key" } },
    notBuiltByWeb: "the web builders drop a node without a key, so this payload only reaches a repository directly",
  },
];
