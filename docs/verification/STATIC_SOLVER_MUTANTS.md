# Static solver surviving mutants: first slice

Issues [#1920](https://github.com/lambdaclass/stabileo/issues/1920) and
[#1378](https://github.com/lambdaclass/stabileo/issues/1378).

## Source and scope

The source is nightly run
[41777796778](https://github.com/lambdaclass/stabileo/actions/runs/41777796778),
main `7bb970a61`, dated 2026-11-04. Reading `missed.txt` and `outcomes.json`
from its `mutants-report-288` through `mutants-report-319` artifacts reproduces
639 survivors. Nine shards did not finish, so this is not a complete solver
mutation census.

This first slice selects 29 result mutations in six functions. It covers
prescribed-load subtraction and displacement/reaction indexing in the large
solver clusters, and element selection, load accumulation and removal of
warping load assembly. It also records 15 equivalent index-bound mutations
in the two load-vector functions.
The other historical survivors, including diagnostic arithmetic, tolerance
boundaries, support springs and the sparse-to-dense-LU fallback, remain outside
this slice. The largest function totals below are historical context, not
current measurements of the entire functions.

The repository entry point is `make mutants.engine SCOPE=solver ARGS='...'`,
which invokes `scripts/mutants.sh`. `.cargo/mutants.toml` excludes documented
heuristics and equivalent mutations; `scripts/mutants-equivalent.py` excludes
integer index expressions only when their values are exactly unchanged.
The script uses cargo-mutants `--file` filters and maps test modules to their
binaries, with a nextest filter when that runner is selected.
`static_solver_mutants` is included explicitly so that filter runs the new tests.

## Independent references

`engine/tests/static_solver_mutants.rs` does not call engine stiffness,
fixed-end-force, transformation or recovery helpers for its expected values.
Material properties, geometry, loads and settlements are synthetic fixture
inputs, not design recommendations or tabulated engineering data.
The input modulus is converted from MPa to kN/m² by multiplication by 1000,
as required by the engine input contract.

For a cantilever of length L, constant rigidity EI, transverse tip force P,
uniform member load q and tip couple M, integration of equilibrium and
Euler–Bernoulli curvature gives

    v(x) = v0 + theta0*x
           + [P*x²*(3L-x)/6 + q*x²*(6L²-4Lx+x²)/24 + M*x²/2]/EI
    theta(x) = theta0
           + [P*x*(2L-x)/2 + q*x*(3L²-3Lx+x²)/6 + M*x]/EI
    N(x) = Px + qx*(L-x)
    u(x) = u0 + [Px*x + qx*(L*x-x²/2)]/EA
    twist(x) = twist0 + T*x/GJ

The two 3D bending planes use their respective inertias and the right-handed
rotation signs. Member shear and moment follow from the remaining loads to
the right of each cut; base reactions additionally subtract loads applied
directly at the base. Tests check every node and both ends of every member.
The 3D prepared solver is reused with reversed and scaled loads to ensure that
prescribed movements remain fixed while load effects change.

The 2D fixtures use one element for the dense solve and 22 for sparse, PCG and
the public dense reference. The 3D fixtures use one element for dense and 12
for sparse and PCG. These are small physical models, not performance tests.
PCG requests an IC(0) preconditioner and a relative residual tolerance of 1e-12.

For fixed-ended members, compatibility and equilibrium give transverse
reactions -qL/2 and end couples of magnitude qL²/12 for a uniform load.
A point force P at a, with b=L-a, gives reaction shares
b²(L+2a)/L³ and a²(L+2b)/L³, and end-couple magnitudes
Pab²/L² and Pa²b/L². Axial point-force shares are b/L and a/L.
Restrained thermal strain gives EA alpha deltaT; restrained thermal curvature
gives EI alpha deltaT_gradient/depth. The tests specify alpha and both depths.

Two disconnected fixed-ended members receive different signed loads. One has
warping rigidity and the other is ordinary, exercising both load mappings and
ensuring a load intended for one member cannot be applied to the other.
The thermal case is repeated with warping disabled to check ordinary 12-DOF
assembly too. Expected bimoments are zero for these uncoupled bending and axial
loads.

The assertion tolerance is 1e-9 times a fixed physical scale: 0.01 m for axial
translations, 1 m for transverse translations, 0.1 rad for twist, 1 rad for
bending rotations, and 100 kN or kN·m for forces and moments. These give absolute
bounds of 1e-11 m, 1e-9 m, 1e-10 rad, 1e-9 rad and 1e-7 in force/moment units.
They allow floating-point cancellation in the subdivided beam and its force
recovery while remaining far below the nonzero load and settlement effects.
Zero bimoments use an absolute bound of 1e-9. Tolerances were fixed before
mutation replay and were not increased to pass a test.

## PR #1925 review: restrained thermal moment sign

The positive start `Mz` oracle is correct. The review assumes that positive
`dtGradientY` heats the +y face, whereas the engine's documented convention is
`dtGradientY = T(-y) - T(+y)` ([frames §6.2](../solver/frames.md#62-equivalent-nodal-loads)).
The 2D `dtGradient` has the same definition. The 3D z gradient instead uses
`dtGradientZ = T(+z) - T(-z)`. These definitions must precede any sign argument.

### First-principles derivation

Let v = uy, w = uz, gy = dtGradientY, gz = dtGradientZ and let hy, hz be the
stated depths. From [frames §2.4](../solver/frames.md#24-local-dof-ordering-and-rotation-conventions),
θz = v′, θy = -w′ and the total fibre strain is

    epsilon = u′ - y*v″ - z*w″.

For the specified linear temperature distribution,

    deltaT(y,z) = dtUniform - gy*y/hy + gz*z/hz
    epsilon_thermal = alpha*deltaT(y,z).

A fully restrained straight member has zero total strain, so

    sigma_x = E*(epsilon - epsilon_thermal)
            = -E*alpha*dtUniform + E*alpha*gy*y/hy - E*alpha*gz*z/hz.

The fixture uses centroidal principal axes. The reported moments act on the
negative-x face ([frames §7.1](../solver/frames.md#71-end-forces)). Its axial
traction is -sigma_x, so r × traction gives

    Mz = integral(y*sigma_x dA) = +E*Iz*alpha*gy/hy
    My = -integral(z*sigma_x dA) = +E*Iy*alpha*gz/hz.

These are the start support couples. End support couples have the opposite
sign; reported section moments have the same sign at both ends because
recovery negates the end nodal couple. The axial start reaction is
+E*A*alpha*dtUniform, with the opposite end reaction. Using the synthetic
fixture inputs, E converted to kN/m², the first member's start reactions are
Fx = 3.36882 kN, My = -0.08021 kN·m and Mz = +0.048126 kN·m.
The second member multiplies all three by -0.7.

For mechanical bending alone, sigma_x = -E*y*v″ gives Mz = -E*Iz*v″.
That agrees with this file's cantilever: positive tip Fy gives v″ > 0 and
negative Mz. For restrained thermal loading with gy > 0, the mechanical strain
is +alpha*gy*y/hy, equivalent to v″ = -alpha*gy/hy, so Mz is positive.
If the +y face were hotter, gy would be negative and the review's negative
start couple would follow. Applying that negative couple to positive gy would
reverse the documented input convention.

### Second method and 2D cross-check

`restrained_y_gradient_matches_mechanical_curvature_and_2d` compares the
fixed-fixed member's pure y-gradient response with an unheated member held at
prescribed end movements. With κ = -alpha*gy/hy, impose

    v(0) = θz(0) = 0
    v(L) = κ*L²/2
    θz(L) = κ*L.

The cubic interpolation reduces exactly to v(x) = κ*x²/2, giving constant
mechanical curvature and zero shear. Its end couples are -E*Iz*κ at I and
+E*Iz*κ at J. This calculation uses stiffness and prescribed-displacement
reaction recovery, bypassing every thermal fixed-end-force helper. Both
ends remain restrained; the support movements impose the mechanical stress
state of the straight, thermally restrained member. Thus equal reactions and
section moments are an independent check of the thermal load sign.

The test compares all six 3D reaction components, both section moments, and
the corresponding 2D reactions and section moments for positive and negative
gradients. It covers warping and ordinary members in a mixed model, then an
entirely ordinary model. The horizontal 2D plane maps its transverse DOF to
3D uy and its rotational DOF to θz, as in this file's cantilever fixtures.
No thermal helper supplies the expected values. The existing elements test
`frame_thermal_inputs::a_positive_y_gradient_heats_the_minus_y_face_and_a_positive_z_gradient_the_plus_z_face`
independently pins the free-cantilever hot-face convention.

## Verification method

Following `~/projects/stabileo-wt/mutant-rules.md`, each selected historical
mutation is applied by hand to the corresponding unchanged source statement
on baseline `52619652e`. Historical and current operator/guard statements must
match exactly; only their line numbers move. The whole-function removal is
applied to the complete current warping load-assembly body, including axial
load support added since the nightly. Each replay runs

    timeout 900 systemd-run --user --scope -q -p MemoryMax=8G -p TasksMax=512 \
      make test.engine.targeted TEST=solver FILTER='static_solver_mutants -- --ignored'

The nonzero run must contain `test result: FAILED`, rather than a build failure
or resource timeout. The source is restored byte for byte after every mutation,
and the same ten tests must then pass. Commit A keeps the reproducers ignored
as `known wrong result: #1920`; commit B enables them. The ignores reproduce
historical mutant wrong results, not a demonstrated wrong result on main.
No production fix or engine result change is made.

The before column below is the selected subset of the historical missed list.
The after column is the number in that subset still passing all new tests when
replayed. It is not a new full-file cargo-mutants score. No full suite or
cargo-mutants execution is used for these hand replays.

## Equivalent load-vector bounds

These 15 historical `<` to `<=` mutations cannot change a result. The DOF
iterators in `solver/dof.rs` append at most six entries per shell node (three
for solid shells). Their load constructors allocate the fixed sizes below,
including early-return paths; transformations retain those sizes. Missing DOF
map entries only shorten the iterator. Thus its maximum index is strictly less
than the load-vector length, so equality is impossible on every iteration.
No floating-point or tolerance argument is needed. No broader exclusion is
enabled in `.cargo/mutants.toml`.

| Function | Historical line:column | Current line | Reason |
|---|---|---:|---|
| `assemble_load_vector_3d_dense` | `1579:26` | 1827 | The triangle plate DOF iterator has at most 18 entries and the load vector always has 18; i can never equal its length. |
| `assemble_load_vector_3d_dense` | `1657:26` | 1905 | The quad DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_dense` | `1705:26` | 1953 | The quad DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_dense` | `1763:26` | 2011 | The quad9 DOF iterator has at most 54 entries and the load vector always has 54; i can never equal its length. |
| `assemble_load_vector_3d_dense` | `1791:26` | 2039 | The solid shell DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_dense` | `1808:26` | 2056 | The curved shell DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2875:26` | 3123 | The triangle plate DOF iterator has at most 18 entries and the load vector always has 18; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2901:26` | 3149 | The quad DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2925:26` | 3173 | The quad DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2936:26` | 3184 | The quad9 DOF iterator has at most 54 entries and the load vector always has 54; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2952:26` | 3200 | The quad9 DOF iterator has at most 54 entries and the load vector always has 54; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2976:26` | 3224 | The quad9 DOF iterator has at most 54 entries and the load vector always has 54; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `2999:26` | 3247 | The solid shell DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `3028:26` | 3276 | The curved shell DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |
| `assemble_load_vector_3d_sparse` | `3054:26` | 3302 | The curved shell DOF iterator has at most 24 entries and the load vector always has 24; i can never equal its length. |

## Before and after, per function

All 29 result mutations fail a test; all 29 byte-for-byte restorations pass
all ten tests. None is counted as caught through a timeout or a build failure.
The 15 equivalent mutations remain executable equivalents, not test kills.

| Function | Historical total | Selected non-equivalent before → after | Equivalent, proved |
|---|---:|---:|---:|
| `PreparedStatic2D<'_>::solve_loads_by_path` | 186 | 1 → 0 | 0 |
| `PreparedStatic3D::solve_loads_pcg` | 63 | 4 → 0 | 0 |
| `PreparedStatic3D::solve_loads_sparse` | 62 | 1 → 0 | 0 |
| `assemble_element_loads_3d` | 3 | 1 → 0 | 0 |
| `assemble_element_loads_3d_mapped` | 18 | 10 → 0 | 0 |
| `assemble_element_loads_3d_warping` | 21 | 12 → 0 | 0 |
| `assemble_load_vector_3d_dense` | 10 | 0 → 0 | 6 |
| `assemble_load_vector_3d_sparse` | 17 | 0 → 0 | 9 |
| **Total in these functions** | **380** | **29 → 0** | **15** |

The other 595 entries in the 639-entry historical list are unassessed here.
This does not assert they still survive on current main, or that the eight
functions above have no remaining survivors. A complete current-file score
requires a separate bounded/sharded run on an appropriate host.

### Individual kill evidence

All positions below refer to `engine/src/solver/linear.rs` or `assembly.rs`
at the nightly revision; the current line is given separately. Test names
are in module `static_solver_mutants`. Each row has a failing mutated run
and a passing restored run.

| Historical mutant | Current line | Killing test |
|---|---:|---|
| `assembly.rs:1934:35: replace += with *= in assemble_element_loads_3d` | 2182 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:1955:5: replace assemble_element_loads_3d_warping with ()` | 2203 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:1957:46: replace match guard dl.element_id == elem.id with false in assemble_element_loads_3d_warping` | 2205 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:1957:46: replace match guard dl.element_id == elem.id with true in assemble_element_loads_3d_warping` | 2205 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:1957:60: replace == with != in assemble_element_loads_3d_warping` | 2205 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:1974:35: replace += with *= in assemble_element_loads_3d_warping` | 2222 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:1974:35: replace += with -= in assemble_element_loads_3d_warping` | 2222 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:1977:49: replace match guard pl.element_id == elem.id with false in assemble_element_loads_3d_warping` | 2225 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:1977:49: replace match guard pl.element_id == elem.id with true in assemble_element_loads_3d_warping` | 2225 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:1977:63: replace == with != in assemble_element_loads_3d_warping` | 2225 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:1983:35: replace += with -= in assemble_element_loads_3d_warping` | 2231 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:1986:42: replace match guard tl.element_id == elem.id with false in assemble_element_loads_3d_warping` | 2234 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:1986:42: replace match guard tl.element_id == elem.id with true in assemble_element_loads_3d_warping` | 2234 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:2022:60: replace == with != in assemble_element_loads_3d_mapped` | 2270 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:2038:62: replace += with *= in assemble_element_loads_3d_mapped` | 2286 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:2038:62: replace += with -= in assemble_element_loads_3d_mapped` | 2286 | `fixed_warping_and_mapped_distributed_reactions` |
| `assembly.rs:2041:63: replace == with != in assemble_element_loads_3d_mapped` | 2289 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:2046:62: replace += with *= in assemble_element_loads_3d_mapped` | 2294 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:2046:62: replace += with -= in assemble_element_loads_3d_mapped` | 2294 | `fixed_warping_and_mapped_point_reactions` |
| `assembly.rs:2049:42: replace match guard tl.element_id == elem.id with false in assemble_element_loads_3d_mapped` | 2297 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:2049:42: replace match guard tl.element_id == elem.id with true in assemble_element_loads_3d_mapped` | 2297 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:2061:62: replace += with *= in assemble_element_loads_3d_mapped` | 2309 | `fixed_warping_and_mapped_thermal_reactions` |
| `assembly.rs:2061:62: replace += with -= in assemble_element_loads_3d_mapped` | 2309 | `fixed_warping_and_mapped_thermal_reactions` |
| `linear.rs:1319:24: replace -= with /= in PreparedStatic2D<'_>::solve_loads_by_path` | 1351 | `cantilever_2d_sparse_closed_form` |
| `linear.rs:2966:33: replace -= with /= in PreparedStatic3D::solve_loads_sparse` | 3038 | `cantilever_3d_sparse_closed_form` |
| `linear.rs:3305:33: replace -= with += in PreparedStatic3D::solve_loads_pcg` | 3377 | `cantilever_3d_pcg_closed_form` |
| `linear.rs:3305:33: replace -= with /= in PreparedStatic3D::solve_loads_pcg` | 3377 | `cantilever_3d_pcg_closed_form` |
| `linear.rs:3460:36: replace + with - in PreparedStatic3D::solve_loads_pcg` | 3532 | `cantilever_3d_pcg_closed_form` |
| `linear.rs:3468:38: replace + with * in PreparedStatic3D::solve_loads_pcg` | 3540 | `cantilever_3d_pcg_closed_form` |

## Final checks

With the ignores removed, `make test.engine.targeted TEST=solver
FILTER=static_solver_mutants` passes all ten tests. `make lint.engine` and
`make test.engine.gates` pass; the latter runs 230 nextest tests across its
14 filtered groups and 57 unit-boundary doctests. Test discovery and changelog
validation pass. The existing focused mutation-runner checks pass all 18 tests.
Both production solver files remain byte-for-byte identical to the starting
main revision. No engine result, results-change registry or advisory is changed.
