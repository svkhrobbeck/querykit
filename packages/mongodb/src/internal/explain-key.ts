/**
 * The key of a repository's hidden `explain` method — shared by the repository (main entry)
 * and `@querykitjs/mongodb/testing`, which imports only this key, not the repository code.
 * `Symbol.for`, so the two entries' bundles agree on it.
 */
export const EXPLAIN = Symbol.for("querykit.mongodb.explain");
