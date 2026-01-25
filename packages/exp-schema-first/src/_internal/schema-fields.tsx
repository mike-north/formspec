/**
 * Schema-to-Fields: Schema generates renderable field components
 *
 * The schema IS the form definition.
 */

import type { FC, ReactNode } from "react";
import { z } from "zod";

// =============================================================================
// Types
// =============================================================================

type FieldComponent = FC<{ label?: string; className?: string }>;

type SchemaFields<T extends z.ZodRawShape> = {
  [K in keyof T]: FieldComponent;
};

interface FormFromSchemaProps<T> {
  onSubmit?: (values: T) => void;
  children: ReactNode;
}

interface SchemaFormResult<T extends z.ZodRawShape> {
  /** Pre-built field components - just render them */
  fields: SchemaFields<T>;
  /** Form wrapper with typed onSubmit */
  Form: FC<FormFromSchemaProps<z.infer<z.ZodObject<T>>>>;
  /** The underlying Zod schema */
  schema: z.ZodObject<T>;
}

// =============================================================================
// Implementation
// =============================================================================

function getFieldType(zodType: z.ZodTypeAny): "text" | "number" | "checkbox" | "select" {
  if (zodType instanceof z.ZodString) return "text";
  if (zodType instanceof z.ZodNumber) return "number";
  if (zodType instanceof z.ZodBoolean) return "checkbox";
  if (zodType instanceof z.ZodEnum) return "select";
  // Unwrap optional/nullable
  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable) {
    return getFieldType(zodType.unwrap());
  }
  return "text";
}

interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  type?: string;
  options?: readonly string[];
}

function getFieldConstraints(zodType: z.ZodTypeAny): FieldConstraints {
  const constraints: FieldConstraints = {};

  if (zodType instanceof z.ZodString) {
    const checks = (zodType as z.ZodString)._def.checks;
    for (const check of checks) {
      if (check.kind === "min") constraints.minLength = check.value;
      if (check.kind === "max") constraints.maxLength = check.value;
      if (check.kind === "email") constraints.type = "email";
    }
  }

  if (zodType instanceof z.ZodNumber) {
    const checks = (zodType as z.ZodNumber)._def.checks;
    for (const check of checks) {
      if (check.kind === "min") constraints.min = check.value;
      if (check.kind === "max") constraints.max = check.value;
    }
  }

  if (zodType instanceof z.ZodEnum) {
    constraints.options = (zodType as z.ZodEnum<[string, ...string[]]>).options;
  }

  return constraints;
}

function createFieldComponent(
  name: string,
  zodType: z.ZodTypeAny
): FieldComponent {
  const fieldType = getFieldType(zodType);
  const constraints = getFieldConstraints(zodType);
  const description = zodType._def.description;

  return function FieldComponent({ label, className }) {
    const displayLabel = label ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");

    switch (fieldType) {
      case "checkbox":
        return (
          <div className={className}>
            <input type="checkbox" id={name} name={name} />
            <label htmlFor={name}>{displayLabel}</label>
            {description && <small>{description}</small>}
          </div>
        );

      case "select":
        return (
          <div className={className}>
            <label htmlFor={name}>{displayLabel}</label>
            <select id={name} name={name}>
              {constraints.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {description && <small>{description}</small>}
          </div>
        );

      case "number":
        return (
          <div className={className}>
            <label htmlFor={name}>{displayLabel}</label>
            <input
              type="number"
              id={name}
              name={name}
              min={constraints.min}
              max={constraints.max}
            />
            {description && <small>{description}</small>}
          </div>
        );

      default:
        return (
          <div className={className}>
            <label htmlFor={name}>{displayLabel}</label>
            <input
              type={constraints.type === "email" ? "email" : "text"}
              id={name}
              name={name}
              minLength={constraints.minLength}
              maxLength={constraints.maxLength}
            />
            {description && <small>{description}</small>}
          </div>
        );
    }
  };
}

/**
 * Convert a Zod schema into renderable field components.
 *
 * Usage:
 *   const Contact = fromSchema(z.object({
 *     name: z.string(),
 *     email: z.string().email(),
 *   }));
 *
 *   <Contact.Form onSubmit={console.log}>
 *     <Contact.fields.name />
 *     <Contact.fields.email />
 *     <button type="submit">Send</button>
 *   </Contact.Form>
 */
export function fromSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): SchemaFormResult<T> {
  const shape = schema.shape;
  const fields = {} as SchemaFields<T>;

  for (const [key, zodType] of Object.entries(shape)) {
    (fields as Record<string, FieldComponent>)[key] = createFieldComponent(
      key,
      zodType as z.ZodTypeAny
    );
  }

  const Form: FC<FormFromSchemaProps<z.infer<z.ZodObject<T>>>> = ({
    onSubmit,
    children,
  }) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const values = Object.fromEntries(formData);
      const result = schema.safeParse(values);
      if (result.success && onSubmit) {
        onSubmit(result.data);
      }
    };

    return <form onSubmit={handleSubmit}>{children}</form>;
  };

  return { fields, Form, schema };
}
