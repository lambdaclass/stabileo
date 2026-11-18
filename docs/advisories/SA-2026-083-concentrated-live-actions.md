# SA-2026-083: Automatic live loads omitted required concentrated actions

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-16 |
| Issue | [#2207](https://github.com/lambdaclass/stabileo/issues/2207) |
| Fix | PR [#2236](https://github.com/lambdaclass/stabileo/pull/2236); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `0c375732c8d533b984e6d68f0cddc792f5a6a594`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`concentrated-live-actions`](../../web/src/lib/provenance/result-changes/concentrated-live-actions.json) |

## Affected features

Automatic CIRSOC 101-2025 occupancy and roof load plans, including concentrated-load
occupancies, stairs, passenger garages and roof maintenance or occupied roofs.
The TypeScript generator is shared by the web workspaces before solver selection;
it has no native Rust automatic-generation entry point. An affected generated load
remains incomplete when passed to 2D/3D, linear/nonlinear or native/WASM solvers.

## What was wrong

The planner read the uniform occupancy load and could return `READY` without
evaluating the required concentrated alternative or its most unfavourable placements.
Numeric uniform entries also lost concentrated-rule references for stairs and
passenger garages. Roof plans did not evaluate the separate concentrated roof checks.
Successful solving of the resulting explicit loads did not identify the omission.

The retained main-source witness is a simply supported 2 m office beam with a 1 m
tributary width. The old plan returns `READY` with only 2.5 kN/m uniform live load,
no unsupported message and midspan moment 1.25 kN·m. The required centered 9 kN
patch over 0.75 m gives 3.65625 kN·m by independent section equilibrium:
M = PL/4 − Pa/8. Inputs, code clauses and the derivation are in the
[results-change record](../results-changes/2026-11-concentrated-live-actions.md).
This witness proves a silent unconservative result on main; it is not a general
error bound. Historical release binaries were not assessed.

The normative source is the repository's
[CIRSOC 101-2025 chapter 4](../codes/CIRSOC/markdown/cirsoc-101-2025/capitulo-4-sobrecargas-de-diseno.md),
§4.4 and Table 4.1, including notes (j)/(r) and §4.10.1 for special concentrated
rules. The results-change record quotes the relevant repository clauses.

## How to tell if your model is affected

Review models relying on automatically generated CIRSOC 101 occupancy or roof
loads without independent concentrated-action checks. Check the applicable
contact area, alternatives or simultaneous actions, and governing placements for
each member response. Uniform-load reduction, matching global resultants or a
successful solver run does not establish that the omitted actions were checked.
The saved-project notice conservatively selects all generated loads because the
saved provenance does not establish that the required checks were performed.

## Fixed in

0.6.2 (PR [#2236](https://github.com/lambdaclass/stabileo/pull/2236)). A mandatory load-code admission operation
checks floor and roof occupancies before the shared planner can return `READY`.
It preserves concentrated-rule references and blocks plans requiring unevaluated
concentrated actions. The application boundary checks status and blocking diagnostics
before changing loads, combinations or provenance. Localized explanations identify
the refusal. Uniform-load diagnostics remain inspectable in blocked plans.

Automatic governing-placement envelopes are not implemented. The correction is an
explicit refusal of incomplete generation; it does not supply missing loads in
saved models. Solver arithmetic for unchanged explicit input is unchanged.

## Workaround

Independently model and verify the applicable concentrated actions, contact areas,
member transfer and governing placements, including the required alternatives or
simultaneous actions. Use verified explicit load cases for analysis and design.
Do not treat the uniform-only diagnostics of a blocked plan as a complete answer.

## What to do with results you already have

After upgrading to 0.6.2:

Review affected generated-load models and manually establish the required
concentrated actions before rerunning analyses, combinations and design checks.
Re-solving stored loads alone does not supply an omitted action. Review member
forces, deflections, sizing, calculations and deliverables based on the earlier loads.

## Credits and references

The coordinator assigned SA-2026-083 for #2207. The
[results-change record](../results-changes/2026-11-concentrated-live-actions.md)
contains the normative repository quotations, independent physical expectation,
parent-failing regressions and supported uniform-load controls. The fix shipped in 0.6.2 (PR [#2236](https://github.com/lambdaclass/stabileo/pull/2236)).
