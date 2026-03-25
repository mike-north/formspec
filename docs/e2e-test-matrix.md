# E2E Test Matrix

> Generated from specs 000–006. Every section references the normative spec section.
> Existing coverage is noted per fixture to avoid duplication.

---

## Coverage Gap Summary

### Already covered by existing fixtures
- Basic primitive types: string, number, boolean (product-form, constrained-form)
- String literal union → `enum` (product-form, nullable-types)
- `T | null` → `anyOf` [BUG: spec says `oneOf`, existing output uses `anyOf`] (nullable-types)
- Array types `T[]` (constrained-form, nested-form)
- Inline nested objects (nested-objects)
- Named type → `$defs` + `$ref` (shared-types)
- `Record<string, T>` → `additionalProperties` [BUG: existing output has empty properties and additionalProperties:false] (product-form)
- `@minimum`/`@maximum` on number (constrained-form)
- `@minLength`/`@maxLength`/`@pattern` on string (constrained-form)
- `@minItems`/`@maxItems` on array (constrained-form)
- `@deprecated` bare (constrained-form)
- `@multipleOf 1` → integer promotion (inherited-constraints)
- 2-level alias chain propagation (inherited-constraints)
- Field-level narrowing of alias constraints (inherited-constraints)
- Path-target on `$ref` type — `allOf` composition (path-target-constraints)
- Path-target on array item type — transparency (path-target-constraints)
- Chain DSL: groups, conditionals, labeled enums, dynamic enums, objects, arrays (chain-dsl fixtures)

### NOT yet covered (this matrix adds these)
- `@displayName` (all variants: bare, `:singular`/`:plural`, `:member`, absence/inference)
- `@description` / `@remarks` fallback
- `@placeholder`
- `@deprecated` with message text
- `@defaultValue` (all types)
- `@exclusiveMinimum` / `@exclusiveMaximum`
- `@multipleOf` (non-integer values: 0.01, 5)
- `@uniqueItems`
- `@minimum 0`, `@minimum` with negative values, `@minimum` with float values
- `@const`
- Enum display names via `:member` syntax → `oneOf` with `const`/`title`
- 3-level alias chain propagation
- Mixed inclusive + exclusive bounds
- String constraints with `minLength: 0` and large values
- `@pattern` with complex regex
- `@format` annotation
- Required vs optional field distinction
- Class-based models with `strictPropertyInitialization: false`
- Error cases (contradictions, type-mismatch, invalid path targets)
- Parity fixtures (TSDoc and chain DSL producing identical output)
- Mixed-authoring composition (TSDoc-derived data model plus ChainDSL-only dynamic fields)
- User-authored confidence tests for data-model conformance, dynamic options, and dynamic schema

---

## Fixture Group 1: Annotation Tags

### Fixture: annotations-display-name

#### File: e2e/fixtures/tsdoc-class/annotations-display-name.ts
```typescript
/**
 * @displayName User Profile Form
 */
export class UserProfileForm {
  /** @displayName Full Legal Name */
  fullName!: string;

  /** @displayName Email Address */
  email!: string;

  // No @displayName — tests inference/absence
  age?: number;

  /**
   * @displayName :active Active Account
   * @displayName :suspended Suspended
   * @displayName :closed Permanently Closed
   */
  status!: 'active' | 'suspended' | 'closed';

  /**
   * @displayName Preferred Language
   */
  language!: 'en' | 'fr' | 'de';
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "title": "User Profile Form",
  "properties": {
    "fullName": {
      "type": "string",
      "title": "Full Legal Name"
    },
    "email": {
      "type": "string",
      "title": "Email Address"
    },
    "age": {
      "type": "number"
    },
    "status": {
      "oneOf": [
        { "const": "active", "title": "Active Account" },
        { "const": "suspended", "title": "Suspended" },
        { "const": "closed", "title": "Permanently Closed" }
      ]
    },
    "language": {
      "enum": ["en", "fr", "de"],
      "title": "Preferred Language"
    }
  },
  "required": ["fullName", "email", "status", "language"]
}
```

#### Test assertions (e2e/tests/annotations-display-name.test.ts)
- [ ] Root schema has `"title": "User Profile Form"` from class-level `@displayName` (spec 002 §3.2, 003 §2.8)
- [ ] `fullName` has `"title": "Full Legal Name"` (spec 002 §3.2)
- [ ] `email` has `"title": "Email Address"` (spec 002 §3.2)
- [ ] `age` has NO `title` property — absence means no title emitted (spec 002 §3.2 inference cascade)
- [ ] `status` uses `oneOf` with per-member `const`/`title` because `:member` display names are present (spec 003 §2.3)
- [ ] `status` has no field-level `title` — only member-level titles (spec 002 §5.2)
- [ ] `language` uses flat `enum` because no per-member display names exist (spec 003 §2.3)
- [ ] `language` has `"title": "Preferred Language"` as field-level title (spec 002 §3.2)
- [ ] `required` contains `["fullName", "email", "status", "language"]`, NOT `age` (spec 003 §2.5)

**Note:** Class-level `@displayName` maps to the root schema's `title`. If the class uses a bare `@displayName`, that bare value is the title source. If the class uses `@displayName` specifiers, the `:singular` value is the title source.

---

### Fixture: annotations-description

#### File: e2e/fixtures/tsdoc-class/annotations-description.ts
```typescript
/**
 * Form for collecting user feedback.
 * @description Collect detailed feedback from users about their experience.
 */
export class FeedbackForm {
  /**
   * @description The user's full name as it appears on their ID.
   */
  name!: string;

  /**
   * @remarks This field accepts markdown-formatted text.
   */
  comments!: string;

  /**
   * @description Explicit description wins.
   * @remarks This remarks should be ignored when description is present.
   */
  subject!: string;

  rating!: number;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "description": "Collect detailed feedback from users about their experience.",
  "properties": {
    "name": {
      "type": "string",
      "description": "The user's full name as it appears on their ID."
    },
    "comments": {
      "type": "string",
      "description": "This field accepts markdown-formatted text."
    },
    "subject": {
      "type": "string",
      "description": "Explicit description wins."
    },
    "rating": {
      "type": "number"
    }
  },
  "required": ["name", "comments", "subject", "rating"]
}
```

#### Test assertions (e2e/tests/annotations-description.test.ts)
- [ ] Root schema has `"description"` from class-level `@description` (spec 002 §3.2)
- [ ] `name` has `"description"` from field-level `@description` (spec 002 §3.2)
- [ ] `comments` has `"description"` derived from `@remarks` fallback (spec 002 §2.3 — `@remarks` treated as `@description` when no explicit `@description`)
- [ ] `subject` has `"description"` from `@description`, NOT from `@remarks` (spec 002 §2.3 — `@description` wins per C1 override)
- [ ] `rating` has NO `description` — absence (spec 002 §2.2)

---

### Fixture: annotations-metadata

