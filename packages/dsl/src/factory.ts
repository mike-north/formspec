import type {
  Conditional,
  FormElement,
  FormSpec,
  Group,
  MetadataPolicyInput,
  Predicate,
} from "@formspec/core";
import { _attachFormSpecMetadataPolicy } from "@formspec/core/internals";
import {
  createFieldBuilders,
  type FieldBuilderElement,
  type FieldBuilderNamespace,
} from "./field.js";
import { formspec, formspecWithValidation, group, when } from "./structure.js";
import type { FormSpecOptions } from "./structure.js";
import { is } from "./predicate.js";

/**
 * A configured DSL surface with policy-aware field builders and structure helpers.
 *
 * @public
 */
export interface FormSpecFactory<Policy extends MetadataPolicyInput | undefined = undefined> {
  /** Field builders scoped to the factory metadata policy. */
  readonly field: FieldBuilderNamespace<Policy>;
  /** Creates a `FormSpec` carrying the factory metadata policy. */
  readonly formspec: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
    ...elements: Elements
  ) => FormSpec<Elements>;
  /** Creates a validating `FormSpec` carrying the factory metadata policy. */
  readonly formspecWithValidation: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
    options: FormSpecOptions,
    ...elements: Elements
  ) => FormSpec<Elements>;
  /** Policy-scoped re-export of `group()`. */
  readonly group: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
    label: string,
    ...elements: Elements
  ) => FieldBuilderElement<Policy, Group<Elements>>;
  /** Policy-scoped re-export of `when()`. */
  readonly when: <
    const K extends string,
    const V,
    const Elements extends readonly FieldBuilderElement<Policy>[],
  >(
    predicate: Predicate<K, V>,
    ...elements: Elements
  ) => FieldBuilderElement<Policy, Conditional<K, V, Elements>>;
  /** Re-export of `is()`. */
  readonly is: typeof is;
}

function applyMetadataPolicy<const Elements extends readonly FormElement[]>(
  form: FormSpec<Elements>,
  metadataPolicy: MetadataPolicyInput | undefined
): FormSpec<Elements> {
  return _attachFormSpecMetadataPolicy(form, metadataPolicy);
}

function scopeElement<Policy, Element extends FormElement>(
  element: Element
): FieldBuilderElement<Policy, Element> {
  return element as FieldBuilderElement<Policy, Element>;
}

/**
 * Creates a DSL factory whose field builders and generated forms share a metadata policy.
 *
 * @public
 */
export function createFormSpecFactory<
  const Policy extends MetadataPolicyInput | undefined = undefined,
>(options?: { readonly metadata?: Policy }): FormSpecFactory<Policy> {
  const metadataPolicy = options?.metadata;

  return {
    field: createFieldBuilders<Policy>(),
    formspec: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
      ...elements: Elements
    ) => applyMetadataPolicy(formspec(...elements), metadataPolicy),
    formspecWithValidation: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
      validationOptions: FormSpecOptions,
      ...elements: Elements
    ) =>
      applyMetadataPolicy(formspecWithValidation(validationOptions, ...elements), metadataPolicy),
    group: <const Elements extends readonly FieldBuilderElement<Policy>[]>(
      label: string,
      ...elements: Elements
    ) => scopeElement<Policy, Group<Elements>>(group(label, ...elements)),
    when: <
      const K extends string,
      const V,
      const Elements extends readonly FieldBuilderElement<Policy>[],
    >(
      predicate: Predicate<K, V>,
      ...elements: Elements
    ) => scopeElement<Policy, Conditional<K, V, Elements>>(when(predicate, ...elements)),
    is,
  };
}
