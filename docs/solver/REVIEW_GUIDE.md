# Reviewing Stabileo's formulations: a guide

This folder is written for an independent reviewer: a structural engineer or finite-element
specialist who checks the **mathematics** of the engine, not its code. Stabileo's results are
used to design buildings, so the questions that matter are these. Is each formulation the right
one for what it claims to model? Are its limits stated? Is every claim backed by a test?

## What is already checked mechanically, and what is not

Read this first. It tells you where your time is most valuable.

| Layer | Checked by | What it does not cover |
|---|---|---|
| The solver solved its own assembled system $Ku=f$ accurately | Result certificates in exact/interval arithmetic, with Lean proofs ([CERTIFY.md](../verification/CERTIFY.md)) | Whether $K$ and $f$ represent the model |
| Frame/truss $K$, $K_g$, $M$, equivalent loads, transformations equal their derivation | SymPy derivation compared entry by entry to 1e-13 ([SYMBOLIC.md](../verification/SYMBOLIC.md)) | Whether the derivation's *assumptions* are appropriate |
| Elements against closed forms and other codes | Validation suites (`engine/tests/validation`), OpenSees and Code_Aster differential tests ([BENCHMARKS.md](../BENCHMARKS.md)) | Cases nobody thought to compare |
| Shells, cables, curved beams, fiber beams, nonlinear solvers | Patch tests, rigid-body-mode tests, benchmarks, and the tests listed in each file | No symbolic derivation: **highest review value** |

## Where to start

1. **[frames.md](frames.md)**, especially §2 (axes and DOFs), §4.4 (releases) and §7 (sign of
   the reported forces). The conventions there are used by every other file.
2. **[assembly-constraints.md](assembly-constraints.md)**: how element matrices become the global
   system. Covers supports, inclined supports, springs, rigid links and diaphragms, the artificial
   stiffness the assembler adds, and how reactions are recovered.
3. **[shells.md](shells.md)**: the least externally verified elements, and the most used in
   slabs and walls.
4. **[mass-geometric-dynamics.md](mass-geometric-dynamics.md)**: buckling, modal, response
   spectrum, time history. Several open questions here are unconservative.
5. **[nonlinear.md](nonlinear.md)** and **[special-elements.md](special-elements.md)**.

## What to check in each formulation

For every element, the file lists the following. Please challenge each point:

- **Assumptions**: kinematics (Euler–Bernoulli or Timoshenko, Kirchhoff or Mindlin), small or
  large rotation, shear correction, warping, material law. Are they stated, and do they match
  what users will assume?
- **Derivation**: shape functions, strain–displacement relations, integration rule, tying points
  for MITC elements, drilling stabilisation. Is the closed form correct? Is the integration
  exact or deliberately reduced, and is any reduction safe (no spurious zero-energy modes)?
- **Conventions**: local axes, DOF order, sign of rotations, sign of reported forces and
  stresses. A sign error in output is as dangerous as one in the stiffness.
- **Loads**: are equivalent nodal loads consistent with the element's own shape functions, and
  condensed for releases?
- **Limits of validity**: thin and thick limits, distortion, locking, slenderness. Does the
  engine refuse or warn outside them?
- **Verification**: does each claim have a test that would fail if the claim were false? The
  "Verification map" section of each file names them.

## The open questions

Each file ends with **"Discrepancies and open questions for review"**. Every item has an ID
(FR-, SH-, SP-, AC-, MD-, NL-), a status and a test:

- **FIXED**: found while writing this documentation, corrected, with a regression test that
  fails on the old code.
- **OPEN**: a real limitation or suspected error left for a decision. The demonstrating test is
  marked `#[ignore = "open question <ID>: …"]`. Run it with
  `cargo test --test <file> -- --include-ignored` to see it fail.
- **DOCUMENTED-CHOICE**: a deliberate simplification, with its quantitative impact where we
  could measure it.

The OPEN items are where a reviewer's judgement is most needed. For each one, please say
whether it is acceptable as documented, needs a warning or refusal, or must be fixed.

### Summary as of this writing