#### File: e2e/fixtures/tsdoc-class/annotations-metadata.ts
```typescript
export class MetadataForm {
  /**
   * @placeholder Enter your email address
   */
  email!: string;

  /**
   * @placeholder 0
   */
  quantity!: number;

  /**
   * @deprecated Use newField instead
   */
  oldField?: string;

  /**
   * @deprecated
   */
  anotherOldField?: string;

  /**
   * @defaultValue "pending"
   */
  status?: string;

  /**
   * @defaultValue 0
   */
  count?: number;

  /**
   * @defaultValue false
   */
  enabled?: boolean;

  /**
   * @defaultValue null
   */
  nickname?: string | null;

  requiredField!: string;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "email": {
      "type": "string"
    },
    "quantity": {
      "type": "number"
    },
    "oldField": {
      "type": "string",
      "deprecated": true,
      "x-formspec-deprecation-description": "Use newField instead"
    },
    "anotherOldField": {
      "type": "string",
      "deprecated": true
    },
    "status": {
      "type": "string",
      "default": "pending"
    },
    "count": {
      "type": "number",
      "default": 0
    },
    "enabled": {
      "type": "boolean",
      "default": false
    },
    "nickname": {
      "oneOf": [
        { "type": "string" },
        { "type": "null" }
      ],
      "default": null
    },
    "requiredField": {
      "type": "string"
    }
  },
  "required": ["email", "quantity", "requiredField"]
}
```

#### Expected UI Schema
```json
{
  "type": "VerticalLayout",
  "elements": [
    {
      "type": "Control",
      "scope": "#/properties/email",
      "options": { "placeholder": "Enter your email address" }
    },
    {
      "type": "Control",
      "scope": "#/properties/quantity",
      "options": { "placeholder": "0" }
    },
    { "type": "Control", "scope": "#/properties/oldField" },
    { "type": "Control", "scope": "#/properties/anotherOldField" },
    { "type": "Control", "scope": "#/properties/status" },
    { "type": "Control", "scope": "#/properties/count" },
    { "type": "Control", "scope": "#/properties/enabled" },
    { "type": "Control", "scope": "#/properties/nickname" },
    { "type": "Control", "scope": "#/properties/requiredField" }
  ]
}
```

#### Test assertions (e2e/tests/annotations-metadata.test.ts)
- [ ] `@placeholder` does NOT appear in JSON Schema — it's UI-only (spec 002 §2.2, 003 — no `placeholder` mapping)
- [ ] `@placeholder` appears in UI Schema `options.placeholder` (spec 002 §2.2)
- [ ] `@deprecated` with message emits `"deprecated": true` and `"x-<vendor>-deprecation-description"` in JSON Schema (spec 003 §2.8, 003 §3)
- [ ] `@deprecated` bare emits `"deprecated": true` (spec 003 §2.8)
- [ ] `@defaultValue "pending"` → `"default": "pending"` (spec 002 §3.2, 003 §2.8)
- [ ] `@defaultValue 0` → `"default": 0` (spec 002 §3.2)
- [ ] `@defaultValue false` → `"default": false` (spec 002 §3.2)
- [ ] `@defaultValue null` → `"default": null` (spec 002 §3.2)
- [ ] `nickname` uses `oneOf` for `T | null` (spec 003 §2.3) [BUG: current impl uses `anyOf` — see nullable-types fixture]
- [ ] `requiredField` is in `required` array, all `@defaultValue` fields are NOT (all are optional)

**Note:** Deprecation message text is preserved in JSON Schema using `x-<vendor>-deprecation-description`. The expected schema above uses the default vendor prefix.

---

### Fixture: class-fields-without-definite-assignment

This fixture verifies that class-based schema extraction works when the fixture is compiled with `strictPropertyInitialization: false` and fields are declared without `!` because another system is responsible for hydrating instances.

#### Files

- `e2e/fixtures/tsdoc-class/class-fields-without-definite-assignment.ts`
- fixture-local `tsconfig.json` with `"strictPropertyInitialization": false`

#### File: e2e/fixtures/tsdoc-class/class-fields-without-definite-assignment.ts
```typescript
/**
 * @displayName Customer Profile
 */
export class CustomerProfile {
  /** @displayName Customer ID */
  customerId: string;

  /** @displayName Email Address */
  email: string;

  /** @displayName Loyalty Tier */
  tier?: 'bronze' | 'silver' | 'gold';
}
```

#### Expected structure
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "title": "Customer Profile",
  "properties": {
    "customerId": {
      "type": "string",
      "title": "Customer ID"
    },
    "email": {
      "type": "string",
      "title": "Email Address"
    },
    "tier": {
      "enum": ["bronze", "silver", "gold"],
      "title": "Loyalty Tier"
    }
  },
  "required": ["customerId", "email"]
}
```

#### Test assertions (e2e/tests/class-fields-without-definite-assignment.test.ts)
- [ ] Fixture compiles and schema generation succeeds with `strictPropertyInitialization: false`
- [ ] Class fields declared without `!` are still recognized as fields in the generated schema
- [ ] Requiredness is determined by `?` optionality, not by definite-assignment syntax
- [ ] `customerId` and `email` are in `required`
- [ ] `tier` is omitted from `required`
- [ ] Display names still map to JSON Schema `title` normally

**Note:** This fixture exists for the authoring style where the class acts as a field model and some other runtime hydrates instances. The lack of `!` must not be treated as a signal that the field is optional.

---

## Fixture Group 2: Numeric Constraint Permutations

### Fixture: numeric-constraints-comprehensive

#### File: e2e/fixtures/tsdoc-class/numeric-constraints-comprehensive.ts
```typescript
export class NumericConstraintsForm {
  /** @minimum 0 */
  nonNegative!: number;

  /** @minimum -100 */
  allowsNegative!: number;

  /** @minimum 0 @maximum 0 */
  exactlyZero!: number;

  /** @minimum 0.5 @maximum 99.5 */
  floatBounds!: number;

  /** @exclusiveMinimum 0 */
  strictlyPositive!: number;

  /** @exclusiveMaximum 100 */
  strictlyBelow100!: number;

  /** @exclusiveMinimum 0 @exclusiveMaximum 1 */
  openInterval!: number;

  /** @minimum 0 @exclusiveMaximum 100 */
  mixedBounds!: number;

  /** @exclusiveMinimum -1 @maximum 1 */
  mixedBoundsReverse!: number;

  /** @multipleOf 0.01 */
  currency!: number;

  /** @multipleOf 5 */
  steppedBy5!: number;

  /** @minimum 0 @maximum 100 @multipleOf 5 */
  percentStepped!: number;

