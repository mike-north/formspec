import { RuleTester } from "@typescript-eslint/rule-tester";
import * as vitest from "vitest";
import { noDuplicateTags } from "../../rules/constraint-validation/no-duplicate-tags.js";
import { noDescriptionConflict } from "../../rules/constraint-validation/no-description-conflict.js";
import { noContradictoryRules } from "../../rules/constraint-validation/no-contradictory-rules.js";

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

ruleTester.run("no-duplicate-tags", noDuplicateTags, {
  valid: [
    {
      code: `
        class Form {
          /** @showWhen status=draft @showWhen type=internal */
          name!: string;
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class Form {
          /** @minimum 0 @minimum 1 */
          count!: number;
        }
      `,
      errors: [{ messageId: "duplicateTag" }],
    },
  ],
});

ruleTester.run("no-description-conflict", noDescriptionConflict, {
  valid: [{ code: `class Form { /** @description A name */ name!: string; }` }],
  invalid: [
    {
      code: `class Form { /** @description A name @remarks Fallback */ name!: string; }`,
      errors: [{ messageId: "descriptionRemarksConflict" }],
    },
  ],
});

ruleTester.run("no-contradictory-rules", noContradictoryRules, {
  valid: [
    { code: `class Form { /** @showWhen status=draft */ name!: string; }` },
    { code: `class Form { /** @showWhen status=draft @showWhen type=internal */ name!: string; }` },
  ],
  invalid: [
    {
      code: `class Form { /** @showWhen status=draft @hideWhen status=archived */ name!: string; }`,
      errors: [{ messageId: "contradictoryRuleEffects" }],
    },
    {
      code: `class Form { /** @enableWhen status=draft @disableWhen status=archived */ name!: string; }`,
      errors: [{ messageId: "contradictoryRuleEffects" }],
    },
    {
      code: `class Form { /** @showWhen status=draft @disableWhen status=archived */ name!: string; }`,
      errors: [{ messageId: "contradictoryRuleEffects" }],
    },
  ],
});
