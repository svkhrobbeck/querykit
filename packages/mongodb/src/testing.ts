/**
 * `@querykitjs/mongodb/testing` — test helpers, kept out of the main entry (REQUIREMENTS R14).
 *
 * @example
 * ```ts
 * import { explainFind } from "@querykitjs/mongodb/testing";
 *
 * const plan = await explainFind(users, { filter: [{ key: "email", operation: "%_", value: "ali" }] });
 * expect(JSON.stringify(plan)).toContain("IXSCAN"); // the prefix search uses the index
 * ```
 */
import type { Document } from "mongodb";

import { EXPLAIN } from "./internal/explain-key";
import type { QueryParams, Repository } from "./types";

type Explainable = { [EXPLAIN]?: (params: QueryParams) => Promise<Document> };

/**
 * The MongoDB query plan (`explain("queryPlanner")`) of `repository.findAll(params)` — the same
 * policy checks and compiled filter, so a test can assert that a request uses an index.
 */
export function explainFind<TDoc extends Document>(repository: Repository<TDoc>, params: QueryParams<TDoc> = {}): Promise<Document> {
  const explain = (repository as unknown as Explainable)[EXPLAIN];
  if (!explain) throw new TypeError("explainFind: not a @querykitjs/mongodb repository");
  return explain(params as QueryParams);
}
