import { customDecorator } from "@formspec/decorators";

/**
 * Marks a field as the form title (displayed prominently).
 * Emits: x-formspec-ui-hints: true
 */
export const Title = customDecorator("ui-hints").marker("Title");

/**
 * Marks a field as the form subtitle (secondary display).
 * Emits: x-formspec-ui-hints: true
 */
export const Subtitle = customDecorator("ui-hints").marker("Subtitle");

/**
 * Marks a field as triggering an action.
 * Emits: x-formspec-actions: { label, style? }
 */
export const Action = customDecorator("actions").as<{
  label: string;
  style?: "primary" | "secondary" | "danger";
}>("Action");
