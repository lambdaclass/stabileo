### BREAKING (results)
#### Snow loads retain their ridge-crossing moment (2026-11-16)

Snow loads now split at the physical ridge, preserving force and moment on
crossing members in projected, width and panel allocation (#2176). Regenerate
saved snow loads, then rerun analyses, combinations and design checks; re-solving
stored loads alone is insufficient. See the [results-change record](../docs/results-changes/2026-11-snow-crossing-profile.md)
and [SA-2026-073](../docs/advisories/SA-2026-073-snow-crossing-moment.md). Fix PR pending.
