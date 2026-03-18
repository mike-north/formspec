import { customDecorator } from "@formspec/decorators";

/**
 * Custom decorator created without an extension namespace.
 * The `customDecorator()` no-arg overload produces decorators
 * that are recognized as FormSpec but have no extensionName,
 * so no x-formspec-* keys should be emitted.
 */
export const Highlight = customDecorator().marker("Highlight");
export const Metadata = customDecorator().as<{ key: string }>("Metadata");
