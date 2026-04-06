import type { FormElement, FormSpec } from "./elements.js";
import type { MetadataPolicyInput } from "./metadata.js";

export const _FORMSPEC_METADATA_POLICY = Symbol.for("@formspec/core/FormSpec.metadataPolicy");

interface _FormSpecMetadataPolicyCarrier {
  readonly [_FORMSPEC_METADATA_POLICY]?: MetadataPolicyInput;
}

export function _attachFormSpecMetadataPolicy<const Elements extends readonly FormElement[]>(
  form: FormSpec<Elements>,
  metadataPolicy: MetadataPolicyInput | undefined
): FormSpec<Elements> {
  if (metadataPolicy === undefined) {
    return form;
  }

  const nextForm = { ...form };
  Object.defineProperty(nextForm, _FORMSPEC_METADATA_POLICY, {
    value: metadataPolicy,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return nextForm as FormSpec<Elements>;
}

export function _getFormSpecMetadataPolicy(
  form: FormSpec<readonly FormElement[]>
): MetadataPolicyInput | undefined {
  return (form as _FormSpecMetadataPolicyCarrier)[_FORMSPEC_METADATA_POLICY];
}
