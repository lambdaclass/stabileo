# #810 — MITC4 curved-shell benchmark audit

**Finding: two model-definition errors, not evidence of an engine regression.**
The roof has an artificial vertical support at the midspan crown. Both builders
skip symmetry constraints at intersecting edges; the cylinder's unconstrained
corner DOFs cause its apparent over-compliance. Fixing the models removes the
roof plateau and restores cylinder convergence. `engine/src` is unchanged.
No reference or tolerance has been relaxed. The corrected cylinder still fails
the existing 2% requirement at 6–16; those checks remain explicitly ignored.

## Reproduction and provenance

Audited baseline: `d7ad866d8c75415c8a0d322b91de6ac01ba1c3c3`.
Run with `CARGO_TARGET_DIR=/private/tmp/claude-501/codex-810-target`
and `CARGO_BUILD_JOBS=2`:

```sh
cargo test -p dedaliano-engine --test validation research_roof_ -- --ignored --nocapture
cargo test -p dedaliano-engine --test validation research_cylinder_ -- --ignored --nocapture
```

On the baseline, each command fails all four accuracy checks. The obstacle-course
case file is **not on this branch**; the inventory identifies research commit
`710b6bad36c2b2d96183d27c6661be9208da945a`, containing
`engine/tests/benchmarks/shell_obstacle_course.json`. Replaying its eight roof/cylinder
inputs through the current production solver reproduces the Rust builder results
below. No research branch was checked out or merged.

Run `python3 docs/audits/810-reproduce.py` to repeat the original models, case-file
replay, isolated changes and element experiments. It reads the pinned Git objects,
generates and removes a temporary Cargo example, and never edits engine source.
Optional modes: `models`, `isolate`, `elements`. Its test-only copied stiffness
changes only drilling/shear multipliers; the custom constrained sparse assembly
must agree with the production solver within `1e-7` relative before sensitivities
are evaluated (observed discrepancy below `4e-11`).

| Mesh per direction | Original roof uz | Corrected roof uz | Corrected roof error | Original cylinder uy | Corrected cylinder uy | Corrected cylinder error |
|---|---:|---:|---:|---:|---:|---:|
| 6 | −0.2551645854 | −0.3071052451 | +1.556% | −1.900068993e−5 | −1.133602369e−5 | −37.878% |
| 8 | −0.2553752410 | −0.3044769053 | +0.687% | −1.997897942e−5 | −1.375582553e−5 | −24.617% |
| 12 | −0.2555954865 | −0.3028859113 | +0.161% | −2.035360372e−5 | −1.605044706e−5 | −12.043% |
| 16 | −0.2555908778 | −0.3024255392 | +0.0084% | −2.022948432e−5 | −1.701161680e−5 | −6.775% |
| 32 | −0.2553779519 | −0.3021856455 | −0.0709% | −1.963334794e−5 | −1.806436776e−5 | −1.006% |

Errors are signed magnitude errors relative to 0.3024 and 1.8248e−5; negative
means stiff. Original cylinder errors are +4.125%, +9.486%, +11.539%, +10.859%.
Thus the trend is not strictly increasing even before correction.

## Model audit and causal isolation

