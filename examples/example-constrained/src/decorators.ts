import { extendDecorator } from "@formspec/decorators";

/**
 * Strict field decorator — no placeholder allowed.
 * Use instead of @Field when project policy forbids placeholder text.
 */
interface StrictFieldOptions {
  displayName: string;
  description?: string;
}

export const StrictField = extendDecorator("Field").as<StrictFieldOptions>("StrictField");

/**
 * Bounded minimum — semantically indicates a required lower bound.
 */
export const BoundedMin = extendDecorator("Minimum").as<number>("BoundedMin");

/**
 * Bounded maximum — semantically indicates a required upper bound.
 */
export const BoundedMax = extendDecorator("Maximum").as<number>("BoundedMax");
