/**
 * The Standard Schema v1 interface, copied as the spec invites so this package
 * needs no dependency for it: https://standardschema.dev ·
 * https://github.com/standard-schema/standard-schema (`@standard-schema/spec` 1.1.0).
 * Flat names instead of the spec's namespace; a type test checks the shapes
 * against the published package.
 */

/** A schema any Standard Schema consumer (Hono `sValidator`, tRPC, …) accepts. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown, options?: StandardSchemaOptions | undefined) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

export type StandardSchemaResult<Output> = StandardSchemaSuccess<Output> | StandardSchemaFailure;

export interface StandardSchemaSuccess<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

export interface StandardSchemaOptions {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

export interface StandardSchemaFailure {
  readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaPathSegment> | undefined;
}

export interface StandardSchemaPathSegment {
  readonly key: PropertyKey;
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** The validated output type of a schema. */
export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
