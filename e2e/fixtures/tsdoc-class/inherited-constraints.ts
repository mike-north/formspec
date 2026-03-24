/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 @maximum 100 */
type Percentage = Integer;

export class MetricsForm {
  /** @minimum 10 */
  cpuUsage!: Percentage;
  memoryUsage!: Percentage;
  diskUsage?: Percentage;
}
