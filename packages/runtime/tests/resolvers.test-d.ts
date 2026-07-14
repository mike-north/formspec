/**
 * Type-level tests for resolver source extraction.
 *
 * Regression coverage for issue #516: `ResolverSourcesForForm` /
 * `ExtractDynamicSources` must recurse into `field.array()` items and
 * `field.object()` properties, mirroring the runtime `extractSources` walker
 * and the DSL `validateForm` walker.
 */

import { expectType, expectError } from "tsd";
import { formspec, field } from "@formspec/dsl";
import type { ArrayField, ObjectField, DynamicEnumField, TextField } from "@formspec/core";
import { defineResolvers } from "../src/index.js";
import type { ResolverSourcesForForm } from "../src/index.js";

// --- Positive: dynamic enum nested inside an array ---
declare const arraySources: ResolverSourcesForForm<
  [ArrayField<"lineItems", [DynamicEnumField<"product", "products">]>]
>;
expectType<"products">(arraySources);

// --- Positive: dynamic enum nested inside an object ---
declare const objectSources: ResolverSourcesForForm<
  [ObjectField<"shipping", [DynamicEnumField<"country", "countries">]>]
>;
expectType<"countries">(objectSources);

// --- Positive: dynamic enum nested inside an object-inside-array ---
declare const nestedSources: ResolverSourcesForForm<
  [ArrayField<"lineItems", [ObjectField<"detail", [DynamicEnumField<"product", "products">]>]>]
>;
expectType<"products">(nestedSources);

// --- Negative: a non-dynamic field contributes no source ---
declare const noSources: ResolverSourcesForForm<[ArrayField<"lineItems", [TextField<"label">]>]>;
expectType<never>(noSources);

// --- Negative: defineResolvers requires the nested source's resolver ---
const arrayForm = formspec(field.array("lineItems", field.dynamicEnum("product", "products")));
// Omitting the "products" resolver must be a type error.
expectError(defineResolvers(arrayForm, {}));

const objectForm = formspec(field.object("shipping", field.dynamicEnum("country", "countries")));
// Omitting the "countries" resolver must be a type error.
expectError(defineResolvers(objectForm, {}));

const nestedForm = formspec(
  field.array("lineItems", field.object("detail", field.dynamicEnum("product", "products")))
);
// Omitting the deeply-nested "products" resolver must be a type error.
expectError(defineResolvers(nestedForm, {}));
