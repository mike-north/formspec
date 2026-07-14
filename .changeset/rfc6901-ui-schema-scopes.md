---
"@formspec/build": patch
"formspec": patch
---

Escape UI Schema control and rule scopes per RFC 6901

UI Schema scopes are JSON Pointers, but property tokens were interpolated
without RFC 6901 escaping. A field named or serialized as `a/b~c` now emits
`#/properties/a~1b~0c` instead of `#/properties/a/b~c`, so controls and
conditions resolve the intended schema node for property names containing
`/`, `~`, spaces, Unicode, or URI-sensitive characters. Conditional-rule
combination now decodes the escaped token when rebuilding `properties`
objects rather than reverse-parsing the pointer with string replacement.
