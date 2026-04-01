import {
  defineConstraint,
  defineConstraintTag,
  defineCustomType,
  defineExtension,
  type ConstraintTagRegistration,
  type CustomConstraintRegistration,
  type CustomTypeRegistration,
  type ExtensionApplicableType,
  type ExtensionPayloadValue,
} from "@formspec/core/internals";
import { createExtensionRegistry } from "../../extensions/index.js";

export const NUMERIC_EXTENSION_ID = "x-formspec/example-numeric";
export const DECIMAL_TYPE_ID = `${NUMERIC_EXTENSION_ID}/Decimal`;
export const BIGINT_TYPE_ID = `${NUMERIC_EXTENSION_ID}/BigInt`;

export interface DecimalValue {
  readonly coefficient: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^\d+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function parseDecimal(raw: string): DecimalValue {
  const match = DECIMAL_PATTERN.exec(raw.trim());
  if (!match?.[2]) {
    throw new Error(`Invalid decimal literal "${raw}"`);
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  const coefficient = sign * BigInt(digits === "" ? "0" : digits);
  return {
    coefficient,
    scale: fraction.length,
  };
}

export function formatDecimal(value: DecimalValue): string {
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString();
  const scale = value.scale;

  if (scale === 0) {
    return `${negative ? "-" : ""}${digits}.0`;
  }

  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale) || "0";
  const fraction = padded.slice(-scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function compareDecimal(left: DecimalValue, right: DecimalValue): -1 | 0 | 1 {
  const scale = Math.max(left.scale, right.scale);
  const leftAdjusted = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightAdjusted = right.coefficient * 10n ** BigInt(scale - right.scale);

  if (leftAdjusted === rightAdjusted) {
    return 0;
  }
  return leftAdjusted < rightAdjusted ? -1 : 1;
}

export function addDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  const leftAdjusted = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightAdjusted = right.coefficient * 10n ** BigInt(scale - right.scale);
  return {
    coefficient: leftAdjusted + rightAdjusted,
    scale,
  };
}

export function subtractDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  const scale = Math.max(left.scale, right.scale);
  const leftAdjusted = left.coefficient * 10n ** BigInt(scale - left.scale);
  const rightAdjusted = right.coefficient * 10n ** BigInt(scale - right.scale);
  return {
    coefficient: leftAdjusted - rightAdjusted,
    scale,
  };
}

function parseCanonicalDecimal(raw: string): string {
  return formatDecimal(parseDecimal(raw));
}

function parsePositiveInteger(raw: string): number {
  const trimmed = raw.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error(`Expected a positive integer, received "${raw}"`);
  }
  return Number(trimmed);
}

function parseNonNegativeInteger(raw: string): number {
  const trimmed = raw.trim();
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new Error(`Expected a non-negative integer, received "${raw}"`);
  }
  return Number(trimmed);
}

function isNumberLike(type: ExtensionApplicableType): boolean {
  return type.kind === "primitive" && type.primitiveKind === "number";
}

function isDecimalType(type: ExtensionApplicableType): boolean {
  return type.kind === "custom" && type.typeId === DECIMAL_TYPE_ID;
}

function isBigIntType(type: ExtensionApplicableType): boolean {
  return type.kind === "custom" && type.typeId === BIGINT_TYPE_ID;
}

function compareNumericPayloads(left: ExtensionPayloadValue, right: ExtensionPayloadValue): number {
  if (typeof left !== "number" || typeof right !== "number") {
    throw new Error("Numeric constraint payload comparator received a non-number payload");
  }
  return left - right;
}

function compareDecimalPayloads(left: ExtensionPayloadValue, right: ExtensionPayloadValue): number {
  if (typeof left !== "string" || typeof right !== "string") {
    throw new Error("Decimal constraint payload comparator received a non-string payload");
  }
  return compareDecimal(parseDecimal(left), parseDecimal(right));
}