| File | Fixed | Open | Documented choice |
|---|---|---|---|
| [frames.md](frames.md) | FR-1, FR-2 (and FR-6, a test gap now closed) | FR-3, FR-4, FR-5 | FR-7, FR-8 |
| [shells.md](shells.md) | SH-2, 3, 4, 5, 10, 11, 12 | SH-1, 6, 7, 8, 9, 15 | SH-13, 14, 16 |
| [special-elements.md](special-elements.md) | SP-1 to SP-7, SP-9 | SP-10, 11, 12, 14, 15, 17, 18 | SP-8, 13, 16 |
| [assembly-constraints.md](assembly-constraints.md) | AC-1, 2, 4, 6, 11, 14 | AC-3, 5, 7, 10, 12, 13, 15, 16 | AC-8, 9 |
| [mass-geometric-dynamics.md](mass-geometric-dynamics.md) | MD-11 (doc) | MD-5, 6, 7, 8, 10, 12 | MD-1 to 4, 9, 13 |
| [nonlinear.md](nonlinear.md) | NL-1, NL-7 | NL-3, 4, 5, 6, 8, 9, 10, 11, 13, 17 | NL-2, 12, 14, 15, 16 |

### Open items to look at first

These are the open items that can make a result **unconservative**, or wrong without any
warning:

- **MD-7:** response-spectrum base shear is always combined by SRSS, even when CQC is requested.
  This is unconservative for closely spaced modes.
- **MD-8:** frame $K_g$ has no torsional (Wagner) term, so the torsional buckling of low-$GJ$
  columns (cruciform, angles) is missed. In the test the reported load is 96% too high.
- **MD-5:** modal participation omits the inertia coupled to the supports.
- **NL-4, NL-5, NL-6:** the "material nonlinear" solver has three problems:
  - it reports elastic member forces;
  - it is a whole-member secant softening, not plasticity;
  - its 3D yield surface was unconservative compared with the 2D one (fixed, #429).
- **NL-9, NL-11:** imperfections can silently do nothing. The 3D notional loads default to the Y
  axis, and residual stresses and initial displacements are ignored.
- **AC-15:** the web's embedding of a flat 2D model into the 3D solver does not negate nodal
  moments and prescribed rotations. From the code, they act in the opposite sense.
- **AC-3, AC-5:** the same rigid link or diaphragm means different things in 2D and in 3D.
- **AC-7, AC-10:**
  - Winkler member forces omit the foundation reaction.
  - Some settlements are dropped without a message.
- **AC-12, AC-13, AC-16 (fixed, SA-2026-017):** the p-y, t-z and q-z soil curves departed from the cited references.
- **SH-6 (fixed), SH-7, SH-9:**
  - Curved-shell bending moments were reported as zero (fixed, SA-2026-013).
  - MITC9 on curved geometry does not reproduce rigid-body motion exactly.
  - The solid shell has Poisson thickness locking.
- **SP-12, SP-14, SP-15:**
  - Cable tension comes out low in indeterminate systems.
  - The linear solver lets a cable carry compression silently.
  - Curved-beam axes depended on the plan orientation (fixed, #418).
- **FR-4:** the frame thermal coefficient $\alpha$ and section depth are constants of the engine.
  The web compensates for them, but direct API users do not get that correction.

## How to run the checks

```sh
cd engine
export CARGO_BUILD_JOBS=2
cargo test --test derivations symbolic_elements::          # frame family vs SymPy
cargo test --test derivations derivation_frames::          # this documentation's frame checks
cargo test --test derivations derivation_shells::
cargo test --test derivations derivation_special_elements::
cargo test --test derivations derivation_assembly_constraints::
cargo test --test derivations derivation_mass_geometric_dynamics::
cargo test --test derivations derivation_nonlinear::
cargo test --test derivations derivation_mass_geometric_dynamics:: -- --include-ignored   # see open questions fail
```

To regenerate the symbolic test, see [SYMBOLIC.md](../verification/SYMBOLIC.md)
(`tools/symbolic/gen.py --check`).

## Reporting

Please report findings as issues or PR comments referencing the file, section and item ID. For
a suspected error, the most useful report is a small model with its expected result and the
reference it comes from. We turn it into a test before changing the engine.
