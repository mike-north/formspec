/**
 * Tests for error handling and warning messages in the decorator system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toFormSpec } from "./to-formspec.js";
import { Label } from "./decorators.js";
import { setFieldMetadata } from "./metadata.js";

describe("Error Handling", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("Constructor failure warning", () => {
    it("should warn when constructor requires arguments and fails", () => {
      class FormWithRequiredConstructor {
        @Label("Name")
        name!: string;

        constructor(_requiredArg: string) {
          throw new Error("Required argument missing");
        }
      }

      // Cast to bypass TypeScript's constructor signature check
      // since we're explicitly testing failure cases
      toFormSpec(FormWithRequiredConstructor as new () => unknown);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[FormSpec] Failed to instantiate FormWithRequiredConstructor for metadata extraction"
        )
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("If your class requires constructor arguments")
      );
    });

    it("should not warn for successful construction", () => {
      class FormWithNoConstructor {
        @Label("Name")
        name!: string;
      }

      toFormSpec(FormWithNoConstructor);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should include error message in warning", () => {
      class FormWithErrorMessage {
        @Label("Name")
        name!: string;

        constructor() {
          throw new Error("Custom error message");
        }
      }

      toFormSpec(FormWithErrorMessage);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error: Custom error message")
      );
    });

    it("should handle non-Error thrown values", () => {
      class FormWithNonErrorThrow {
        @Label("Name")
        name!: string;

        constructor() {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw "string error";
        }
      }

      toFormSpec(FormWithNonErrorThrow);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error: string error")
      );
    });
  });

  describe("Symbol property warning", () => {
    it("should warn when symbol-keyed properties are encountered", () => {
      const symbolKey = Symbol("testSymbol");

      class FormWithSymbolProperty {
        @Label("Name")
        name!: string;
      }

      // Manually add symbol metadata to test the warning
      setFieldMetadata(
        FormWithSymbolProperty.prototype as unknown as Record<string | symbol, unknown>,
        symbolKey,
        {
          label: "Symbol Field",
        }
      );

      toFormSpec(FormWithSymbolProperty);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[FormSpec] Skipping symbol-keyed property Symbol(testSymbol)")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("FormSpec only supports string keys")
      );
    });

    it("should not warn for string-keyed properties", () => {
      class FormWithStringProperties {
        @Label("Name")
        name!: string;

        @Label("Email")
        email!: string;
      }

      toFormSpec(FormWithStringProperties);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Empty FormSpec warning", () => {
    it("should warn when no elements are generated", () => {
      class EmptyForm {
        // No decorated fields
        undecoratedField!: string;
      }

      toFormSpec(EmptyForm);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[FormSpec] Generated FormSpec for EmptyForm has no elements")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Ensure class properties are decorated with field decorators like @Label()")
      );
    });

    it("should not warn when at least one element is generated", () => {
      class FormWithOneField {
        @Label("Name")
        name!: string;
      }

      toFormSpec(FormWithOneField);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Conflicting type hints warning", () => {
    it("should warn when multiple decorators set conflicting fieldType", () => {
      class FormWithConflictingTypes {
        name!: string;
      }

      // Simulate two decorators setting different field types
      setFieldMetadata(
        FormWithConflictingTypes.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { fieldType: "text" }
      );
      setFieldMetadata(
        FormWithConflictingTypes.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { fieldType: "number" }
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[FormSpec] Field has conflicting type hints: text vs number")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Using number"));
    });

    it("should not warn when same field type is set multiple times", () => {
      class FormWithConsistentTypes {
        name!: string;
      }

      // Same field type is fine
      setFieldMetadata(
        FormWithConsistentTypes.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { fieldType: "text" }
      );
      setFieldMetadata(
        FormWithConsistentTypes.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { fieldType: "text" }
      );

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should not warn when only one decorator sets field type", () => {
      class FormWithSingleType {
        name!: string;
      }

      setFieldMetadata(
        FormWithSingleType.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { fieldType: "text" }
      );
      setFieldMetadata(
        FormWithSingleType.prototype as unknown as Record<string | symbol, unknown>,
        "name",
        { label: "Name" }
      ); // No field type in second call

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Integration: Multiple warnings", () => {
    it("should produce multiple warnings when multiple issues occur", () => {
      const symbolKey = Symbol("symbolField");

      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class ProblematicForm {
        // No constructor that throws - we just have symbol metadata
      }

      // Add symbol metadata directly to trigger that warning
      setFieldMetadata(
        ProblematicForm.prototype as unknown as Record<string | symbol, unknown>,
        symbolKey,
        {
          label: "Symbol Field",
        }
      );

      toFormSpec(ProblematicForm);

      // Should have both symbol warning and empty FormSpec warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[FormSpec] Skipping symbol-keyed property")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[FormSpec] Generated FormSpec for ProblematicForm has no elements")
      );

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Warning format consistency", () => {
    it("all warnings should start with [FormSpec] prefix", () => {
      // eslint-disable-next-line @typescript-eslint/no-extraneous-class
      class TestForm {
        constructor() {
          throw new Error("Test");
        }
      }

      toFormSpec(TestForm);

      const calls = consoleWarnSpy.mock.calls;
      calls.forEach((call) => {
        expect(call[0]).toMatch(/^\[FormSpec\]/);
      });
    });
  });
});
