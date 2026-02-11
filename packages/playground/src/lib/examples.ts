/**
 * Example FormSpec code snippets for the playground.
 */

export interface Example {
  name: string;
  description: string;
  code: string;
}

export const examples: Example[] = [
  {
    name: "Basic Contact Form",
    description: "Simple form with text fields and validation",
    code: `import { formspec, field, group } from "@formspec/dsl";

const ContactForm = formspec(
  group("Contact Information",
    field.text("name", { label: "Full Name", required: true }),
    field.text("email", { label: "Email Address", required: true }),
    field.text("phone", { label: "Phone Number" }),
  ),
  group("Message",
    field.text("subject", { label: "Subject", required: true }),
    field.text("message", { label: "Message", required: true }),
  ),
);

export default ContactForm;`,
  },
  {
    name: "User Registration",
    description: "Registration form with conditionals and enums",
    code: `import { formspec, field, group, when, is } from "@formspec/dsl";

const RegistrationForm = formspec(
  group("Account Details",
    field.text("username", { label: "Username", required: true }),
    field.text("email", { label: "Email", required: true }),
    field.text("password", { label: "Password", required: true }),
  ),
  group("Profile",
    field.text("firstName", { label: "First Name", required: true }),
    field.text("lastName", { label: "Last Name", required: true }),
    field.enum("accountType", ["personal", "business"] as const, {
      label: "Account Type",
      required: true,
    }),
  ),
  when(is("accountType", "business"),
    group("Business Details",
      field.text("companyName", { label: "Company Name", required: true }),
      field.text("taxId", { label: "Tax ID" }),
    ),
  ),
);

export default RegistrationForm;`,
  },
  {
    name: "Product Configuration",
    description: "Nested objects and arrays",
    code: `import { formspec, field, group } from "@formspec/dsl";

const ProductForm = formspec(
  group("Basic Info",
    field.text("name", { label: "Product Name", required: true }),
    field.text("description", { label: "Description" }),
    field.number("price", { label: "Price", min: 0, required: true }),
  ),
  group("Inventory",
    field.number("stock", { label: "Stock Quantity", min: 0 }),
    field.boolean("trackInventory", { label: "Track Inventory" }),
  ),
  field.arrayWithConfig("variants", {
    label: "Product Variants",
    minItems: 1,
  },
    field.text("sku", { label: "SKU", required: true }),
    field.text("color", { label: "Color" }),
    field.text("size", { label: "Size" }),
    field.number("additionalPrice", { label: "Price Adjustment" }),
  ),
);

export default ProductForm;`,
  },
  {
    name: "Survey Form",
    description: "Multiple conditionals and enum options",
    code: `import { formspec, field, group, when, is } from "@formspec/dsl";

const SurveyForm = formspec(
  group("Demographics",
    field.text("name", { label: "Your Name" }),
    field.enum("ageRange", [
      { id: "18-24", label: "18-24" },
      { id: "25-34", label: "25-34" },
      { id: "35-44", label: "35-44" },
      { id: "45-54", label: "45-54" },
      { id: "55+", label: "55 and above" },
    ] as const, { label: "Age Range" }),
  ),
  group("Feedback",
    field.enum("satisfaction", [
      "very_satisfied",
      "satisfied",
      "neutral",
      "dissatisfied",
      "very_dissatisfied",
    ] as const, { label: "Overall Satisfaction", required: true }),
    field.boolean("wouldRecommend", { label: "Would you recommend us?" }),
  ),
  when(is("satisfaction", "very_dissatisfied"),
    field.text("improvementSuggestions", {
      label: "What could we improve?",
      required: true,
    }),
  ),
  when(is("wouldRecommend", true),
    field.number("recommendationScore", {
      label: "How likely are you to recommend? (1-10)",
      min: 1,
      max: 10,
    }),
  ),
);

export default SurveyForm;`,
  },
  {
    name: "Minimal Example",
    description: "Simplest possible FormSpec",
    code: `import { formspec, field } from "@formspec/dsl";

const SimpleForm = formspec(
  field.text("name", { label: "Name", required: true }),
  field.text("email", { label: "Email" }),
);

export default SimpleForm;`,
  },
];

// Safe fallback: examples array is statically defined with at least one element
export const defaultExample = examples[0] ?? examples[examples.length - 1] ?? {
  name: "Default",
  description: "Default example",
  code: 'import { formspec, field } from "@formspec/dsl";\nexport default formspec(field.text("name"));',
};
