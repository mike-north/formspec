declare module "@formspec/config/browser" {
  export interface FieldTypeConstraints {
    text?: "error" | "warn" | "off";
    number?: "error" | "warn" | "off";
    boolean?: "error" | "warn" | "off";
    staticEnum?: "error" | "warn" | "off";
    dynamicEnum?: "error" | "warn" | "off";
    dynamicSchema?: "error" | "warn" | "off";
    array?: "error" | "warn" | "off";
    object?: "error" | "warn" | "off";
  }

  export interface LayoutConstraints {
    group?: "error" | "warn" | "off";
    conditionals?: "error" | "warn" | "off";
    maxNestingDepth?: number;
  }

  export type Severity = "error" | "warn" | "off";

  export function getFieldTypeSeverity(
    fieldType: string,
    constraints: FieldTypeConstraints
  ): Severity;

  export function isLayoutTypeAllowed(layoutType: string, constraints: LayoutConstraints): boolean;
}
