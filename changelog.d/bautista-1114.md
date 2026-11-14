### Changed
#### Research, Tools and the diagram game are separate opt-in integrations (2026-11-14)

The Research additions, consolidated Tools and new Mohr entry points, and diagram game each
have a separate switch, disabled by default in development and production: `VITE_RESEARCH=1`,
`VITE_TOOLS=1` and `VITE_DIAGRAM_GAME=1`. Browser overrides use the existing `stabileo-feature-`
settings. Existing Research, paper, calculator and Examples pages remain public when these switches
are off. The Research switch gates only new Fehér controls and explanations and Hungarian Research.
Account and advertising rollout gates retain their production-off defaults. Hungarian dictionaries,
public copy, release guidance and result-change notices follow the integrated routes without
importing the held integrations. Account legal pages follow the existing accounts switch.

Mohr plots select the shear point appropriate to the displayed convention and retain small
nonzero shear in 3D. Tool force residuals count every supported force load, including point
loads, axial loads and partial distributed loads. Exercise parameter ranges preserve authored
decimals and bounds; unloaded truss bars remain unloaded. The flexure article checks the actual
bar depths and rejects the nonductile example in every published translation. Numerical failure
while loading the research strip reports an unsolved start rather than claiming a physical snap.

Consent decisions use database revisions serialized per account. Explicit terms refusal is
rejected, and project research requires an explicit opt-in. Shared sign-in channels require the
matching attempt. Mixed account-gated actions cannot fail open. Gated save/copy operations share
promise settlement; closing a worker answers its pending requests. Advertising hierarchy keys
preserve their structure, and withdrawing advertising consent also removes `_gid` cookies.

The public metadata reader parses the exported page object, preserving routes and dates when
property names or values use different quote styles. No structural engine analysis or design
kernel is changed by this integration.
