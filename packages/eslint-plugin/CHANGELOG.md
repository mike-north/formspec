# @formspec/eslint-plugin

## 0.1.0-alpha.3

### Minor Changes

- [#10](https://github.com/mike-north/formspec/pull/10) [`b713663`](https://github.com/mike-north/formspec/commit/b713663420d23b47d3a5317ab3400a555ebf8cc4) Thanks [@mike-north](https://github.com/mike-north)! - Add ESLint plugin for FormSpec decorator DSL type safety

  This plugin provides compile-time validation for projects using FormSpec's TypeScript decorator DSL. It catches common mistakes by validating that decorators match their field types and enforcing consistency rules.

  **Installation:**

  ```bash
  npm install --save-dev @formspec/eslint-plugin
  ```

  **Usage:**

  ```javascript
  import formspec from "@formspec/eslint-plugin";

  export default [...formspec.configs.recommended];
  ```

  **Rules included:**
  - `decorator-field-type-mismatch`: Validates decorator/field type compatibility (e.g., @Min/@Max on number fields)
  - `enum-options-match-type`: Ensures @EnumOptions values match the field's TypeScript union type
  - `showwhen-field-exists`: Validates @ShowWhen references a field that exists in the class
  - `showwhen-suggests-optional`: Suggests fields with @ShowWhen should be optional
  - `min-max-valid-range`: Ensures @Min/@Max and @MinItems/@MaxItems have valid ranges
  - `no-conflicting-decorators`: Detects decorators that imply conflicting field types
  - `no-duplicate-decorators`: Prevents duplicate decorators on the same field

  **Config presets:**
  - `recommended`: Sensible defaults (showwhen-suggests-optional as warning)
  - `strict`: All rules as errors

  See package README for detailed rule documentation.
