# @formspec/documentation/remarks-without-summary

📝 Warns when @remarks appears without summary text.

<!-- end auto-generated rule header -->

`@remarks` is emitted as `x-<vendor>-remarks` (default:
`x-formspec-remarks`), not as JSON Schema `description`. Add summary text
before the first tag when the field also needs author-facing help text in
JSON Schema, editor tooltips, and rendered form help.