  unconstrained!: number;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nonNegative": {
      "type": "number",
      "minimum": 0
    },
    "allowsNegative": {
      "type": "number",
      "minimum": -100
    },
    "exactlyZero": {
      "type": "number",
      "minimum": 0,
      "maximum": 0
    },
    "floatBounds": {
      "type": "number",
      "minimum": 0.5,
      "maximum": 99.5
    },
    "strictlyPositive": {
      "type": "number",
      "exclusiveMinimum": 0
    },
    "strictlyBelow100": {
      "type": "number",
      "exclusiveMaximum": 100
    },
    "openInterval": {
      "type": "number",
      "exclusiveMinimum": 0,
      "exclusiveMaximum": 1
    },
    "mixedBounds": {
      "type": "number",
      "minimum": 0,
      "exclusiveMaximum": 100
    },
    "mixedBoundsReverse": {
      "type": "number",
      "exclusiveMinimum": -1,
      "maximum": 1
    },
    "currency": {
      "type": "number",
      "multipleOf": 0.01
    },
    "steppedBy5": {
      "type": "number",
      "multipleOf": 5
    },
    "percentStepped": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "multipleOf": 5
    },
    "unconstrained": {
      "type": "number"
    }
  },
  "required": [
    "nonNegative", "allowsNegative", "exactlyZero", "floatBounds",
    "strictlyPositive", "strictlyBelow100", "openInterval",
    "mixedBounds", "mixedBoundsReverse", "currency", "steppedBy5",
    "percentStepped", "unconstrained"
  ]
}
```

#### Test assertions (e2e/tests/numeric-constraints-comprehensive.test.ts)
- [ ] `@minimum 0` → `"minimum": 0` (spec 003 §2.6)
- [ ] `@minimum -100` → `"minimum": -100` — negative values allowed (spec 002 §3.2)
- [ ] `@minimum 0 @maximum 0` → both keywords emitted, valid (spec 003 §2.6)
- [ ] `@minimum 0.5 @maximum 99.5` → float bounds preserved (spec 002 §3.2)
- [ ] `@exclusiveMinimum 0` → `"exclusiveMinimum": 0` (spec 003 §2.6)
- [ ] `@exclusiveMaximum 100` → `"exclusiveMaximum": 100` (spec 003 §2.6)
- [ ] `@exclusiveMinimum` + `@exclusiveMaximum` combined (spec 003 §2.6)
- [ ] Mixed inclusive min + exclusive max (spec 003 §2.6)
- [ ] Mixed exclusive min + inclusive max (spec 003 §2.6)
- [ ] `@multipleOf 0.01` → `"multipleOf": 0.01` — NOT integer promotion (spec 003 §2.1, 005 §2.2)
- [ ] `@multipleOf 5` → `"multipleOf": 5` — NOT integer promotion (only `multipleOf: 1` promotes) (spec 005 §2.2)
- [ ] All three combined: min + max + multipleOf (spec 003 §2.6)
- [ ] Unconstrained number has only `"type": "number"` (spec 003 §2.1)

---

## Fixture Group 3: String Constraint Permutations

### Fixture: string-constraints-comprehensive

#### File: e2e/fixtures/tsdoc-class/string-constraints-comprehensive.ts
```typescript
export class StringConstraintsForm {
  /** @minLength 1 */
  nonEmpty!: string;

  /** @maxLength 255 */
  bounded!: string;

  /** @minLength 0 */
  allowsEmpty!: string;

  /** @minLength 2 @maxLength 2 */
  exactLength!: string;

  /** @minLength 1 @maxLength 1000 */
  combinedBounds!: string;

  /** @pattern ^[a-z]+$ */
  lowercaseOnly!: string;

  /** @pattern ^[^@]+@[^@]+\.[^@]+$ */
  emailPattern!: string;

  /** @pattern ^\\d{3}-\\d{2}-\\d{4}$ */
  ssnPattern!: string;

  /** @minLength 5 @maxLength 100 @pattern ^[^@]+@[^@]+$ */
  constrainedEmail!: string;

  /** @format email */
  emailFormat!: string;

  /** @format date */
  dateFormat!: string;

  /** @format uri */
  uriFormat!: string;

  unconstrained!: string;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nonEmpty": {
      "type": "string",
      "minLength": 1
    },
    "bounded": {
      "type": "string",
      "maxLength": 255
    },
    "allowsEmpty": {
      "type": "string",
      "minLength": 0
    },
    "exactLength": {
      "type": "string",
      "minLength": 2,
      "maxLength": 2
    },
    "combinedBounds": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    },
    "lowercaseOnly": {
      "type": "string",
      "pattern": "^[a-z]+$"
    },
    "emailPattern": {
      "type": "string",
      "pattern": "^[^@]+@[^@]+\\.[^@]+$"
    },
    "ssnPattern": {
      "type": "string",
      "pattern": "^\\d{3}-\\d{2}-\\d{4}$"
    },
    "constrainedEmail": {
      "type": "string",
      "minLength": 5,
      "maxLength": 100,
      "pattern": "^[^@]+@[^@]+$"
    },
    "emailFormat": {
      "type": "string",
      "format": "email"
    },
    "dateFormat": {
      "type": "string",
      "format": "date"
    },
    "uriFormat": {
      "type": "string",
      "format": "uri"
    },
    "unconstrained": {
      "type": "string"
    }
  },
  "required": [
    "nonEmpty", "bounded", "allowsEmpty", "exactLength", "combinedBounds",
    "lowercaseOnly", "emailPattern", "ssnPattern", "constrainedEmail",
    "emailFormat", "dateFormat", "uriFormat", "unconstrained"
  ]
}
```

#### Test assertions
- [ ] `@minLength 1` → `"minLength": 1` (spec 003 §2.7)
- [ ] `@maxLength 255` → `"maxLength": 255` (spec 003 §2.7)
- [ ] `@minLength 0` is valid — emits `"minLength": 0` (spec 002 §3.2 — non-negative integer)
- [ ] Exact-length: `minLength == maxLength` is valid (spec 003 §2.7)
- [ ] `@pattern` with simple regex (spec 003 §2.7)
- [ ] `@pattern` with escaped chars in regex (spec 002 §3.2)
- [ ] Combined minLength + maxLength + pattern on same field (spec 003 §2.7, C1 intersection)
- [ ] `@format` → `"format"` keyword (spec 003 §2.7)
- [ ] Unconstrained string has only `"type": "string"` (spec 003 §2.1)

---

## Fixture Group 4: Array Constraint Permutations

### Fixture: array-constraints-comprehensive

#### File: e2e/fixtures/tsdoc-class/array-constraints-comprehensive.ts
```typescript
export class ArrayConstraintsForm {
  /** @minItems 1 */
  nonEmpty!: string[];

  /** @maxItems 100 */
  bounded!: string[];

  /** @minItems 0 */
  allowsEmpty!: string[];

  /** @minItems 1 @maxItems 10 */
  combinedBounds!: string[];

  /** @uniqueItems */
  uniqueTags!: string[];

  /** @minItems 1 @maxItems 5 @uniqueItems */
  allConstraints!: string[];

  /** @maxLength 50 */
  itemConstrained!: string[];

  unconstrained!: number[];
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nonEmpty": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "bounded": {
      "type": "array",
      "items": { "type": "string" },
      "maxItems": 100
    },
    "allowsEmpty": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 0
    },
    "combinedBounds": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 10
    },
    "uniqueTags": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "allConstraints": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 5,
      "uniqueItems": true
    },
    "itemConstrained": {
      "type": "array",
      "items": { "type": "string", "maxLength": 50 }
    },
    "unconstrained": {
      "type": "array",
      "items": { "type": "number" }
    }
  },
  "required": [
    "nonEmpty", "bounded", "allowsEmpty", "combinedBounds",
    "uniqueTags", "allConstraints", "itemConstrained", "unconstrained"
  ]
}
```

#### Test assertions
- [ ] `@minItems 1` → `"minItems": 1` (spec 003 §2.4)
- [ ] `@maxItems 100` → `"maxItems": 100` (spec 003 §2.4)
- [ ] `@minItems 0` is valid (spec 002 §3.2)
- [ ] Combined minItems + maxItems (spec 003 §2.4)
- [ ] `@uniqueItems` → `"uniqueItems": true` (spec 003 §2.4)
- [ ] All three array constraints combined (spec 003 §2.4)
- [ ] `@maxLength 50` on `string[]` → applies to items, NOT to the array (spec 002 §4.3 — item-level constraints on primitive arrays)
- [ ] Unconstrained array: `items` schema only, no constraint keywords

---

## Fixture Group 5: Type Mappings

### Fixture: type-mappings-comprehensive

#### File: e2e/fixtures/tsdoc-class/type-mappings-comprehensive.ts
```typescript
interface Address {
  street: string;
  city: string;
  country: string;
}

