import {
  getTagDefinition,
  normalizeFormSpecTagName,
  type TagDefinition,
} from "@formspec/analysis/internal";

export type { FormSpecTargetKind, FormSpecValueKind } from "@formspec/analysis/internal";

export { normalizeFormSpecTagName };

const DISCRIMINATOR_TAG_METADATA: TagDefinition = {
  canonicalName: "discriminator",
  valueKind: null,
  requiresArgument: true,
  supportedTargets: ["path"],
  allowDuplicates: false,
  category: "annotation",
  placements: ["class", "interface", "type-alias"],
  capabilities: ["object-like"],
  completionDetail: "Declares a discriminator field for a generic object type.",
  hoverMarkdown: "**@discriminator**\n\nDeclares a discriminator field for an object type.",
  signatures: [
    {
      label: "@discriminator :fieldName T",
      placements: ["class", "interface", "type-alias"],
      parameters: [
        {
          kind: "target-path",
          label: "<fieldName>",
          capability: "object-like",
        },
        {
          kind: "value",
          label: "<typeParameter>",
        },
      ],
    },
  ],
};

export function getTagMetadata(rawName: string): TagDefinition | null {
  return getTagDefinition(rawName) ?? (normalizeFormSpecTagName(rawName) === "discriminator"
    ? DISCRIMINATOR_TAG_METADATA
    : null);
}