export const decimalType: CustomTypeRegistration = defineCustomType({
  typeName: "Decimal",
  tsTypeNames: ["Decimal"],
  builtinConstraintBroadenings: [
    {
      tagName: "minimum",
      constraintName: "DecimalMinimum",
      parseValue: parseCanonicalDecimal,
    },
    {
      tagName: "maximum",
      constraintName: "DecimalMaximum",
      parseValue: parseCanonicalDecimal,
    },
    {
      tagName: "exclusiveMinimum",
      constraintName: "DecimalExclusiveMinimum",
      parseValue: parseCanonicalDecimal,
    },
    {
      tagName: "exclusiveMaximum",
      constraintName: "DecimalExclusiveMaximum",
      parseValue: parseCanonicalDecimal,
    },
    {
      tagName: "multipleOf",
      constraintName: "DecimalMultipleOf",
      parseValue: parseCanonicalDecimal,
    },
  ],
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-decimal`]: true,
  }),
});

export const bigIntType: CustomTypeRegistration = defineCustomType({
  typeName: "BigInt",
  tsTypeNames: ["bigint"],
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    [`${vendorPrefix}-bigint`]: true,
  }),
});

function decimalBoundConstraint(
  constraintName: string,
  keyword: string,
  bound: "lower" | "upper",
  inclusive: boolean
): CustomConstraintRegistration {
  return defineConstraint({
    constraintName,
    compositionRule: "intersect",
    applicableTypes: ["custom"],
    isApplicableToType: isDecimalType,
    comparePayloads: compareDecimalPayloads,
    semanticRole: {
      family: "decimal-bound",
      bound,
      inclusive,
    },
    toJsonSchema: (payload, vendorPrefix) => ({
      [`${vendorPrefix}-${keyword}`]: payload,
    }),
  });
}

const decimalMinimumConstraint = decimalBoundConstraint(
  "DecimalMinimum",
  "decimal-minimum",
  "lower",
  true
);
const decimalMaximumConstraint = decimalBoundConstraint(
  "DecimalMaximum",
  "decimal-maximum",
  "upper",
  true
);
const decimalExclusiveMinimumConstraint = decimalBoundConstraint(
  "DecimalExclusiveMinimum",
  "decimal-exclusive-minimum",
  "lower",
  false
);
const decimalExclusiveMaximumConstraint = decimalBoundConstraint(
  "DecimalExclusiveMaximum",
  "decimal-exclusive-maximum",
  "upper",
  false
);

const decimalMultipleOfConstraint = defineConstraint({
  constraintName: "DecimalMultipleOf",
  compositionRule: "intersect",
  applicableTypes: ["custom"],
  isApplicableToType: isDecimalType,
  comparePayloads: compareDecimalPayloads,
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-decimal-multiple-of`]: payload,
  }),
});

const maxSigFigConstraint = defineConstraint({
  constraintName: "MaxSigFig",
  compositionRule: "intersect",
  applicableTypes: ["primitive", "custom"],
  isApplicableToType: (type) => isNumberLike(type) || isDecimalType(type) || isBigIntType(type),
  comparePayloads: compareNumericPayloads,
  semanticRole: {
    family: "max-sig-fig",
    bound: "upper",
    inclusive: true,
  },
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-max-sig-fig`]: payload,
  }),
});

const maxDecimalPlacesConstraint = defineConstraint({
  constraintName: "MaxDecimalPlaces",
  compositionRule: "intersect",
  applicableTypes: ["primitive", "custom"],
  isApplicableToType: (type) => isNumberLike(type) || isDecimalType(type),
  comparePayloads: compareNumericPayloads,
  semanticRole: {
    family: "max-decimal-places",
    bound: "upper",
    inclusive: true,
  },
  toJsonSchema: (payload, vendorPrefix) => ({
    [`${vendorPrefix}-max-decimal-places`]: payload,
  }),
});

export const maxSigFigTag: ConstraintTagRegistration = defineConstraintTag({
  tagName: "maxSigFig",
  constraintName: "MaxSigFig",
  parseValue: parsePositiveInteger,
  isApplicableToType: (type) => isNumberLike(type) || isDecimalType(type) || isBigIntType(type),
});

export const maxDecimalPlacesTag: ConstraintTagRegistration = defineConstraintTag({
  tagName: "maxDecimalPlaces",
  constraintName: "MaxDecimalPlaces",
  parseValue: parseNonNegativeInteger,
  isApplicableToType: (type) => isNumberLike(type) || isDecimalType(type),
});

export const numericExtension = defineExtension({
  extensionId: NUMERIC_EXTENSION_ID,
  types: [decimalType, bigIntType],
  constraints: [
    decimalMinimumConstraint,
    decimalMaximumConstraint,
    decimalExclusiveMinimumConstraint,
    decimalExclusiveMaximumConstraint,
    decimalMultipleOfConstraint,
    maxSigFigConstraint,
    maxDecimalPlacesConstraint,
  ],
  constraintTags: [maxSigFigTag, maxDecimalPlacesTag],
});

export function createNumericExtensionRegistry() {
  return createExtensionRegistry([numericExtension]);
}
