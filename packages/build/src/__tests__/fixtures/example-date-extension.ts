import {
  defineConstraint,
  defineConstraintTag,
  defineCustomType,
  defineExtension,
  type ConstraintTagRegistration,
  type CustomConstraintRegistration,
  type CustomTypeRegistration,
  type JsonValue,
  type TypeNode,
} from "@formspec/core";
import { createExtensionRegistry } from "../../extensions/index.js";

export const DATE_EXTENSION_ID = "x-formspec/example-date";
export const DATE_TIME_TYPE_ID = `${DATE_EXTENSION_ID}/DateTime`;

const ISO_DATE_TIME_WITH_MILLIS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})$/;

export function parseCanonicalDateTime(raw: string): string {
  const trimmed = raw.trim();
  if (!ISO_DATE_TIME_WITH_MILLIS_PATTERN.test(trimmed)) {
    throw new Error(
      `Expected an ISO-8601 date-time with exactly millisecond precision and an explicit timezone, received "${raw}"`
    );
  }

  const value = new Date(trimmed);
  if (Number.isNaN(value.valueOf())) {
    throw new Error(`Invalid ISO-8601 date-time "${raw}"`);
  }

  return value.toISOString();
}

function isDateTimeType(type: TypeNode): boolean {
  return type.kind === "custom" && type.typeId === DATE_TIME_TYPE_ID;
}

function compareDateTimePayloads(left: JsonValue, right: JsonValue): number {
  if (typeof left !== "string" || typeof right !== "string") {
    throw new Error("DateTime constraint payload comparator received a non-string payload");
  }

  const leftValue = Date.parse(left);
  const rightValue = Date.parse(right);
  if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
    throw new Error("DateTime comparator received an invalid canonical payload");
  }

  return leftValue - rightValue;
}

export const dateTimeType: CustomTypeRegistration = defineCustomType({
  typeName: "DateTime",
  tsTypeNames: ["DateTime"],
  toJsonSchema: (_payload, vendorPrefix) => ({
    type: "string",
    format: "date-time",
    pattern: ISO_DATE_TIME_WITH_MILLIS_PATTERN.source,
    [`${vendorPrefix}-date-time`]: true,
  }),
});

function dateBoundConstraint(
  constraintName: string,
  keyword: string,
  bound: "lower" | "upper"
): CustomConstraintRegistration {
  return defineConstraint({
    constraintName,
    compositionRule: "intersect",
    applicableTypes: ["custom"],
    isApplicableToType: isDateTimeType,
    comparePayloads: compareDateTimePayloads,
    semanticRole: {
      family: "date-time-bound",
      bound,
      inclusive: false,
    },
    toJsonSchema: (payload, vendorPrefix) => ({
      [`${vendorPrefix}-${keyword}`]: payload,
    }),
  });
}

export const afterConstraint = dateBoundConstraint("After", "after", "lower");
export const beforeConstraint = dateBoundConstraint("Before", "before", "upper");

export const afterTag: ConstraintTagRegistration = defineConstraintTag({
  tagName: "after",
  constraintName: "After",
  parseValue: parseCanonicalDateTime,
  isApplicableToType: isDateTimeType,
});

export const beforeTag: ConstraintTagRegistration = defineConstraintTag({
  tagName: "before",
  constraintName: "Before",
  parseValue: parseCanonicalDateTime,
  isApplicableToType: isDateTimeType,
});

export const dateExtension = defineExtension({
  extensionId: DATE_EXTENSION_ID,
  types: [dateTimeType],
  constraints: [afterConstraint, beforeConstraint],
  constraintTags: [afterTag, beforeTag],
});

export function createDateExtensionRegistry() {
  return createExtensionRegistry([dateExtension]);
}
