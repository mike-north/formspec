import { formspec, field } from "@formspec/dsl";

export const EnumVariantsForm = formspec(
  field.enum("simpleStatus", ["draft", "active", "archived"] as const, {
    label: "Status",
  }),
  field.enum(
    "labeledPriority",
    [
      { id: "low", label: "Low Priority" },
      { id: "medium", label: "Medium Priority" },
      { id: "high", label: "High Priority" },
    ] as const,
    { label: "Priority", required: true }
  ),
  field.dynamicEnum("country", "countries", { label: "Country" }),
  field.dynamicEnum("city", "cities", { label: "City", params: ["country"] })
);
