# @formspec/ts-plugin

TypeScript language service plugin for FormSpec semantic comment analysis.

## Profiling

Set `FORMSPEC_PLUGIN_PROFILE=1` to enable semantic query hotspot logging.

Set `FORMSPEC_PLUGIN_PROFILE_THRESHOLD_MS=<number>` to raise or lower the
minimum total query duration required before a profiling summary is logged.
Empty or non-finite values are ignored.
