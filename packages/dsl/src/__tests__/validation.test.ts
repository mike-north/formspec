import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formspec, formspecWithValidation, field, group, when, validateForm } from "../index.js";

describe("validateForm", () => {
  describe("duplicate field detection", () => {
    it("should detect duplicate field names at root level", () => {
      const elements = [
        field.text("name"),
        field.text("email"),
        field.text("name"), // duplicate
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(true); // duplicates are warnings, not errors
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.severity).toBe("warning");
      expect(result.issues[0]!.message).toContain('Duplicate field name "name"');
      expect(result.issues[0]!.message).toContain("2 times");
    });

    it("should detect duplicate field names inside groups", () => {
      const elements = [
        group(
          "Personal",
          field.text("name"),
        ),
        group(
          "Business",
          field.text("name"), // duplicate
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.severity).toBe("warning");
      expect(result.issues[0]!.message).toContain('Duplicate field name "name"');
    });

    it("should detect duplicate field names inside conditionals", () => {
      const elements = [
        field.enum("type", ["a", "b"] as const),
        field.text("value"),
        when(
          "type",
          "a",
          field.text("value"), // duplicate
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.severity).toBe("warning");
    });

    it("should allow same field names inside different array items (separate scope)", () => {
      // Fields inside arrays are in a different scope - this is valid
      const elements = [
        field.array(
          "addresses",
          field.text("street"),
          field.text("city"),
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should not flag unique field names", () => {
      const elements = [
        field.text("firstName"),
        field.text("lastName"),
        field.text("email"),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("field reference validation", () => {
    it("should detect references to non-existent fields", () => {
      const elements = [
        field.text("name"),
        when(
          "status",
          "draft", // "status" doesn't exist!
          field.text("notes"),
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.severity).toBe("error");
      expect(result.issues[0]!.message).toContain('non-existent field "status"');
    });

    it("should pass when conditional references existing field", () => {
      const elements = [
        field.enum("status", ["draft", "sent"] as const),
        when(
          "status",
          "draft",
          field.text("notes"),
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should detect reference errors in nested conditionals", () => {
      const elements = [
        field.enum("type", ["a", "b"] as const),
        when(
          "type",
          "a",
          when(
            "subtype",
            "x", // "subtype" doesn't exist!
            field.text("extra"),
          ),
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes('"subtype"'))).toBe(true);
    });

    it("should allow forward references (field defined after conditional)", () => {
      // This is valid - the conditional references a field that's defined later
      const elements = [
        when(
          "status",
          "draft",
          field.text("notes"),
        ),
        field.enum("status", ["draft", "sent"] as const),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(true);
    });
  });

  describe("combined issues", () => {
    it("should report multiple issues", () => {
      const elements = [
        field.text("name"),
        field.text("name"), // duplicate
        when(
          "nonExistent",
          "value", // reference error
          field.text("extra"),
        ),
      ] as const;

      const result = validateForm(elements);

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.filter((i) => i.severity === "warning")).toHaveLength(1);
      expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(1);
    });
  });
});

describe("formspecWithValidation", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should not validate when validate=false", () => {
    formspecWithValidation(
      { validate: false },
      field.text("name"),
      when("nonExistent", "value", field.text("notes")),
    );

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should log warnings when validate=true", () => {
    formspecWithValidation(
      { validate: true },
      field.text("name"),
      field.text("name"), // duplicate
    );

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("should log errors when validate=true and there are errors", () => {
    formspecWithValidation(
      { validate: true },
      field.text("name"),
      when("nonExistent", "value", field.text("notes")),
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should include form name in validation messages", () => {
    formspecWithValidation(
      { validate: true, name: "TestForm" },
      field.text("name"),
      field.text("name"),
    );

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("TestForm"),
    );
  });

  it("should throw when validate='throw' and there are errors", () => {
    expect(() =>
      formspecWithValidation(
        { validate: "throw" },
        field.text("name"),
        when("nonExistent", "value", field.text("notes")),
      ),
    ).toThrow("Form validation failed");
  });

  it("should not throw when validate='throw' and there are only warnings", () => {
    expect(() =>
      formspecWithValidation(
        { validate: "throw" },
        field.text("name"),
        field.text("name"), // duplicate - just a warning
      ),
    ).not.toThrow();
  });

  it("should work with validate='warn'", () => {
    formspecWithValidation(
      { validate: "warn" },
      field.text("name"),
      field.text("name"),
    );

    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("should return correct form structure regardless of validation", () => {
    const form = formspecWithValidation(
      { validate: true, name: "Test" },
      field.text("name"),
      field.number("age"),
    );

    expect(form.elements).toHaveLength(2);
    expect(form.elements[0]._type).toBe("field");
    expect(form.elements[1]._type).toBe("field");
  });
});

describe("validation with complex structures", () => {
  it("should validate fields inside object fields", () => {
    const elements = [
      field.object(
        "address",
        field.text("street"),
        field.text("street"), // duplicate inside object
      ),
    ] as const;

    const result = validateForm(elements);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.message).toContain('"street"');
  });

  it("should validate deeply nested structures", () => {
    const elements = [
      group(
        "Outer",
        group(
          "Inner",
          field.enum("type", ["a", "b"] as const),
          when(
            "type",
            "a",
            field.object(
              "details",
              field.text("name"),
              when(
                "missing",
                "value", // doesn't exist!
                field.text("extra"),
              ),
            ),
          ),
        ),
      ),
    ] as const;

    const result = validateForm(elements);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('"missing"'))).toBe(true);
  });
});