export class TypeMappingsForm {
  stringField!: string;
  numberField!: number;
  booleanField!: boolean;

  nullableString!: string | null;
  nullableNumber!: number | null;

  optionalString?: string;
  optionalNumber?: number;

  stringLiteralUnion!: 'a' | 'b' | 'c';
  numberArray!: number[];
  stringArray!: string[];

  inlineObject!: { x: number; y: number };

  namedType!: Address;
  namedTypeOptional?: Address;

  recordType!: Record<string, number>;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "stringField": { "type": "string" },
    "numberField": { "type": "number" },
    "booleanField": { "type": "boolean" },
    "nullableString": {
      "oneOf": [
        { "type": "string" },
        { "type": "null" }
      ]
    },
    "nullableNumber": {
      "oneOf": [
        { "type": "number" },
        { "type": "null" }
      ]
    },
    "optionalString": { "type": "string" },
    "optionalNumber": { "type": "number" },
    "stringLiteralUnion": { "enum": ["a", "b", "c"] },
    "numberArray": {
      "type": "array",
      "items": { "type": "number" }
    },
    "stringArray": {
      "type": "array",
      "items": { "type": "string" }
    },
    "inlineObject": {
      "type": "object",
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "number" }
      },
      "required": ["x", "y"]
    },
    "namedType": {
      "$ref": "#/$defs/Address"
    },
    "namedTypeOptional": {
      "$ref": "#/$defs/Address"
    },
    "recordType": {
      "type": "object",
      "additionalProperties": { "type": "number" }
    }
  },
  "required": [
    "stringField", "numberField", "booleanField",
    "nullableString", "nullableNumber",
    "stringLiteralUnion", "numberArray", "stringArray",
    "inlineObject", "namedType", "recordType"
  ],
  "$defs": {
    "Address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" },
        "country": { "type": "string" }
      },
      "required": ["street", "city", "country"]
    }
  }
}
```

#### Test assertions
- [ ] `string` → `{ "type": "string" }` (spec 003 §2.1)
- [ ] `number` → `{ "type": "number" }` (spec 003 §2.1)
- [ ] `boolean` → `{ "type": "boolean" }` (spec 003 §2.1)
- [ ] `T | null` → `{ "oneOf": [<T>, { "type": "null" }] }` — NOT `anyOf` (spec 003 §2.3) [BUG: existing nullable-types fixture uses `anyOf`]
- [ ] `T | undefined` (optional) → no union schema, field excluded from `required` (spec 003 §2.1, S8)
- [ ] String literal union → `{ "enum": [...] }` (spec 003 §2.3)
- [ ] `T[]` → `{ "type": "array", "items": <T> }` (spec 003 §2.4)
- [ ] Inline object → `{ "type": "object", "properties": {...} }` — NOT lifted to `$defs` (spec 003 §5.2)
- [ ] Named type → `$defs` entry + `$ref` (spec 003 §5.1, PP7)
- [ ] Optional named type → same `$ref`, absent from `required` (spec S8)
- [ ] `Record<string, T>` → `{ "type": "object", "additionalProperties": <T> }` (spec 003 §2.5) [BUG: current impl creates `$ref` to an empty Record def]
- [ ] `optionalString` and `optionalNumber` NOT in `required` array (spec 003 §2.5, S8)
- [ ] `namedTypeOptional` NOT in `required` array (spec S8)

---

## Fixture Group 6: Constraint Propagation (Alias Chains)

### Fixture: alias-chain-3-level

#### File: e2e/fixtures/tsdoc-class/alias-chain-3-level.ts
```typescript
/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 */
type NonNegativeInteger = Integer;

/** @maximum 65535 */
type PortNumber = NonNegativeInteger;

export class NetworkForm {
  /** @minimum 1024 */
  appPort!: PortNumber;

  serverPort!: PortNumber;

  rawCount!: Integer;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "appPort": {
      "type": "integer",
      "minimum": 1024,
      "maximum": 65535
    },
    "serverPort": {
      "type": "integer",
      "minimum": 0,
      "maximum": 65535
    },
    "rawCount": {
      "type": "integer"
    }
  },
  "required": ["appPort", "serverPort", "rawCount"]
}
```

#### Test assertions (e2e/tests/alias-chain-3-level.test.ts)
- [ ] 3-level chain: Integer → NonNegativeInteger → PortNumber propagates all constraints (spec 005 §3, PP3)
- [ ] `@multipleOf 1` from `Integer` promotes to `"type": "integer"` throughout (spec 005 §2.2, 003 §2.1)
- [ ] `multipleOf` keyword is suppressed when value is 1 (spec 003 §2.1, 005 §2.2)
- [ ] `appPort`: field-level `@minimum 1024` narrows `NonNegativeInteger`'s `@minimum 0` (spec S1, 005 §7.1)
- [ ] `appPort`: inherits `@maximum 65535` from `PortNumber` (spec 005 §7.3)
- [ ] `serverPort`: inherits full chain `@minimum 0 @maximum 65535` (spec 005 §7.3)
- [ ] `rawCount`: only `"type": "integer"` — no min/max from `Integer` (it has none) (spec 005 §3.1)

**Normative expectation:** Named types use `$defs` + `$ref`. The canonical expected shape for this fixture is:

```json
{
  "$defs": {
    "Integer": { "type": "integer" },
    "NonNegativeInteger": {
      "allOf": [{ "$ref": "#/$defs/Integer" }, { "minimum": 0 }]
    },
    "PortNumber": {
      "allOf": [{ "$ref": "#/$defs/NonNegativeInteger" }, { "maximum": 65535 }]
    }
  }
}
```

[BUG: Current implementation inlines alias chain constraints rather than using `$defs` + `$ref` for named type aliases. The spec (003 §5.2, 005 §3.3) requires named types to appear in `$defs`.]

---

### Fixture: alias-chain-multipleOf-composition

#### File: e2e/fixtures/tsdoc-class/alias-chain-multipleOf.ts
```typescript
/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 @maximum 100 */
type Percent = Integer;

export class PromotionForm {
  /**
   * @displayName Discount
   * @multipleOf 5
   */
  discountPercent!: Percent;

  /**
   * @multipleOf 0.01
   * @minimum 0
   * @maximum 999999.99
   */
  price!: number;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "discountPercent": {
      "type": "integer",
      "minimum": 0,
      "maximum": 100,
      "multipleOf": 5,
      "title": "Discount"
    },
    "price": {
      "type": "number",
      "multipleOf": 0.01,
      "minimum": 0,
      "maximum": 999999.99
    }
  },
  "required": ["discountPercent", "price"]
}
```

#### Test assertions
- [ ] `discountPercent`: integer promotion from `@multipleOf 1` inherited via `Percent` → `Integer` (spec 005 §2.2)
- [ ] `discountPercent`: field-level `@multipleOf 5` is emitted in addition to integer promotion (spec 006 §2.3 — `multipleOf: 1` from Integer and `multipleOf: 5` compose; every multiple of 5 is also a multiple of 1, so the effective constraint is `multipleOf: 5`)
- [ ] `discountPercent`: inherits `@minimum 0 @maximum 100` from `Percent` (spec 005 §7.3)
- [ ] `price`: `@multipleOf 0.01` does NOT promote to integer (spec 005 §2.2)
- [ ] `price`: type remains `"number"` (spec 003 §2.1)

---

## Fixture Group 7: Path-Target Syntax (expanded)

### Fixture: path-target-expanded

#### File: e2e/fixtures/tsdoc-class/path-target-expanded.ts
```typescript
interface Dimensions {
  width: number;
  height: number;
  unit: string;
}

