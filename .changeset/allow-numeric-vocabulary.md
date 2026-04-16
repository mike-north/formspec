---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Allow numeric constraint keywords (minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf) in vocabulary-mode custom constraints. Enables Integer custom types to emit standard JSON Schema numeric keywords via emitsVocabularyKeywords.
