/**
 * Tests for @formspec/decorators — marker-only TC39 Stage 3 decorators.
 *
 * Verifies that:
 * 1. All built-in decorators are callable no-ops (don't throw, don't modify fields).
 * 2. Factory functions (extendDecorator, customDecorator) produce callable no-ops.
 * 3. Brand types are correctly applied (verified via type assertions).
 *
 * @see https://github.com/tc39/proposal-decorators (TC39 Stage 3 decorators)
 */

import { describe, it, expect } from "vitest";
import {
  Field,
  Group,
  ShowWhen,
  EnumOptions,
  Minimum,
  Maximum,
  ExclusiveMinimum,
  ExclusiveMaximum,
  MinLength,
  MaxLength,
  Pattern,
  extendDecorator,
  customDecorator,
  FORMSPEC_EXTENDS,
  FORMSPEC_EXTENSION,
  FORMSPEC_MARKER,
  type FieldOptions,
  type FormSpecDecorators,
  type FormSpecExtendsBrand,
  type FormSpecExtensionBrand,
  type FormSpecMarkerBrand,
} from "../index.js";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Creates a minimal ClassFieldDecoratorContext for testing.
 *
 * TC39 Stage 3 field decorators receive `(undefined, context)`. We only
 * need enough of the context to not throw — since our decorators are
 * no-ops, they never inspect the context.
 */
function makeFieldContext(name: string): ClassFieldDecoratorContext {
  return {
    kind: "field",
    name,
    static: false,
    private: false,
    access: {
      get: () => undefined,
      set: () => {
        // no-op
      },
      has: () => true,
    },
    metadata: {},
    addInitializer: () => {
      // no-op
    },
  } as ClassFieldDecoratorContext;
}

/**
 * Calls a decorator and asserts it does not throw and returns undefined.
 */
function expectNoOpDecorator(
  decorator: (value: undefined, context: ClassFieldDecoratorContext) => void,
  ctx: ClassFieldDecoratorContext
): void {
  expect(() => {
    decorator(undefined, ctx);
  }).not.toThrow();
  // Verify the decorator returns undefined (i.e., doesn't return an initializer).
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- intentionally capturing void to assert it's undefined
  expect(decorator(undefined, ctx)).toBeUndefined();
}

// =============================================================================
// Built-in decorators — runtime behaviour
// =============================================================================