interface MonetaryAmount {
  value: number;
  currency: string;
}

interface Shipment {
  lineItems: string[];
}

export class PathTargetExpandedForm {
  /**
   * @minimum :width 0
   * @minimum :height 0
   * @maximum :width 10000
   * @maximum :height 10000
   * @pattern :unit ^(cm|in|px)$
   */
  size!: Dimensions;

  /**
   * @minimum :value 0.01
   * @maximum :value 9999999.99
   * @multipleOf :value 0.01
   * @minLength :currency 3
   * @maxLength :currency 3
   * @pattern :currency ^[A-Z]{3}$
   */
  total!: MonetaryAmount;

  /**
   * @minimum :value 0
   * @minLength :currency 3
   * @maxLength :currency 3
   */
  lineItems!: MonetaryAmount[];

  /**
   * @minItems 1
   * @maxItems 100
   * @minItems :lineItems 1
   * @maxItems :lineItems 25
   * @uniqueItems :lineItems
   */
  shipments!: Shipment[];

  /** @minimum :value 0 */
  optionalAmount?: MonetaryAmount;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "size": {
      "allOf": [
        { "$ref": "#/$defs/Dimensions" },
        {
          "properties": {
            "width": { "minimum": 0, "maximum": 10000 },
            "height": { "minimum": 0, "maximum": 10000 },
            "unit": { "pattern": "^(cm|in|px)$" }
          }
        }
      ]
    },
    "total": {
      "allOf": [
        { "$ref": "#/$defs/MonetaryAmount" },
        {
          "properties": {
            "value": {
              "minimum": 0.01,
              "maximum": 9999999.99,
              "multipleOf": 0.01
            },
            "currency": {
              "minLength": 3,
              "maxLength": 3,
              "pattern": "^[A-Z]{3}$"
            }
          }
        }
      ]
    },
    "lineItems": {
      "type": "array",
      "items": {
        "allOf": [
          { "$ref": "#/$defs/MonetaryAmount" },
          {
            "properties": {
              "value": { "minimum": 0 },
              "currency": { "minLength": 3, "maxLength": 3 }
            }
          }
        ]
      }
    },
    "shipments": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "allOf": [
          { "$ref": "#/$defs/Shipment" },
          {
            "properties": {
              "lineItems": {
                "minItems": 1,
                "maxItems": 25,
                "uniqueItems": true
              }
            }
          }
        ]
      }
    },
    "optionalAmount": {
      "allOf": [
        { "$ref": "#/$defs/MonetaryAmount" },
        {
          "properties": {
            "value": { "minimum": 0 }
          }
        }
      ]
    }
  },
  "required": ["size", "total", "lineItems"],
  "$defs": {
    "Dimensions": {
      "type": "object",
      "properties": {
        "width": { "type": "number" },
        "height": { "type": "number" },
        "unit": { "type": "string" }
      },
      "required": ["width", "height", "unit"]
    },
    "MonetaryAmount": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "currency": { "type": "string" }
      },
      "required": ["value", "currency"]
    },
    "Shipment": {
      "type": "object",
      "properties": {
        "lineItems": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["lineItems"]
    }
  }
}
```

#### Test assertions
- [ ] Multiple path targets on same field (`size` has constraints on `:width`, `:height`, `:unit`) (spec 002 §4.4)
- [ ] Multiple constraint types on same subfield (`:width` has both `@minimum` and `@maximum`) (spec 002 §4.4, C1)
- [ ] Mixed constraint types across subfields: numeric on `:value`, string on `:currency` (spec 002 §4.3, S4)
- [ ] Array transparency: `lineItems` has path-targeted constraints applied to `items` (spec 002 §4.3)
- [ ] Untargeted `@minItems` / `@maxItems` on `shipments` constrain the outer array itself (spec 002 §4.3)
- [ ] Path-targeted `@minItems :lineItems` / `@maxItems :lineItems` / `@uniqueItems :lineItems` constrain the nested array field on each shipment item (spec 002 §4.3)
- [ ] Optional field with path target: `optionalAmount` emits `allOf` and is NOT in `required` (spec S8)
- [ ] All named types appear in `$defs` (spec 003 §5.2, PP7)
- [ ] `allOf` contains `$ref` + constraint object (spec 003 §5.4)

---

## Fixture Group 8: Enum/Union Display Names

### Fixture: enum-display-names

#### File: e2e/fixtures/tsdoc-class/enum-display-names.ts
```typescript
/**
 * @displayName :draft Draft Invoice
 * @displayName :sent Sent to Customer
 * @displayName :paid Paid in Full
 */
type InvoiceStatus = 'draft' | 'sent' | 'paid';

export class InvoiceForm {
  /**
   * @displayName Invoice Status
   * @defaultValue "draft"
   */
  status!: InvoiceStatus;

  /**
   * @displayName Priority Level
   * @displayName :low Low Priority
   * @displayName :medium Medium
   * @displayName :high High Priority
   * @displayName :critical Critical - Immediate Action
   */
  priority!: 'low' | 'medium' | 'high' | 'critical';

  /** No per-member display names */
  simpleEnum!: 'a' | 'b' | 'c';
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "$ref": "#/$defs/InvoiceStatus",
      "title": "Invoice Status",
      "default": "draft"
    },
    "priority": {
      "oneOf": [
        { "const": "low", "title": "Low Priority" },
        { "const": "medium", "title": "Medium" },
        { "const": "high", "title": "High Priority" },
        { "const": "critical", "title": "Critical - Immediate Action" }
      ],
      "title": "Priority Level"
    },
    "simpleEnum": {
      "enum": ["a", "b", "c"]
    }
  },
  "required": ["status", "priority", "simpleEnum"],
  "$defs": {
    "InvoiceStatus": {
      "oneOf": [
        { "const": "draft", "title": "Draft Invoice" },
        { "const": "sent", "title": "Sent to Customer" },
        { "const": "paid", "title": "Paid in Full" }
      ]
    }
  }
}
```

#### Test assertions
- [ ] Named type alias with `:member` display names → `$defs` entry with `oneOf`/`const`/`title` (spec 003 §2.3, 003 §5.2)
- [ ] `status` references `InvoiceStatus` via `$ref` (spec 003 §5.1, PP7)
- [ ] `status` has `"title"` and `"default"` as sibling keywords to `$ref` (spec 003 §7 — 2020-12 allows siblings)
- [ ] `priority` has inline `oneOf` with per-member `const`/`title` because it's not a named type (spec 003 §2.3)
- [ ] `priority` field-level `@displayName` maps to `"title"` (spec 003 §2.8)
- [ ] `simpleEnum` uses flat `enum` — no per-member metadata (spec 003 §2.3)
- [ ] `@defaultValue "draft"` → `"default": "draft"` (spec 003 §2.8)

**Note:** Quoted `@defaultValue` values are always explicit strings. Unquoted values are parsed against the resolved target type, preferring valid non-string interpretations before falling back to string. This fixture uses `"draft"` to force a string explicitly.

---

## Fixture Group 9: Parity Fixtures (TSDoc + Chain DSL → identical output)

### Fixture: parity-contact-form

Both surfaces must produce identical JSON Schema. The chain-dsl fixture already exists; this documents what SHOULD match.

**Existing chain DSL fixture:** `e2e/fixtures/chain-dsl/contact-form.ts` (already covered)

#### File: e2e/fixtures/tsdoc-class/parity-contact-form.ts
```typescript
export class ParityContactForm {
  /** @displayName First Name */
  firstName!: string;

