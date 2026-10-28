/**
 * Prisma type utilities the public types are built from. Not re-exported by
 * `types/index.ts`: they are implementation helpers, not part of the API.
 */
import type { Types } from "@prisma/client/runtime/client";

export type ArgsOf<TDelegate, TOperation extends Types.Public.Operation> = Types.Public.Args<TDelegate, TOperation>;

/** One row with the given Prisma args applied (`select` / `include`). */
export type RowWith<TDelegate, TArgs> = Types.Public.Result<TDelegate, TArgs, "findFirstOrThrow">;
