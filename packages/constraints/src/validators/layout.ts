import type { LayoutConstraints, Severity, ValidationIssue } from "../types.js";

/**
 * Context for layout validation.
 */
export interface LayoutContext {
  /** The type of layout element ("group" | "conditional") */
  layoutType: "group" | "conditional";
  /** Optional label for the element (for groups) */
  label?: string;
  /** Current nesting depth */
  depth: number;
  /** Path to this element */
  path?: string;
}

/**
 * Validates a layout element against constraints.
 *
 * @param context - Information about the layout element
 * @param constraints - Layout constraints
 * @returns Array of validation issues (empty if valid)
 */
export function validateLayout(
  context: LayoutContext,
  constraints: LayoutConstraints
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if groups are allowed
  if (context.layoutType === "group") {
    const groupSeverity = constraints.group;
    if (groupSeverity && groupSeverity !== "off") {
      issues.push(createGroupIssue(context, groupSeverity));
    }
  }

  // Check if conditionals are allowed
  if (context.layoutType === "conditional") {
    const conditionalSeverity = constraints.conditionals;
    if (conditionalSeverity && conditionalSeverity !== "off") {
      issues.push(createConditionalIssue(context, conditionalSeverity));
    }
  }

  // Check nesting depth (applies to both groups and fields within nested structures)
  const maxDepth = constraints.maxNestingDepth;
  if (maxDepth !== undefined && context.depth > maxDepth) {
    issues.push(createNestingDepthIssue(context, maxDepth));
  }

  return issues;
}

/**
 * Creates a validation issue for a disallowed group.
 */
function createGroupIssue(
  context: LayoutContext,
  severity: Severity
): ValidationIssue {
  const labelInfo = context.label ? ` "${context.label}"` : "";
  const issue: ValidationIssue = {
    code: "DISALLOWED_GROUP",
    message: `Group${labelInfo} is not allowed - visual grouping is not supported in this project`,
    severity: severity === "error" ? "error" : "warning",
    category: "layout",
  };
  if (context.path !== undefined) {
    issue.path = context.path;
  }
  return issue;
}

/**
 * Creates a validation issue for a disallowed conditional.
 */
function createConditionalIssue(
  context: LayoutContext,
  severity: Severity
): ValidationIssue {
  const issue: ValidationIssue = {
    code: "DISALLOWED_CONDITIONAL",
    message: `Conditional visibility (when/is) is not allowed in this project`,
    severity: severity === "error" ? "error" : "warning",
    category: "layout",
  };
  if (context.path !== undefined) {
    issue.path = context.path;
  }
  return issue;
}

/**
 * Creates a validation issue for exceeding nesting depth.
 */
function createNestingDepthIssue(
  context: LayoutContext,
  maxDepth: number
): ValidationIssue {
  const issue: ValidationIssue = {
    code: "EXCEEDED_NESTING_DEPTH",
    message: `Nesting depth ${String(context.depth)} exceeds maximum allowed depth of ${String(maxDepth)}`,
    severity: "error",
    category: "layout",
  };
  if (context.path !== undefined) {
    issue.path = context.path;
  }
  return issue;
}

/**
 * Checks if a layout type is allowed by the constraints.
 *
 * @param layoutType - The type of layout element
 * @param constraints - Layout constraints
 * @returns true if allowed, false if disallowed
 */
export function isLayoutTypeAllowed(
  layoutType: "group" | "conditional",
  constraints: LayoutConstraints
): boolean {
  if (layoutType === "group") {
    const severity = constraints.group;
    return !severity || severity === "off";
  }

  // layoutType === "conditional"
  const severity = constraints.conditionals;
  return !severity || severity === "off";
}

/**
 * Checks if a nesting depth is allowed.
 *
 * @param depth - Current nesting depth
 * @param constraints - Layout constraints
 * @returns true if allowed, false if exceeds limit
 */
export function isNestingDepthAllowed(
  depth: number,
  constraints: LayoutConstraints
): boolean {
  const maxDepth = constraints.maxNestingDepth;
  if (maxDepth === undefined) {
    return true;
  }
  return depth <= maxDepth;
}