  /** @displayName Last Name */
  lastName!: string;

  /** @displayName Email */
  email?: string;

  /** @displayName Preferred Contact Method */
  contactMethod!: 'email' | 'phone' | 'mail';

  /** @displayName Phone Number */
  phoneNumber?: string;

  /** @displayName Age @minimum 0 @maximum 150 */
  age?: number;

  /** @displayName Subscribe to Newsletter */
  newsletter?: boolean;
}
```

#### Test assertions (e2e/tests/parity-contact-form.test.ts)
- [ ] TSDoc-generated JSON Schema matches chain-DSL-generated JSON Schema (spec PP5, A3)
- [ ] Both have identical `properties` keys and types
- [ ] Both have identical `required` arrays
- [ ] Both have identical constraint keywords on all fields
- [ ] Both have identical `title` annotations

**Note:** This fixture should first rewrite the TSDoc surface to get as close as possible to the chain DSL fixture, including `@showWhen` where supported. Any remaining chain-only feature gap should be escalated for an explicit product decision rather than treated as parity by default.

---

### Fixture: parity-constrained-fields

#### File: e2e/fixtures/chain-dsl/parity-constrained-fields.ts
```typescript
import { formspec, field } from "@formspec/dsl";

export const ParityConstrainedForm = formspec(
  field.text("name", { label: "Full Name", required: true }),
  field.number("age", { label: "Age", required: true, min: 0, max: 150 }),
  field.text("email", {
    label: "Email",
    required: true,
    minLength: 5,
    maxLength: 100,
    pattern: "^[^@]+@[^@]+$"
  }),
  field.array("tags", field.text("tag"), {
    label: "Tags",
    required: true,
    minItems: 1,
    maxItems: 10
  }),
  field.text("legacyField", { label: "Legacy", deprecated: true })
);
```

**Counterpart TSDoc fixture:** `e2e/fixtures/tsdoc-class/constrained-form.ts` (already exists)

#### Test assertions
- [ ] Chain DSL output matches the TSDoc counterpart structurally using hand-authored normative expectations (spec PP5, A3)
- [ ] Both surfaces produce identical constraint keywords (spec A1)

---

## Fixture Group 9A: Mixed-Authoring Composition

### Fixture: mixed-authoring-dynamic-options

This fixture verifies the supported near-term composition pattern:

- a class or interface provides the static data model
- one or more fields with runtime option retrieval are authored in ChainDSL
- the final generated JSON Schema and UI Schema reflect the composed form

#### Files

- `e2e/fixtures/tsdoc-class/mixed-authoring-shipping-address.ts`
- `e2e/fixtures/chain-dsl/mixed-authoring-shipping-address.ts`

#### Scenario

Most fields come from a TSDoc-authored address model:

- `country: string`
- `city: string`
- `postalCode?: string`

The `city` field is then overlaid with ChainDSL dynamic option behavior:

- dynamic option provider key: `cities`
- parameter fields: `country`

#### Test assertions (e2e/tests/mixed-authoring-dynamic-options.test.ts)

- [ ] The composed JSON Schema retains the static field type for `city` (`"type": "string"`)
- [ ] The composed JSON Schema emits the dynamic option annotation keys on `city`
- [ ] The composed JSON Schema emits the dynamic option parameter list in declared order
- [ ] The composed UI Schema preserves field order, labels, and other static metadata from the TSDoc-derived model
- [ ] The test does not assert parity between two pure surfaces; it asserts correctness of the composed result
- [ ] No decorators are used to attach ChainDSL behavior to class fields

**Note:** This fixture is intentionally not a parity fixture. It verifies the supported composition boundary where the data model remains type-driven while runtime field behavior is authored in ChainDSL.

---

## Fixture Group 9B: User-Authored Confidence Tests

These fixtures exist to verify that FormSpec users can write their own tests effectively. They are not parity tests. They model the three distinct testing concerns we expect real adopters to have:

- data-model conformance tests
- dynamic option behavior tests
- dynamic schema resolver tests

### Fixture: user-test-data-model-conformance

This fixture demonstrates the expected testing style for the static data model: users validate that example payloads do and do not conform to the generated JSON Schema.

#### Files

- `e2e/fixtures/tsdoc-class/user-test-data-model-conformance.ts`
- `e2e/tests/user-test-data-model-conformance.test.ts`

#### Scenario

A class-derived checkout model generates a static JSON Schema. The test then validates:

- known-good payloads that should be accepted
- known-bad payloads that should be rejected

#### Test assertions

- [ ] A valid fixture payload passes validation against the generated JSON Schema
- [ ] A payload with a missing required field fails validation
- [ ] A payload with a wrong primitive type fails validation
- [ ] A payload violating a declared constraint fails validation
- [ ] This test is framed as a user confidence test for the data model, not as a generator snapshot

**Note:** This is the baseline testing style for class/interface/type-derived models. It verifies the contract boundary: whether candidate data conforms to the generated schema.

---

### Fixture: user-test-dynamic-options

This fixture demonstrates the expected testing style for dynamic option retrieval against a statically known field type.

#### Files

- `e2e/fixtures/tsdoc-class/user-test-dynamic-options-model.ts`
- `e2e/fixtures/chain-dsl/user-test-dynamic-options-form.ts`
- `e2e/tests/user-test-dynamic-options.test.ts`

#### Scenario

The static model defines fields such as:

- `country: string`
- `city: string`

The form overlays `city` with dynamic option retrieval using a ChainDSL resolver such as `cities(country)`.

The test exercises resolver-driven option loading rather than just schema emission.

#### Test assertions

- [ ] The dynamic option resolver returns options for the expected field
- [ ] Every returned option value is a valid instance of the field's stored type
- [ ] The option labels are present and correctly paired with their stored values
- [ ] Changing parameter fields (for example `country`) changes the retrieved option set appropriately
- [ ] Invalid option payloads from the resolver are surfaced as test failures
- [ ] The generated JSON Schema still records the correct static field type while the form/runtime path handles option retrieval

**Note:** This is a form-behavior test, not a data-model conformance test. The user is testing confidence in the option retrieval path and the shape of the resulting options.

---

### Fixture: user-test-dynamic-schema

This fixture demonstrates the expected testing style for runtime-discovered schema and UI schema.

#### Files

- `e2e/fixtures/chain-dsl/user-test-dynamic-schema.ts`
- `e2e/tests/user-test-dynamic-schema.test.ts`

#### Scenario

A ChainDSL-authored resolver fetches some source data and converts it into:

- a JSON Schema fragment
- a JSON Forms UI schema fragment

The test exercises the resolver logic itself, not just the final emitted annotation key.

#### Test assertions

- [ ] The dynamic schema resolver returns JSON Schema that is structurally valid for the expected object/value
- [ ] The dynamic schema resolver returns JSON Forms UI schema that matches the generated schema fragment
- [ ] Resolver output reflects the source data it was derived from
- [ ] Invalid resolver output is surfaced clearly as a test failure
- [ ] The test distinguishes runtime schema discovery from ordinary static schema validation

**Note:** This is neither a parity test nor a plain data-model test. It is a resolver-confidence test for the runtime path that turns source data into schema and UI schema.

---

## Fixture Group 10: Error Cases

These fixtures verify that the build pipeline produces errors (non-zero exit code or diagnostic output) for invalid inputs.

### Fixture: error-contradicting-constraints

#### File: e2e/fixtures/tsdoc-class/error-contradicting-constraints.ts
```typescript
export class ContradictingForm {
  /** @minimum 10 @maximum 5 */
  invertedBounds!: number;
}
```

#### Test assertions (e2e/tests/error-contradicting-constraints.test.ts)
- [ ] CLI exits with non-zero exit code OR produces a diagnostic (spec S2, 002 §6 `CONSTRAINT_CONTRADICTION`)
- [ ] Diagnostic references both `@minimum 10` and `@maximum 5` (spec D2)
- [ ] Diagnostic message is actionable (spec D4)

---

### Fixture: error-type-mismatch

#### File: e2e/fixtures/tsdoc-class/error-type-mismatch.ts
```typescript
export class TypeMismatchForm {
  /** @minimum 0 */
  stringField!: string;

