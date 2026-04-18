/**
 * Tests for tag-recognition/tsdoc-comment-syntax.
 *
 * Regression tests for issue #291: `tsdoc/syntax` false positives on FormSpec
 * constraint tag values containing TSDoc-significant characters (`{}`, `@`).
 * This rule suppresses those false positives while still validating TSDoc syntax
 * outside raw-text tag payloads.
 *
 * @see https://github.com/mike-north/formspec/issues/291
 * @see https://tsdoc.org/
 */
import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { tsdocCommentSyntax } from "../../../rules/tag-recognition/tsdoc-comment-syntax.js";

RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["*.ts"],
      },
    },
  },
});

ruleTester.run("tsdoc-comment-syntax", tsdocCommentSyntax, {
  valid: [
    // Well-formed comment with no FormSpec tags — clean TSDoc prose.
    {
      code: `
        class Form {
          /** The user's full name. */
          name!: string;
        }
      `,
    },
    // Issue #291 regression: @pattern with curly braces in regex.
    // tsdoc/syntax would flag `{5}` as a malformed inline tag.
    {
      code: String.raw`
        class Form {
          /** @displayName Postal Code @pattern ^[0-9]{5}(-[0-9]{4})?$ */
          postalCode!: string;
        }
      `,
    },
    // Issue #291 regression: @pattern with @ in regex.
    // tsdoc/syntax would flag the @ inside the regex as a tag opener.
    {
      code: String.raw`
        class Form {
          /** @displayName Email @pattern ^[^@]+@[^@]+$ */
          email!: string;
        }
      `,
    },
    // @enumOptions with JSON object literals containing {}.
    {
      code: `
        class Form {
          /** @enumOptions [{"value":"a"},{"value":"b"}] */
          status!: string;
        }
      `,
    },
    // @defaultValue with JSON object literal.
    {
      code: `
        class Form {
          /** @defaultValue {"foo":"bar"} */
          config!: string;
        }
      `,
    },
    // Multiple FormSpec block tags interleaved with summary text.
    {
      code: String.raw`
        class Form {
          /** Address zip code. @displayName ZIP Code @pattern ^[0-9]{5}$ @minimum 5 */
          zip!: string;
        }
      `,
    },
    // Plain class declaration with valid TSDoc — class-level comment.
    {
      code: `
        /** A well-formed class comment. */
        class MyForm {
          count!: number;
        }
      `,
    },
  ],

  invalid: [
    // Unterminated inline tag in prose (NOT inside a raw-text payload).
    // The {@link ...} is opened but never closed before */.
    {
      code: `
        class Form {
          /** Hello {@link unterminated */
          name!: string;
        }
      `,
      errors: [{ messageId: "tsdocSyntax" }],
    },
    // Malformed inline tag (empty tag name after @-brace).
    // TSDoc produces two diagnostics for `{@}`: one for the missing tag name
    // after `{@` and one for the unescaped `}` character.
    {
      code: `
        class Form {
          /** A field with {@} malformed inline tag. */
          name!: string;
        }
      `,
      errors: [{ messageId: "tsdocSyntax" }, { messageId: "tsdocSyntax" }],
    },
  ],
});
