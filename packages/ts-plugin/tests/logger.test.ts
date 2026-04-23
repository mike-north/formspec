import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as tsServer from "typescript/lib/tsserverlibrary.js";
import { fromTsLogger, isNamespaceEnabled } from "../src/logger.js";

// ---------------------------------------------------------------------------
// Fake ts.server.Logger
// ---------------------------------------------------------------------------

function createFakeTsLogger(loggingEnabled = true): {
  logger: tsServer.server.Logger;
  msgSpy: ReturnType<typeof vi.fn>;
  infoSpy: ReturnType<typeof vi.fn>;
} {
  const msgSpy = vi.fn();
  const infoSpy = vi.fn();

  const logger = {
    close: vi.fn(),
    hasLevel: vi.fn().mockReturnValue(true),
    loggingEnabled: vi.fn().mockReturnValue(loggingEnabled),
    perftrc: vi.fn(),
    info: infoSpy,
    startGroup: vi.fn(),
    endGroup: vi.fn(),
    msg: msgSpy,
    getLogFileName: vi.fn().mockReturnValue(undefined),
  } as unknown as tsServer.server.Logger;

  return { logger, msgSpy, infoSpy };
}

// ---------------------------------------------------------------------------
// isNamespaceEnabled
// ---------------------------------------------------------------------------

describe("isNamespaceEnabled", () => {
  const originalDebug = process.env["DEBUG"];

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env["DEBUG"];
    } else {
      process.env["DEBUG"] = originalDebug;
    }
  });

  it("returns false when DEBUG is not set", () => {
    delete process.env["DEBUG"];
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(false);
  });

  it("returns false when DEBUG is an empty string", () => {
    process.env["DEBUG"] = "";
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(false);
  });

  it("returns true when DEBUG exactly matches the namespace", () => {
    process.env["DEBUG"] = "formspec:ts-plugin";
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(true);
  });

  it("returns true when DEBUG uses a wildcard that covers the namespace", () => {
    process.env["DEBUG"] = "formspec:*";
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(true);
    expect(isNamespaceEnabled("formspec:build")).toBe(true);
  });

  it("returns false when wildcard does not cover the namespace", () => {
    process.env["DEBUG"] = "formspec:*";
    expect(isNamespaceEnabled("other:service")).toBe(false);
  });

  it("returns false when namespace is negated", () => {
    process.env["DEBUG"] = "-formspec:ts-plugin";
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(false);
  });

  it("returns true for non-negated namespace when another is negated", () => {
    process.env["DEBUG"] = "formspec:*,-formspec:build";
    expect(isNamespaceEnabled("formspec:ts-plugin")).toBe(true);
    expect(isNamespaceEnabled("formspec:build")).toBe(false);
  });

  it("returns false for formspec:build when -formspec:build is in comma list", () => {
    process.env["DEBUG"] = "formspec:cli,-formspec:build";
    expect(isNamespaceEnabled("formspec:cli")).toBe(true);
    expect(isNamespaceEnabled("formspec:build")).toBe(false);
  });

  it("does not throw on malformed DEBUG patterns", () => {
    process.env["DEBUG"] = "((bad-regex";
    expect(() => isNamespaceEnabled("formspec:ts-plugin")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fromTsLogger — level routing
// ---------------------------------------------------------------------------

describe("fromTsLogger", () => {
  const originalDebug = process.env["DEBUG"];

  beforeEach(() => {
    process.env["DEBUG"] = "formspec:ts-plugin";
  });

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env["DEBUG"];
    } else {
      process.env["DEBUG"] = originalDebug;
    }
  });

  it("routes trace to ts.server.Msg.Info", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.trace("hello trace");
    expect(msgSpy).toHaveBeenCalledOnce();
    const [message, type] = msgSpy.mock.calls[0] as [string, string];
    expect(type).toBe("Info");
    expect(message).toContain("hello trace");
  });

  it("routes debug to ts.server.Msg.Info", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.debug("hello debug");
    const [, type] = msgSpy.mock.calls[0] as [string, string];
    expect(type).toBe("Info");
  });

  it("routes info to ts.server.Msg.Info", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.info("hello info");
    const [, type] = msgSpy.mock.calls[0] as [string, string];
    expect(type).toBe("Info");
  });

  it("routes warn to ts.server.Msg.Info with [WARN] prefix in message", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.warn("careful");
    const [message, type] = msgSpy.mock.calls[0] as [string, string];
    expect(type).toBe("Info");
    expect(message).toContain("[WARN]");
    expect(message).toContain("careful");
  });

  it("routes error to ts.server.Msg.Err", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.error("boom");
    const [, type] = msgSpy.mock.calls[0] as [string, string];
    expect(type).toBe("Err");
  });

  // ---------------------------------------------------------------------------
  // loggingEnabled gating
  // ---------------------------------------------------------------------------

  it("does not emit when loggingEnabled() returns false", () => {
    const { logger, msgSpy } = createFakeTsLogger(false);
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.info("silent");
    log.error("also silent");
    expect(msgSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Namespace prefix
  // ---------------------------------------------------------------------------

  it("prefixes messages with the namespace in brackets", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.info("test message");
    const [message] = msgSpy.mock.calls[0] as [string];
    expect(message).toMatch(/^\[formspec:ts-plugin\]/);
  });

  // ---------------------------------------------------------------------------
  // DEBUG gating
  // ---------------------------------------------------------------------------

  it("returns noopLogger when namespace is not in DEBUG", () => {
    process.env["DEBUG"] = "formspec:build";
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.info("should be silent");
    expect(msgSpy).not.toHaveBeenCalled();
  });

  it("returns noopLogger when DEBUG is unset and namespace is provided", () => {
    delete process.env["DEBUG"];
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    log.info("silent");
    expect(msgSpy).not.toHaveBeenCalled();
  });

  it("does not gate when no namespace is provided (namespace-less adapter always emits)", () => {
    delete process.env["DEBUG"];
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger);
    log.info("always on");
    expect(msgSpy).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // child logger
  // ---------------------------------------------------------------------------

  it("child logger includes bindings in the prefix", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    const child = log.child({ stage: "ir", phase: "2" });
    child.info("child message");
    const [message] = msgSpy.mock.calls[0] as [string];
    expect(message).toContain("stage=ir");
    expect(message).toContain("phase=2");
    expect(message).toContain("child message");
  });

  it("child logger accumulates bindings from parent", () => {
    const { logger, msgSpy } = createFakeTsLogger();
    const log = fromTsLogger(logger, { namespace: "formspec:ts-plugin" });
    const child = log.child({ a: "1" });
    const grandchild = child.child({ b: "2" });
    grandchild.info("deep");
    const [message] = msgSpy.mock.calls[0] as [string];
    expect(message).toContain("a=1");
    expect(message).toContain("b=2");
  });
});