  /** @minLength 5 */
  numberField!: number;

  /** @minItems 1 */
  notAnArray!: string;
}
```

#### Test assertions (e2e/tests/error-type-mismatch.test.ts)
- [ ] `@minimum` on string field produces diagnostic `TYPE_MISMATCH` (spec S4, 002 §6)
- [ ] `@minLength` on number field produces diagnostic `TYPE_MISMATCH` (spec S4, 002 §6)
- [ ] `@minItems` on non-array field produces diagnostic `TYPE_MISMATCH` (spec S4, 002 §6)

---

### Fixture: error-invalid-path-target

#### File: e2e/fixtures/tsdoc-class/error-invalid-path-target.ts
```typescript
interface SimpleObj {
  name: string;
  value: number;
}

export class InvalidPathTargetForm {
  /** @minimum :nonexistent 0 */
  fieldWithBadTarget!: SimpleObj;

  /** @minimum :name 0 */
  stringSubfieldNumericConstraint!: SimpleObj;
}
```

#### Test assertions (e2e/tests/error-invalid-path-target.test.ts)
- [ ] Path target `:nonexistent` on unknown subfield → diagnostic `UNKNOWN_PATH_TARGET` (spec 002 §6)
- [ ] `@minimum` on string subfield `:name` → diagnostic `TYPE_MISMATCH` (spec S4 — type checked against subfield)

---

### Fixture: error-broadening-constraint

#### File: e2e/fixtures/tsdoc-class/error-broadening-constraint.ts
```typescript
/** @minimum 0 */
type NonNegative = number;

export class BroadeningForm {
  /** @minimum -10 */
  broadened!: NonNegative;
}
```

#### Test assertions (e2e/tests/error-broadening-constraint.test.ts)
- [ ] `@minimum -10` on `NonNegative` (which has `@minimum 0`) → error diagnostic (spec S1, 005 §3.4)
- [ ] Diagnostic is `CONSTRAINT_BROADENING` type (spec 005 §3.4)

**Note:** Narrowing is valid. For a field of type `NonNegative` with inherited `@minimum 0`, a field-level `@minimum 10` produces `minimum: 10`.

---

## Fixture Group 11: @const Tag

### Fixture: const-constraints

#### File: e2e/fixtures/tsdoc-class/const-constraints.ts
```typescript
interface MonetaryAmount {
  value: number;
  currency: string;
}

export class ConstForm {
  /** @const "USD" */
  currency!: string;

  /** @const 42 */
  magicNumber!: number;

  /** @const true */
  alwaysTrue!: boolean;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "currency": {
      "type": "string",
      "const": "USD"
    },
    "magicNumber": {
      "type": "number",
      "const": 42
    },
    "alwaysTrue": {
      "type": "boolean",
      "const": true
    }
  },
  "required": ["currency", "magicNumber", "alwaysTrue"]
}
```

#### Test assertions
- [ ] `@const "USD"` → `"const": "USD"` (spec 002 §2.1, 003 §2.8)
- [ ] `@const 42` → `"const": 42` (spec 002 §3.2)
- [ ] `@const true` → `"const": true` (spec 002 §3.2)

---

## Fixture Group 12: Complex Parity (spec 006 fixtures)

### Fixture: parity-usd-cents (from spec 006 §2.2, §3.2)

#### File: e2e/fixtures/tsdoc-class/parity-usd-cents.ts
```typescript
/** @multipleOf 1 @maximum 99999999999999 */
type Integer = number;

/** @minimum 0 */
type USDCents = Integer;

export class LineItem {
  /** @displayName Unit Price */
  unitPrice!: USDCents;

  /**
   * @displayName Quantity
   * @minimum 1
   * @maximum 9999
   */
  quantity!: USDCents;
}
```

#### Expected JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "unitPrice": {
      "$ref": "#/$defs/USDCents",
      "title": "Unit Price"
    },
    "quantity": {
      "allOf": [
        { "$ref": "#/$defs/USDCents" }
      ],
      "minimum": 1,
      "maximum": 9999,
      "title": "Quantity"
    }
  },
  "required": ["unitPrice", "quantity"],
  "$defs": {
    "Integer": {
      "type": "integer",
      "maximum": 99999999999999
    },
    "USDCents": {
      "allOf": [
        { "$ref": "#/$defs/Integer" },
        { "minimum": 0 }
      ]
    }
  }
}
```

#### Test assertions
- [ ] `unitPrice`: inherits `@minimum 0` from USDCents, `@maximum 99999999999999` and `@multipleOf 1` from Integer (spec 005 §7.3, 006 §2.2)
- [ ] `quantity`: field-level `@minimum 1` narrows USDCents' `@minimum 0` (spec S1, 005 §7.1)
- [ ] `quantity`: field-level `@maximum 9999` narrows Integer's `@maximum 99999999999999` (spec S1, 005 §7.1)
- [ ] Both fields promoted to `"type": "integer"` from `@multipleOf 1` (spec 005 §2.2)
- [ ] `@displayName` → `"title"` (spec 003 §2.8)

---

### Fixture: parity-plan-status (from spec 006 §2.4, §3.3)

#### File: e2e/fixtures/tsdoc-class/parity-plan-status.ts
```typescript
/**
 * @displayName Plan Status
 * @displayName :active Active
 * @displayName :paused Paused
 * @displayName :cancelled Cancelled
 */
type PlanStatus = 'active' | 'paused' | 'cancelled';

export class Subscription {
  /** @defaultValue "active" */
  status!: PlanStatus;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "$ref": "#/$defs/PlanStatus",
      "default": "active"
    }
  },
  "required": ["status"],
  "$defs": {
    "PlanStatus": {
      "oneOf": [
        { "const": "active", "title": "Active" },
        { "const": "paused", "title": "Paused" },
        { "const": "cancelled", "title": "Cancelled" }
      ],
      "title": "Plan Status"
    }
  }
}
```

