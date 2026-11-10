# Plastic mechanism resource refusals and exact interval readings (2026-11-10)

Results-change entry `plastic-mechanism-refusal-propagation`, PR #1888.

Both planar and spatial plastic mechanism extraction now propagate errors from
exact elimination through the candidate search. Previously `.ok()?` converted a
workspace or rational-limb refusal into an absent mechanism, allowing other
candidate searches to continue or replacing the resource diagnostic with an
unrelated missing-mechanism reason. A checked certificate now refuses with the
original resource reason whenever mechanism elimination exceeds its budget.
The exact certificate checks and all resource ceilings are unchanged.

The app's plastic interval reader now compares the displayed factor directly
against the certificate endpoints. A factor outside the enclosure is outside
even when its relative deviation was below the former UI comparison threshold.
Both endpoints remain inclusive. No interval is widened and no engine factor
changes because of this display correction. This also corrects the WASM test
that previously expected an above-interval raw factor to read as inside.

Regressions exercise rational-limb refusals directly in both mechanism builders,
compare the portal's checked certificate against an independent certificate,
require no mismatch diagnostic for an inside-interval factor, and read the real
WASM above-interval artifact as outside. See
[SA-2026-059](../advisories/SA-2026-059-plastic-interval-and-resource-refusals.md).