The [COMSOL benchmark definition](https://doc.comsol.com/6.4/doc/com.comsol.help.models.sme.scordelis_lo_roof/scordelis_lo_roof.html)
confirms roof R=25, full L=50, t=0.25, ν=0, E=4.32e8, 40° half-angle,
quarter model, free longitudinal edge, rigid end diaphragm (uy=uz=0), two
symmetry edges, and vertical surface traction −90. The measurement is uz at
x=0, θ=40°, the midspan free edge. **There is no crown vertical pin.**
[Altair OS-V:0730](https://help.altair.com/hwsolvers/os/topics/solvers/os/scordelis_lo_roof_verification_r_2.htm)
explicitly uses the 0.3024 target. Reference caveat: COMSOL quotes 0.3086 from
MacNeal–Harder and approximately 0.302 as the converged value; 0.3024 is the
established comparison value retained here, not a newly verified quotation of
the original paper's numerical table.

The cylinder is **one eighth**, not one quarter: x∈[0,300], θ∈[0,π/2], R=300,
full L=600, t=3, E=3e6, ν=0.3. Each of the two opposing unit forces is shared by
four sectors at its application point, hence −0.25 along y at x=0, θ=0.
Measure uy there, not maximum displacement or a different component.
[Nguyen-Van et al. (2009), §4.2, Fig. 9 and Table 4](https://cdn.techscience.cn/files/CMES/2009/v49n2/cmes.2009.049.081.pdf)
provide the geometry, one-eighth domain and 1.8248e−5 reference; their MITC4
16×16 ratio is 0.9300, consistent with the corrected 0.93225 here.

The engine multiplies material E by 1000 in assembly: the inputs 432000 and
3000 therefore produce the intended numerical moduli 4.32e8 and 3e6.
Geometry and force numbers are in a consistent benchmark force/length system.
They should not be interpreted as a literal SI concrete specification: switching
between the published N-based labels and solver kN-based labels scales both
modulus and loads together, leaving displacement unchanged. No factor-of-1000,
thickness, half-length or force-partition correction is warranted.

Symmetry requires normal translation and both tangential **axial-vector**
rotations zero. For both models, x=0 fixes ux, ry, rz. Roof θ=0 fixes uy, rx, rz.
Cylinder θ=0 fixes uz, rx, ry; θ=π/2 fixes uy, rx, rz. End diaphragms fix uy, uz.
Constraints must be unioned at intersections, not skipped when a support exists.

| 16×16 controlled experiment | Roof uz / cylinder uy | Interpretation |
|---|---:|---|
| Roof: remove only crown uz pin | −0.3075492898 | Eliminates the 15.48% stiff plateau |
| Roof: complete symmetry, retain pin and old loads | −0.2495701744 | Missing rotations cannot explain stiffness; completing them stiffens |
| Roof: correct symmetry, no pin, old loads | −0.3027897157 | Small remaining load omission effect |
| Roof: correct symmetry, no pin, full loads | −0.3024255392 | +0.0084% error |
| Roof: old BCs, full loads | −0.2555908778 | Loads omitted at fixed DOFs cannot change displacement |
| Roof: old BCs, loads ×0.25 (incorrect per-volume interpretation) | −0.06389771944 | Fourfold error, not the observed plateau |
| Roof: old BCs, loads ×1.187 | −0.3033863719 | Can fit displacement artificially, but applies 45111.19196 instead of 39269.90817 |
| Cylinder: union corners only, keep old interior rotations | −1.701190084e−5 | Ratio 0.932261; dominant correction |
| Cylinder: fix interior rotations only, keep old corners | −2.022791474e−5 | Ratio 1.108500; almost no correction |
| Cylinder: both corrections | −1.701161680e−5 | Ratio 0.932246 |

Analytic quarter-roof dead weight is 90×25×25×(40π/180)=**39269.908169872**.
The original applied magnitudes at 6/8/12/16 are
35724.70813 / 36662.14083 / 37565.48507 / 38004.37402; the missing fraction is
1/(2n)+1/(4n²). Restoring loads at the supported diaphragm changes reactions,
not displacements. After removing the artificial crown support its tributary
load must also be restored. At 16, the corrected reaction is +39269.908169893,
residual 2.04e−8. Original reactions also balance their *incomplete* input loads
(residual −7.37e−8): equilibrium alone does not establish the correct model.
Cylinder load −0.25 and reaction +0.25 balance within 4.1e−13 at corrected 16.
These reactions include symmetry-plane reactions, not just end reactions.

## Element hypotheses (corrected models)

All sensitivities below use 16×16. They are diagnostic changes to a copied
stiffness, not proposed tuning of production physics.

| Hypothesis / experiment | Roof result | Cylinder result | Finding |
|---|---:|---:|---|
| Drilling multiplier 0.01 / 1 / 100 (default coefficient 1e−3) | uz = −0.307048675 / −0.302425539 / −0.301609890 | uy = −1.701939155e−5 / −1.701161680e−5 / −1.699878718e−5 | Changes +1.529%/−0.270% and +0.0457%/−0.0754%; not the reported model errors |
| Shear stiffness multiplier 0.1 / 10, tying locations unchanged | +0.8466% / −0.2431% displacement change | +6.1876% / −0.6667% | Cylinder retains shear/discretization sensitivity; lowering shear is not a valid fix |
| Maximum normalized element warping | 5.53e−16 | 8.14e−16 | Cylinder strips are planar quads to roundoff; warped-element correction is inactive |
| MITC9 at 8 / 16 (standard models in `discretization_error.rs`) | reference ratios 0.999292 / 1.004583 | 0.950160 / 1.006829 | Independent element family converges near reference |
| Thickness ×0.1 / 1 / 10: MITC4/MITC9 displacement | 1.006011 / 0.995443 / 0.972558 | 0.795547 / 0.925922 / 0.934670 | Thin cylinder is harder; no roof locking plateau |

Thickness comparisons preserve force per area (self-weight density adjusted
inversely with thickness). Both families use their production self-weight loads;
the roof's faceted loaded area gives total 39266.79306 at 16, 0.00793% below the
arc-area nodal load, explaining the small difference from the corrected builder.
At cylinder t=0.3, MITC4/MITC9 displacements are −0.002272140/−0.002856073;
at t=30 they are −1.252705e−7/−1.340265e−7. These are comparisons, not claims that
the default-thickness reference remains applicable.

Flat simply supported unit-square control, E=2e8, ν=0.3, q=1, 16×16:
MITC4/Navier ratios at t=0.001/0.01/0.1 are 0.998755/1.000726/1.123064;
MITC4/MITC9 ratios are 0.998707/0.996806/0.988813. Thin flat bending does not lock.
The thick plate differs from Kirchhoff/Navier because transverse shear is physical.
Curvature/thickness sensitivity leaves membrane/bending interpolation and transverse
shear discretization as candidates for the cylinder's **remaining coarse-mesh**
error; these experiments do not uniquely assign that remainder to membrane locking
or a tying-point defect. Its 32×32 error is already 1.006%, and the published MITC4
16×16 result agrees. No engine change is justified by #810.

## Change and verification

Implemented the model corrections in `shell_benchmark.rs`: union complete
symmetry constraints, remove the roof crown pin, retain all gravity loads, and
correct the cylinder domain description. Added corner-constraint, total-force
and reaction regressions; enabled all four original strict roof checks; added
strict cylinder 32×32 accuracy and monotone 6→16 error checks. The original four
coarse-cylinder 2% checks remain ignored with an accurate reason; they are not
silently replaced by weaker bounds.

The research case JSON is absent from this branch. Its owning branch should
regenerate the eight roof/cylinder inputs from the corrected builders, retaining
signed measurements and the same 2% gates, and expose the coarse-cylinder failures.
Do not alter loads, drilling penalty, shear coefficient or references to make
those meshes pass. Any future engine improvement needs a separate derivation and
convergence study on corrected curved models, a thickness sweep, rigid-body and
flat-patch/shear checks, and independent MITC9 comparisons.

Validation after correction (same target directory and two build jobs):

- `cargo test -p dedaliano-engine --test validation benchmarks::shell_benchmark::research_ -- --nocapture`: **13 passed, 4 ignored**, zero failures. The four ignores are the unchanged coarse-cylinder accuracy gates.
- `cargo test -p dedaliano-engine --test shells mitc9_curved_benchmarks_at_16x16 -- --nocapture`: **1 passed**; roof/cylinder/hemisphere ratios 1.0046/1.0068/0.9755.
- The reproduction script's `isolate` mode was rerun successfully from its checked-in form.
- `git diff --check` passes; `git diff -- engine/src` is empty.
