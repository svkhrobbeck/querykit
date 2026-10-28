import type * as Core from "@querykitjs/core";

import type { LooseFieldKey } from "./common";
import type { CursorParams, InfiniteParams, OffsetParams } from "./pagination";

export * from "./common";
export * from "./pagination";
export * from "./repository";
export * from "./registry";

/* ---------------------- compile-time wire alignment ----------------------- */
/* A validated (string-keyed) payload is assignable to the repository params —
 * i.e. no `as OffsetParams<IUser>` cast in the route. The loop closes through
 * core: `@querykitjs/zod` checks that its output matches these wire shapes, and
 * here we check the shapes reach the repository. Mirrors the drizzle-pg adapter. */

type Expect<T extends true> = T;
type _WireOffset = Expect<Core.WireOffsetParams extends OffsetParams ? true : false>;
type _WireInfinite = Expect<Core.WireInfiniteParams extends InfiniteParams ? true : false>;
type _WireCursor = Expect<Core.WireCursorParams extends CursorParams ? true : false>;
/* Loose keys keep autocomplete: a real field name is still a member of the type. */
type _KeepsAutocomplete = Expect<"name" extends LooseFieldKey<{ name: string }> ? true : false>;
