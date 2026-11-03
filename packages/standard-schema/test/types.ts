/**
 * Compile-time checks (run by `tsc --noEmit`): the schemas are Standard Schema
 * v1 schemas as the published `@standard-schema/spec` defines them, their
 * output is a core wire type, and tRPC takes them as `.input()`.
 */
import type { WireCursorParams, WireOffsetParams } from "@querykitjs/core";
import type { StandardSchemaV1 as SpecSchemaV1 } from "@standard-schema/spec";
import { initTRPC } from "@trpc/server";
import { filterSchema, makeCursorParamsSchema, makeOffsetParamsSchema, sortSchema, type MadeCursorParams } from "../src/index";

type Expect<T extends true> = T;

const cursor = makeCursorParamsSchema();
export const asSpec: SpecSchemaV1<unknown, MadeCursorParams> = cursor;
export const filterAsSpec: SpecSchemaV1 = filterSchema;
export const sortAsSpec: SpecSchemaV1 = sortSchema;

export type CursorOutputIsWire = Expect<SpecSchemaV1.InferOutput<typeof cursor> extends WireCursorParams ? true : false>;
export type ClosedFieldsAbsent = Expect<"withDeleted" extends keyof SpecSchemaV1.InferOutput<typeof cursor> ? false : true>;

const admin = makeOffsetParamsSchema({ allow: ["withDeleted"] });
export type AllowedFieldPresent = Expect<"withDeleted" extends keyof SpecSchemaV1.InferOutput<typeof admin> ? true : false>;
export type OffsetOutputIsWire = Expect<SpecSchemaV1.InferOutput<typeof admin> extends WireOffsetParams ? true : false>;

const t = initTRPC.create();
export const router = t.router({
  list: t.procedure.input(cursor).query(({ input }): WireCursorParams => input),
});
