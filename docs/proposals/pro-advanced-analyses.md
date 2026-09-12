# PRO's Advanced panel: what each analysis does, and whether it works

Seventeen entries, audited by **pressing every one of them** on a real model
(`rc-design-qa-8`, solved) rather than by reading the code. The sweep lives in
`e2e/pro-advanced-audit.spec.ts` and its rule is: an analysis must either
report something or say why it cannot. Silence is a failure.

**Result: 11 answered, 6 refused for a stated reason, 0 silent.**

The panel is four analyses always on screen and thirteen behind a chip picker,
one at a time.

---

## Always visible

| Analysis | What it does | Engine | Status |
|---|---|---|---|
| **P-Delta** | Second-order analysis: re-solves with the geometric stiffness from the axial forces, iterating until the displacements settle. Reports convergence, the iteration count and B2. | `wasmPDelta3D` | ✅ answers |
| **Modal** | Natural frequencies and mode shapes from the mass and stiffness matrices. Reports each mode's frequency, period and modal participation per axis, plus the total mass. | `wasmModal3D` | ✅ answers |
| **Espectral** | Response-spectrum analysis: combines the modes against a design spectrum. Reports base shear per direction. **Requires Modal first** — the button stays disabled until there is a modal result, which is right: a spectrum has nothing to combine without modes. | `wasmSpectral3D` | ✅ answers |
| **Pandeo** | Linear buckling: the eigenvalue problem on the geometric stiffness. Reports the critical load factors. | `wasmBuckling3D` | ✅ answers |

## Behind the chip picker

| Analysis | What it does | Engine | Status |
|---|---|---|---|
| **Time History** | Transient dynamic response by direct integration, from a sine excitation or an accelerogram. Takes dt and a duration. | `solveTimeHistory3D` | ✅ answers |
| **Armónico** | Steady-state response over a frequency sweep — f_min to f_max, damping ξ, a direction and a response node. Reports peak amplitude, the resonant frequency, and an FRF curve. | `solveHarmonic3D` | ✅ answers |
| **No lineal** | Plastic / collapse analysis: incremental loading with hinge formation. | `solvePlastic3D` | ✅ answers |
| **Imperfecciones** | Re-solves with geometric imperfections applied — the out-of-plumb a code requires be considered. | `solveWithImperfections3D` | ✅ answers |
| **Fundación Winkler** | Elastic-foundation springs under nodes, from a modulus of subgrade reaction. | `solveWinkler3D` | ⛔ needs springs defined |
| **Interacción suelo-estructura** | Soil-structure interaction through a spring set with its own stiffnesses. | `solveSSI3D` | ⛔ needs springs defined |
| **Contacto / gap** | Non-linear contact: elements that carry load only in one sense, closing a gap first. | `solveContact3D` | ⛔ needs contact entries |
| **Construcción por etapas** | Staged construction: solves a sequence of models, each inheriting the state of the last. | `solveStaged3D` | ⛔ needs stages defined |
| **Fluencia y retracción** | Creep and shrinkage over a series of time steps. | `solveCreepShrinkage3D` | ✅ answers |
| **Líneas de influencia (3D)** | The influence line for a chosen response as a unit load travels the structure. | influence-line module | ⛔ needs a target chosen |
| **Multi-caso** | Solves many load cases in one pass, for envelopes. | `solveMultiCase3D` | ✅ answers |
| **Analizador de secciones** | Section properties of an arbitrary polygon or a parametric shape — area, inertias, torsion constant. Independent of the model. | WASM section analyser | ✅ answers |
| **Análisis con vínculos** | Solves with explicit constraint pairs between degrees of freedom. | `solveConstrained3D` | ⛔ needs constraint pairs |

**On the six that refuse.** Every one of them is disabled because its INPUT is
missing — springs, contact entries, stages, a constraint pair, an influence
target. That is the correct behaviour and the opposite of the failure this
audit looks for: they decline rather than running on nothing and reporting a
confident result about a model that was never described to them.

---

## What I would change next, in order

1. **Say what is missing on the button, not only by being grey.** A disabled
   button explains nothing. Each of the six knows exactly what it wants;
   "needs at least one spring" beside it is one line each and turns a dead
   control into an instruction. The design commands already do this — the
   pattern is `rebar3DMissingSteps` in `stages.ts`.

2. **Espectral's dependency on Modal should be stated.** It is the only
   ordering constraint in the panel and it is currently invisible until you
   notice the button is grey.

3. **A result should say when it went stale.** Every one of these is computed
   against the model as it was when the button was pressed. Edit a section
   afterwards and the reported frequency is about a structure that no longer
   exists. The verification surface already has a staleness rule; this panel
   has none.

4. **The panel is 1900 lines and carries seventeen forms.** It is over every
   ceiling the repo sets for a component and is the obvious candidate for the
   decomposition `rc-design-gates.test.ts` already enforces on ProPanel and
   ProDesignTab.

5. **`advancedWip` banner.** The whole panel is labelled work-in-progress. Now
   that eleven of seventeen answer on a real model, that banner is doing the
   reader a disservice — it should name which of them are provisional, or go.
