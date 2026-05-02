import type { FormSpecConfig } from "./types.js";

/**
 * Identity function that provides type checking and IDE autocompletion
 * for FormSpec configuration objects.
 *
 * @example
 * ```typescript
 * import { defineFormSpecConfig } from '@formspec/config';
 *
 * export default defineFormSpecConfig({
 *   extensions: [myExtension],
 *   vendorPrefix: 'x-acme',
 * });
 * ```
 *
 * @public
 */
export function defineFormSpecConfig(config: FormSpecConfig): FormSpecConfig {
  return config;
}
