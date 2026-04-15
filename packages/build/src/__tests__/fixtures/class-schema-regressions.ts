export class NotificationPreferences {
  /** @defaultValue "email" */
  channel?: string;

  /** @defaultValue 3 */
  retryCount?: number;

  /** @defaultValue true */
  enabled?: boolean;

  /** @defaultValue null */
  nickname?: string | null;
}

export class ContactForm {
  /** @format email */
  emailAddress!: string;

  /** @format date */
  birthDate!: string;

  /** @format uri */
  website!: string;
}

export class SearchForm {
  /** @placeholder Search by keyword... */
  query!: string;
}

export class SettingsForm {
  /** @deprecated Use displayName instead */
  legacyName!: string;

  /** @displayName Display Name */
  displayName!: string;
}

export class TagManager {
  /** @minItems 1 @maxItems 10 @uniqueItems */
  tags!: string[];
}

export class SurveyForm {
  /** @maxLength 280 */
  responses!: string[];
}

/**
 * Summary text becomes the root schema description when no explicit tag is present.
 */
export class DescriptionPrecedenceForm {
  /** Summary text becomes the description. */
  summary!: string;

  /**
   * Summary populates description; remarks go to x-formspec-remarks.
   * @remarks Additional context for tooling.
   */
  summaryAndRemarks!: string;

  /** @remarks Remarks go to x-formspec-remarks, not description. */
  remarksOnly!: string;

  /** @primaryField */
  modifierTagOnly!: string;
}

export class PriceRange {
  /** @minimum 100 @maximum 50 */
  price!: number;
}

export class MismatchedForm {
  /** @minimum 0 */
  label!: string;
}

interface Address {
  street: string;
  city: string;
}

export class LocationForm {
  /** @minLength :zipCode 5 */
  address!: Address;
}

interface Dimensions {
  name: string;
  width: number;
}

export class BoxForm {
  /** @minimum :name 0 */
  size!: Dimensions;
}

/** @minimum 0 */
type SafeTemperature = number;

export class ThermostatForm {
  /** @minimum -10 */
  target!: SafeTemperature;
}

/** @minimum 0 */
export class InvalidPlacementForm {
  value!: number;
}
