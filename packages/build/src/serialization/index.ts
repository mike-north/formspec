/**
 * Internal barrel for the serialization bounded context.
 *
 * This file intentionally stays inside `@formspec/build` source; PR-1 does not
 * add public package exports for serialization internals.
 */

export { emitKey } from "./emit-key.js";
export { assertUniqueKebabNames, KEYWORD_REGISTRY, VOCABULARY_IDS } from "./keyword-registry.js";
export { JsonSchema2020Writer } from "./json-schema-2020-writer.js";
export {
  FORMSPEC_EXTENSION_KEY_PATTERN,
  isWellFormedVendorPrefix,
  toKebabCase,
} from "./vendor-key-format.js";
export type { SerializationContext } from "./output-writer.js";
