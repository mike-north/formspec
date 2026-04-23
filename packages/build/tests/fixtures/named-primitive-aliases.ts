/** @multipleOf 1 */
export type Integer = number;

/** @minimum 0 @maximum 65535 */
export type PortNumber = Integer;

/** @minimum 0 @maximum 100 */
export type Percentage = number;

/** @minimum 0 @maximum 9007199254740991 */
export type BigCounter = bigint;

export class ServerConfig {
  httpPort!: PortNumber;
  httpsPort!: PortNumber;
  cpuThreshold!: Percentage;
  requestCount!: BigCounter;
}
