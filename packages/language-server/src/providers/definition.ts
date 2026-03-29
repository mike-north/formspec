/**
 * Go-to-definition provider for FormSpec.
 *
 * This is a stub — go-to-definition support (e.g., navigating from a
 * `field.text("name")` call to the form definition that references it) will
 * be implemented in a future phase.
 */

import type { Location } from "vscode-languageserver/node.js";

/**
 * Returns the definition location for a symbol at the given position.
 *
 * Always returns `null` in this stub implementation.
 *
 * @returns `null` — not yet implemented
 * @public
 */
export function getDefinition(): Location | null {
  return null;
}
