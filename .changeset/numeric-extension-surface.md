---
"@formspec/build": minor
"@formspec/core": minor
"@formspec/language-server": minor
---

Add extension-defined TSDoc constraint tags and built-in constraint broadening for custom types through the public FormSpec extension surface.

This also fixes the extension integration path so class and interface schema generation can resolve registered custom source types, parse extension tags alongside built-in tags in the same TSDoc block, validate extension-defined narrowing and contradiction semantics, and emit stable JSON Schema plus JSON Forms output without adding Decimal-specific branches to FormSpec internals.
