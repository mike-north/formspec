/**
 * Network configuration demonstrating various field types for e2e testing.
 */
export class NetworkConfig {
  cpuThreshold!: number;
  memoryThreshold!: number;
  adminEmail!: string;
  enableAlerts!: boolean;
  alertChannels!: ("email" | "slack" | "pagerduty")[];
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}