#### Test assertions
- [ ] Named type `PlanStatus` appears in `$defs` with `oneOf` (spec 003 §5.2, 003 §2.3)
- [ ] Per-member display names → `const`/`title` per member (spec 003 §2.3)
- [ ] Type-level `@displayName Plan Status` → `$defs.PlanStatus.title` (spec 003 §2.8)
- [ ] `@defaultValue` at field level → `"default"` sibling to `$ref` (spec 003 §2.8, 006 §2.4)
- [ ] `$ref` + sibling keywords is valid 2020-12 (spec 003 §7 note)

---

### Fixture: parity-address (from spec 006 §2.5)

#### File: e2e/fixtures/tsdoc-class/parity-address.ts
```typescript
interface Address {
  /**
   * @displayName Street
   * @minLength 1
   * @maxLength 200
   */
  street: string;

  /** @displayName City */
  city: string;

  /**
   * @displayName Country Code
   * @minLength 2
   * @maxLength 2
   * @pattern ^[A-Z]{2}$
   */
  country: string;

  /** @displayName Postal Code */
  postalCode?: string;
}

export class CustomerForm {
  /** @displayName Billing Address */
  billing!: Address;

  /** @displayName Shipping Address */
  shipping?: Address;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "billing": {
      "$ref": "#/$defs/Address",
      "title": "Billing Address"
    },
    "shipping": {
      "$ref": "#/$defs/Address",
      "title": "Shipping Address"
    }
  },
  "required": ["billing"],
  "$defs": {
    "Address": {
      "type": "object",
      "properties": {
        "street": {
          "type": "string",
          "title": "Street",
          "minLength": 1,
          "maxLength": 200
        },
        "city": {
          "type": "string",
          "title": "City"
        },
        "country": {
          "type": "string",
          "title": "Country Code",
          "minLength": 2,
          "maxLength": 2,
          "pattern": "^[A-Z]{2}$"
        },
        "postalCode": {
          "type": "string",
          "title": "Postal Code"
        }
      },
      "required": ["street", "city", "country"]
    }
  }
}
```

#### Test assertions
- [ ] `Address` appears once in `$defs`, referenced twice via `$ref` (spec PP7, 003 §5.1)
- [ ] `billing` is required, `shipping` is not (spec S8)
- [ ] Constraints on `Address` fields are in the `$defs` entry, not at the use site (spec 003 §5.3)
- [ ] `$ref` + `title` siblings work (spec 003 §7 — 2020-12 allows)
- [ ] `postalCode` is optional within Address (absent from Address's `required`) (spec 003 §2.5)
- [ ] `country` has 3 constraints composed (minLength + maxLength + pattern) (spec C1)

---

## Fixture Group 13: Exclusive Bound Edge Cases

### Fixture: exclusive-bound-edge-cases

#### File: e2e/fixtures/tsdoc-class/exclusive-bound-edge-cases.ts
```typescript
export class ExclusiveBoundsForm {
  /** @exclusiveMinimum 0 @exclusiveMaximum 1 */
  probability!: number;

  /** @exclusiveMinimum -273.15 */
  temperature!: number;

  /** @exclusiveMinimum 0 @maximum 100 */
  mixedLower!: number;

  /** @minimum 0 @exclusiveMaximum 1 */
  mixedUpper!: number;
}
```

#### Expected JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "probability": {
      "type": "number",
      "exclusiveMinimum": 0,
      "exclusiveMaximum": 1
    },
    "temperature": {
      "type": "number",
      "exclusiveMinimum": -273.15
    },
    "mixedLower": {
      "type": "number",
      "exclusiveMinimum": 0,
      "maximum": 100
    },
    "mixedUpper": {
      "type": "number",
      "minimum": 0,
      "exclusiveMaximum": 1
    }
  },
  "required": ["probability", "temperature", "mixedLower", "mixedUpper"]
}
```

#### Test assertions
- [ ] Both exclusive bounds on same field (spec 003 §2.6)
- [ ] Negative float exclusive minimum (spec 002 §3.2)
- [ ] Mixed exclusive min + inclusive max (spec 003 §2.6)
- [ ] Mixed inclusive min + exclusive max (spec 003 §2.6)
- [ ] Values are emitted as numbers, not booleans (this is 2020-12, not draft-04) (spec 003 §2)

---

## Known Bugs Summary

| Bug | Fixture | Spec Reference | Description |
|-----|---------|----------------|-------------|
| BUG-1 | nullable-types | 003 §2.3 | `T \| null` emits `anyOf` instead of `oneOf` |
| BUG-2 | product-form | 003 §2.5 | `Record<string, T>` emits `$ref` to empty Record def instead of `additionalProperties: <T>` |
| BUG-3 | inherited-constraints, alias-chain-3-level | 003 §5.2, 005 §3.3 | Named type aliases are inlined instead of using `$defs` + `$ref` |
| BUG-4 | (not yet tested) | 003 §2.3 | `:member` display names on type aliases may not produce `$defs` entry with `oneOf` |

---

## Ambiguous Areas Summary

| Area | Fixture | Question | Recommendation |
|------|---------|----------|----------------|
| AMB-1 | annotations-display-name | Class-level `@displayName` → root `title`? | Yes, per 003 §9 full example |
| AMB-2 | annotations-metadata | `@deprecated` message in JSON Schema? | Emit standard `"deprecated": true` plus `x-<vendor>-deprecation-description` when message text exists |
| AMB-3 | enum-display-names | `@defaultValue draft` vs `@defaultValue "draft"`? | Both produce string "draft" per 002 §3.2 fallback |
| AMB-4 | parity-contact-form | Conditional behavior parity? | Rewrite the TSDoc surface toward the chain DSL fixture first; until then, treat this as blocked on surface alignment rather than unconditional parity |
| AMB-5 | alias-chain-3-level | Inline vs `$defs` for type aliases? | Spec says `$defs` (PP7); current impl inlines |

---

## Test Infrastructure Notes

All TSDoc fixtures use the pattern:
1. Run CLI: `formspec generate <fixture> <className> -o <tempDir>`
2. Parse output schema JSON
3. Assert structure against hand-authored expectations

All chain DSL fixtures use the pattern:
1. Import `buildFormSchemas` from `@formspec/build`
2. Call with the DSL form definition
3. Assert structure against hand-authored expectations

Parity tests should:
1. Generate from both surfaces
2. Assert `jsonSchema` output is `toEqual` between them (spec PP5, A3)

Mixed-authoring composition tests should:
1. Generate the composed form from the static type-derived model plus ChainDSL overlays
2. Assert the resulting JSON Schema and UI Schema are correct for the composed form
3. Assert against hand-authored normative expectations derived from the spec

User-authored confidence tests should be split by concern:
1. Data-model conformance tests validate example payloads against generated JSON Schema
2. Dynamic-option tests exercise resolver behavior and verify returned options match the field's stored type
3. Dynamic-schema tests exercise resolver logic that turns source data into JSON Schema and JSON Forms UI schema
