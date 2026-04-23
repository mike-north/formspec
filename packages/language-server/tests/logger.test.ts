import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";

// Pattern-matcher semantics are covered by @formspec/core's logger test suite.

// ---------------------------------------------------------------------------
// createLogger — routing
// ---------------------------------------------------------------------------
describe("createLogger", () => {
  const originalDebug = process.env["DEBUG"];

  beforeEach(() => {
    process.env["DEBUG"] = "formspec:lsp";
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env["DEBUG"];
    } else {
      process.env["DEBUG"] = originalDebug;
    }
  });

  function makeConnection() {
    return {
      console: {
        log: vi.fn<(msg: string) => void>(),
        info: vi.fn<(msg: string) => void>(),
        warn: vi.fn<(msg: string) => void>(),
        error: vi.fn<(msg: string) => void>(),
      },
    };
  }

  it("returns noopLogger when namespace is not enabled", () => {
    process.env["DEBUG"] = "";
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.info("hello");
    expect(connection.console.log).not.toHaveBeenCalled();
    expect(connection.console.warn).not.toHaveBeenCalled();
    expect(connection.console.error).not.toHaveBeenCalled();
  });

  it("routes info-level to connection.console.info", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.info("info message");

    // pino is async by default; flush the Writable
    // We use setImmediate to let the stream drain within the same tick cycle
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.info).toHaveBeenCalled();
        expect(connection.console.log).not.toHaveBeenCalled();
        expect(connection.console.warn).not.toHaveBeenCalled();
        expect(connection.console.error).not.toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("routes debug-level to connection.console.log", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.debug("debug message");

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.log).toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("routes trace-level to connection.console.log", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.trace("trace message");

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.log).toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("routes warn-level to connection.console.warn", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.warn("warn message");

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.warn).toHaveBeenCalled();
        expect(connection.console.error).not.toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("routes error-level to connection.console.error", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);

    log.error("error message");

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.error).toHaveBeenCalled();
        expect(connection.console.warn).not.toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("child logger inherits routing behaviour", () => {
    const connection = makeConnection();
    const log = createLogger("formspec:lsp", connection);
    const child = log.child({ stage: "init" });

    child.warn("child warn");

    return new Promise<void>((resolve) => {
      setImmediate(() => {
        expect(connection.console.warn).toHaveBeenCalled();
        resolve();
      });
    });
  });
});
