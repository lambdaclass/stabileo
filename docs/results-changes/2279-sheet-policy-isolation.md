# Sheet flexure policy stays outside canonical engine checks (2026-11-17)

PR #2279, result-change entry `sheet-policy-isolation`.

The unmerged reinforcement-sheet integration added a sheet-specific minimum exemption to the canonical `checkFlexure` API. This changed required steel and selected bars when the option was supplied, including intermediate geometry used by that selection. Main's canonical implementation is restored byte-for-byte.

The sheet adapter now derives its existing exemption from the canonical result's strength requirement and minimum. It does not change the engine's bar selection or verification policy. Near a minimum-governed selection transition, the sheet requirement can change because the canonical selection supplies the effective depth used by the minimum. Strength-governed requirements retain the canonical strength requirement, including impossible-section bounds.

Rebuild sheets created with the unmerged preview and review their proposals before issuing them. This is not a change to a released main engine result. No committed result snapshot is updated.

`issue-2092-flexure-isolation.test.ts` reproduces the former API leak and checks both supported editions, rectangular and flanged sections, zero demand, light and strength-governed demand, and an impossible section. Existing sheet row tests retain the light-demand exemption and reject insufficient adopted reinforcement. `issue-2092-sheet-physical.test.ts` separately verifies both sheet builders against the shared scene renderer, with exact drawing primitive comparison and ordinary-plan and cancellation controls.
