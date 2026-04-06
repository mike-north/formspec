---
"@formspec/build": patch
---

Stop summary-derived JSON Schema descriptions at recognized metadata tags such as `@apiName` so consumed TSDoc metadata does not leak into emitted descriptions.
