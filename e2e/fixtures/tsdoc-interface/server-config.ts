/**
 * Server configuration for e2e testing.
 * Tests optional fields, nested objects, and various types.
 */
export class ServerConfig {
  hostname!: string;
  port!: number;
  protocol!: "http" | "https";
  maxConnections?: number;
  enableLogging!: boolean;
  database!: {
    host: string;
    port: number;
    name: string;
  };
  allowedOrigins?: string[];
}
