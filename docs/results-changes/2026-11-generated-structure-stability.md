# Generated structures receive their missing stability restraints

2026-11-10, PR #1753. This change repairs the generated models rather than admitting physical mechanisms. The engine classification, SA-2026-054 controls, C08 refusals and conditional accuracy constant are unchanged. A mechanism is refused independently of its current loads.

## User-visible generator changes

- Standalone trapezoidal, parallel-chord, Pratt and arch trusses, including monopitch and subdivided web variants, now state and emit their planar idealization. Their two bearings are fork supports: the pin holds translations and global-X twist, while the roller permits global-X translation and holds the other translations and global-X twist. Every other panel node has explicit global-Y translation and global-X/global-Z rotation restraints. Global-X/global-Z translations and the in-plane global-Y rotation remain free at those panel nodes. This supplies lateral and torsional restraint without changing the in-plane geometry, loads, sections or member types.
- The standalone rolled-portal/solid-web beam generator, including variable sections, receives the same planar restraints. Its variable-section geometry and section interpolation are unchanged.
- The lattice-girder and sawtooth built-in structure generators receive the same fork bearings and planar panel restraints. Howe roofs inherit the repaired truss generator.
- Standalone lattice columns now default to fixed bases, supplying the out-of-plane and torsional restraint missing from the previous pinned default. Explicit `fixedBase: false` remains available and its original mechanism is covered by a refusal control.
- Sheds now default to wall bracing, roof-plane bracing and vertical bracing between trusses. The existing end-bay placement and brace profiles are retained. The former roof top-chord translation is thereby tied to the bearing line and ground. Original nodes, loads, member sections and members remain; the added braces use the bracing profile. Existing options still permit an explicitly unbraced model, which is refused. Standalone truss supports and the standalone planar-restraint assumption are omitted when the truss is placed on shed columns: the shed derives its restraint from members and bases.
- The preview and generated model show the additional standalone panel supports. The planar-restraint assumption is supplied in all six generator locales.

Previously saved models are not rewritten. Regenerate a structure to obtain the corrected supports or bracing, review its support and brace assumptions, then solve again. The linear solver continues to refuse the original mechanisms, including a mode unexcited by the current load. The new registry entry records regenerated-model solve outcomes separately from the existing linear stability entry and is scoped to models containing recorded groups of kind `generated`. Ordinary manually authored or example models do not receive this regeneration guidance. It declares only `solve.ok`: changing generator inputs does not explain a numerical change in an unchanged saved model. The existing legacy bridge fabrication controls must continue rejecting unrelated displacement and reaction changes.

## Fixture corrections

The two-internal-hinge XZ arch releases local My, the global-Y pin direction under the engine's actual local-axis convention. It solves with released-end moment and total-force balance assertions. The original Mz releases permit a physical flap and are refused.

The P-Delta braced portal fixture has a lateral translation restraint at its head; the original two pinned bearings permit rigid rotation about their common line. The inclined variable-section beam fixture gains a fork restraint against its axial spin; the original plain pins are refused. Their existing equilibrium assertions remain. The detailed 3D audit now expects refusal of its deliberately unbraced space-truss top chord even with unexciting loads.

## Reproduction and proof

Commit A captures the exact 32 failing web inputs and explicit null vectors in `engine/tests/fixtures/1753-web-mechanisms.json`. The native test assembles the full physical stiffness with artificial stiffness disabled, verifies that every constrained component of each vector is zero, and checks

`max(abs(K u)) / (max(abs(K)) * max(abs(u))) < 1e-14`.

It also verifies refusal of every original input. This proves a mechanism for each failure; no false refusal was found. The stored vectors give the nonzero `(node, local DOF, value)` components explicitly. The residual is measured against the full assembled stiffness, including restrained rows. Local DOFs 0,1,2 are global translations and 3,4,5 are global rotations. The mechanism table below uses the original test names.

The generated-model reproducer in commit A is ignored as `known wrong result: #1753`; when explicitly executed, it fails on the first unrestrained truss with a conditioning refusal. Commit B regenerates its 28 inputs from the corrected app generators and removes that ignore. It checks finite displacements and total nodal force balance at the unchanged conditional accuracy constant. The My arch control is active in both commits; only the genuinely failing generated-model reproducer is ignored in A. The original 32 refusal controls remain active.