describe("built-in decorators", () => {
  const ctx = makeFieldContext("testField");

  it("Field() returns a no-op decorator", () => {
    expectNoOpDecorator(Field({ displayName: "Test" }), ctx);
  });

  it("Group() returns a no-op decorator", () => {
    expectNoOpDecorator(Group("section-a"), ctx);
  });

  it("ShowWhen() returns a no-op decorator", () => {
    const decorator = ShowWhen({ field: "role", value: "admin" });
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("EnumOptions() returns a no-op decorator (array input)", () => {
    const decorator = EnumOptions(["a", "b"]);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("EnumOptions() returns a no-op decorator (record input)", () => {
    const decorator = EnumOptions({ a: "Label A", b: "Label B" });
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("EnumOptions() returns a no-op decorator (labeled object input)", () => {
    const decorator = EnumOptions([
      { id: "us", label: "United States" },
      { id: "ca", label: "Canada" },
    ]);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("Minimum() returns a no-op decorator", () => {
    const decorator = Minimum(0);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("Maximum() returns a no-op decorator", () => {
    const decorator = Maximum(100);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("ExclusiveMinimum() returns a no-op decorator", () => {
    const decorator = ExclusiveMinimum(0);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("ExclusiveMaximum() returns a no-op decorator", () => {
    const decorator = ExclusiveMaximum(100);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("MinLength() returns a no-op decorator", () => {
    const decorator = MinLength(1);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("MaxLength() returns a no-op decorator", () => {
    const decorator = MaxLength(255);
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("Pattern() returns a no-op decorator", () => {
    const decorator = Pattern("^[a-z]+$");
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });

  it("all decorators share the same no-op function identity", () => {
    // All parameterised built-ins should return the exact same function reference
    const decorators = [
      Field({ displayName: "x" }),
      Group("x"),
      ShowWhen({ field: "x", value: "y" }),
      EnumOptions(["a"]),
      Minimum(0),
      Maximum(1),
      ExclusiveMinimum(0),
      ExclusiveMaximum(1),
      MinLength(0),
      MaxLength(1),
      Pattern("x"),
    ];

    const first = decorators[0];
    for (const dec of decorators) {
      expect(dec).toBe(first);
    }
  });
});

// =============================================================================
// extendDecorator — runtime behaviour
// =============================================================================

describe("extendDecorator", () => {
  const ctx = makeFieldContext("testField");

  it("produces a parameterised decorator via .as()", () => {
    const CurrencyField = extendDecorator("Field").as<{
      displayName: string;
      currency: string;
    }>("CurrencyField");

    expect(typeof CurrencyField).toBe("function");

    const decorator = CurrencyField({
      displayName: "Amount",
      currency: "USD",
    });
    expectNoOpDecorator(decorator, ctx);
  });

  it("accepts any valid keyof FormSpecDecorators as the extends target", () => {
    const targets: (keyof FormSpecDecorators)[] = [
      "Field",
      "Group",
      "ShowWhen",
      "EnumOptions",
      "Minimum",
      "Maximum",
      "ExclusiveMinimum",
      "ExclusiveMaximum",
      "MinLength",
      "MaxLength",
      "Pattern",
    ];

    for (const target of targets) {
      const factory = extendDecorator(target);
      expect(typeof factory.as).toBe("function");
    }
  });

  it("decorator produced by .as() is a no-op (does not modify the field)", () => {
    const CustomMinimum = extendDecorator("Minimum").as<number>("CustomMinimum");
    const decorator = CustomMinimum(42);

    // No-op: returns void, no side effects
    decorator(undefined, ctx);
    // If it returned something, the above would have a non-void return.
    // We verify via the shared helper pattern used elsewhere.
    expectNoOpDecorator(decorator, ctx);
  });
});

// =============================================================================
// customDecorator — runtime behaviour
// =============================================================================

describe("customDecorator", () => {
  const ctx = makeFieldContext("testField");

  describe("with extension name", () => {
    it(".as() produces a parameterised no-op decorator", () => {
      const Tooltip = customDecorator("my-ext").as<{ text: string }>("Tooltip");
      expect(typeof Tooltip).toBe("function");

      const decorator = Tooltip({ text: "help" });
      expectNoOpDecorator(decorator, ctx);
    });

    it(".marker() produces a direct no-op decorator", () => {
      const Sensitive = customDecorator("my-ext").marker("Sensitive");
      expect(typeof Sensitive).toBe("function");

      // marker is applied directly — no extra call
      expectNoOpDecorator(Sensitive, ctx);
    });
  });

  describe("without extension name", () => {
    it(".as() produces a parameterised no-op decorator", () => {
      const Custom = customDecorator().as<{ foo: number }>("Custom");
      expect(typeof Custom).toBe("function");

      const decorator = Custom({ foo: 1 });
      expect(() => {
        decorator(undefined, ctx);
      }).not.toThrow();
    });

    it(".marker() produces a direct no-op decorator", () => {
      const Title = customDecorator().marker("Title");
      expect(typeof Title).toBe("function");

      expect(() => {
        Title(undefined, ctx);
      }).not.toThrow();
    });
  });
});

// =============================================================================
// Brand type verification (compile-time assertions exercised at runtime)
// =============================================================================

describe("brand types", () => {
  it("extendDecorator result has FormSpecExtendsBrand type", () => {
    const CustomField = extendDecorator("Field").as<FieldOptions>("CustomField");

    // This is a compile-time assertion: the type system ensures this assignment
    // is valid. If FormSpecExtendsBrand were missing, this would fail to compile.
    const _branded: FormSpecExtendsBrand<"Field"> = CustomField;
    expect(_branded).toBeDefined();

    // Runtime: the factory is still callable
    expect(typeof CustomField).toBe("function");
  });

  it("customDecorator.as() result has FormSpecExtensionBrand type", () => {
    const Tooltip = customDecorator("my-ui-ext").as<{ text: string }>("Tooltip");

    const _branded: FormSpecExtensionBrand<"my-ui-ext"> = Tooltip;
    expect(_branded).toBeDefined();

    expect(typeof Tooltip).toBe("function");
  });

  it("customDecorator.marker() result has FormSpecMarkerBrand and FormSpecExtensionBrand types", () => {
    const Sensitive = customDecorator("my-ui-ext").marker("Sensitive");

    const _markerBrand: FormSpecMarkerBrand = Sensitive;
    const _extBrand: FormSpecExtensionBrand<"my-ui-ext"> = Sensitive;
    expect(_markerBrand).toBeDefined();
    expect(_extBrand).toBeDefined();

    expect(typeof Sensitive).toBe("function");
  });

  it("customDecorator().marker() (no extension) has FormSpecMarkerBrand", () => {
    const Title = customDecorator().marker("Title");

    const _markerBrand: FormSpecMarkerBrand = Title;
    expect(_markerBrand).toBeDefined();

    expect(typeof Title).toBe("function");
  });
});

// =============================================================================
// FormSpecDecorators registry — type verification
// =============================================================================

describe("FormSpecDecorators registry", () => {
  it("has all expected built-in keys", () => {
    // Compile-time check: this object must satisfy Record<keyof FormSpecDecorators, true>.
    // If a key were missing from the interface, this would not compile.
    const keys: Record<keyof FormSpecDecorators, true> = {
      Field: true,
      Group: true,
      ShowWhen: true,
      EnumOptions: true,
      Minimum: true,
      Maximum: true,
      ExclusiveMinimum: true,
      ExclusiveMaximum: true,
      MinLength: true,
      MaxLength: true,
      Pattern: true,
    };

    expect(Object.keys(keys)).toHaveLength(11);
  });
});

// =============================================================================
// Symbol exports — runtime verification
// =============================================================================

describe("symbol exports", () => {
  it("FORMSPEC_EXTENDS is a unique symbol", () => {
    expect(typeof FORMSPEC_EXTENDS).toBe("symbol");
    expect(FORMSPEC_EXTENDS.toString()).toBe("Symbol(formspec.extends)");
  });

  it("FORMSPEC_EXTENSION is a unique symbol", () => {
    expect(typeof FORMSPEC_EXTENSION).toBe("symbol");
    expect(FORMSPEC_EXTENSION.toString()).toBe("Symbol(formspec.extension)");
  });

  it("FORMSPEC_MARKER is a unique symbol", () => {
    expect(typeof FORMSPEC_MARKER).toBe("symbol");
    expect(FORMSPEC_MARKER.toString()).toBe("Symbol(formspec.marker)");
  });

  it("all three symbols are distinct", () => {
    expect(FORMSPEC_EXTENDS).not.toBe(FORMSPEC_EXTENSION);
    expect(FORMSPEC_EXTENDS).not.toBe(FORMSPEC_MARKER);
    expect(FORMSPEC_EXTENSION).not.toBe(FORMSPEC_MARKER);
  });
});

// =============================================================================
// Negative tests
// =============================================================================

describe("negative tests", () => {
  const ctx = makeFieldContext("testField");

  it("built-in decorators do not modify a class field's initializer", () => {
    // TC39 decorators can return an initializer function to modify the field.
    // Our no-ops must NOT do this.
    expectNoOpDecorator(Field({ displayName: "test" }), ctx);
  });

  it("factory-produced decorators do not modify a class field's initializer", () => {
    const Custom = extendDecorator("Minimum").as<number>("Custom");
    expectNoOpDecorator(Custom(42), ctx);

    const Marker = customDecorator("ext").marker("M");
    expectNoOpDecorator(Marker, ctx);
  });

  it("calling a parameterised decorator with no args still returns a decorator", () => {
    // Even though these have typed args, we verify the factory itself doesn't throw
    // when the decorator it produces is called.
    const dec = customDecorator("ext").as<{ required: boolean }>("Dec");
    // @ts-expect-error — intentionally passing wrong arg type to verify no runtime throw
    const decorator = dec("not an object");
    expect(typeof decorator).toBe("function");
    expect(() => {
      decorator(undefined, ctx);
    }).not.toThrow();
  });
});
