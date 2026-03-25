/**
 * Tests constraint extraction from interface-like class declarations.
 */
export class ConstrainedConfig {
  /** @minimum 1 @maximum 65535 */
  port!: number;

  /** @minLength 1 @maxLength 253 */
  hostname!: string;

  /** @pattern ^(debug|info|warn|error)$ */
  logLevel!: string;

  /** @minimum 1000 @maximum 30000 */
  timeoutMs?: number;

  /** @minItems 1 */
  allowedOrigins!: string[];
}