| Original failing web test | Classification and explicit motion | Normalized residual |
|---|---|---:|
| P-Delta member forces > a truss at a support takes its share of the second-order reaction | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 6.03902881492867507e-20 |
| 3D hinge over-release (Bug B) > Arco Articulado 3D — two-internal-hinge arch in XZ must solve, not flag mechanism | Mechanism: middle segment rotates about hinge line; release-axis compatible joint rotations | 4.11084329870859002e-18 |
| an infinitesimal mechanism the loads do not excite > is solved, named, and its reactions are the analysis solver's | Mechanism: top chord nodes 11 through 18 translate along Y | 3.49933284679668878e-17 |
| a welded I cantilever of variable depth > inclined, under a projected partial load and a temperature, balances its reactions | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 5.91426162712832192e-18 |
| a generated truss solves > returns finite displacements rather than a mechanism | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 0.00000000000000000e+00 |
| a generated truss solves > carries the applied load down to its supports | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 0.00000000000000000e+00 |
| a generated truss solves > holds up as a trapezoidal | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 0.00000000000000000e+00 |
| a generated truss solves > holds up as a parallelChord | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 0.00000000000000000e+00 |
| a generated truss solves > holds up as a arch | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 7.35015184596300979e-20 |
| a generated truss solves > holds up as a pratt | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a pratt web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a howe web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a warren web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a x web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a k web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a subdivided pratt web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 2.03525704101376532e-20 |
| a generated truss solves > holds up with a subdivided howe web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 3.41370690838418887e-20 |
| a generated truss solves > holds up with a subdivided warren web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 3.05288556152064798e-20 |
| a generated truss solves > holds up with a subdivided x web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up with a subdivided k web | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| a generated truss solves > holds up as a monopitch | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 0.00000000000000000e+00 |
| a generated lattice column solves > stands up under a load on its head | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 5.08748627624858297e-20 |
| a generated shed solves > is not a mechanism at 3 frames with a roof and purlins | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.64193290008636577e-17 |
| the configuration that is NOT stable, recorded rather than hidden > latticed columns on pinned bases stand once the cap is a plate and not two pins | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.64193290008636577e-17 |
| the default shed > is not a mechanism, with nothing overridden | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.64193290008636577e-17 |
| the default shed > deflects like the same shed on solid columns, which is the check that it is stiffness | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.64193290008636577e-17 |
| the default shed > stays solvable across the frame counts the panel offers | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.28276007819247331e-18 |
| a roof with no purlins, and what is actually missing > turning purlins back on is the fix the panel offers, and it works | Mechanism: listed frame-connected chord/roof nodes: unit translation along global Y, rotations zero | 1.64193290008636577e-17 |
| every kind solves > latticeGirder | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 0.00000000000000000e+00 |
| every kind solves > howeRoof | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 1.73695348619817021e-19 |
| every kind solves > sawtooth | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 4.77313861711295220e-20 |
| generated members of variable section > inserted, the beam blends welded I to welded I and solves stiffer than its shallow end alone | Mechanism: all nodes: rigid rotation about the line through the first two bearings | 2.00950612079204979e-18 |

## Other web-area follow-up

The tools area's existing influence-line near-mesh regression exceeded its unchanged timeout even in isolation. The calculator repeated assembly and the load-independent stiffness classification for every axle position. It now uses the existing 2D prepared-load session for the unchanged matrix, validates every new load through that API and frees the session in a `finally` block. Its final critical-axle static solve remains independent.

Twenty-one cases compare the complete returned calculator result with prepared sessions disabled and enabled using strict equality. All pass, along with the existing analytical influence-line, equilibrium and timeout assertions. This is stiffness reuse, with no measured numerical result change; it does not broaden the generator registry entry or relax an engineering or performance threshold.

## Safety and scope

No production engine gate is relaxed. The 1e-4 accuracy constant, spectral limits and existing SA-2026-054/C08 assertions remain unchanged. These measurements establish mechanisms in the captured branch inputs, not a new silent wrong result on origin/main or a release. Main/release execution was not part of this follow-up; no new advisory is added. Existing advisory files are untouched. No issue closure is implied by making the corrected generator inputs solvable.
