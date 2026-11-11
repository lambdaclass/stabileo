# Plastic balance model identity and incremental certificate storage (2026-11-11)

Results-change entry `plastic-nightly-model-and-candidate-budgets`; issues #1953 and #1954.

The saved-project notice requires both frame members and a plastic analysis. A
stamp that records only a linear solve does not qualify; an unstamped frame still
qualifies because its analysis history is unknown. Truss-only, cable-only and
shell-only models do not enter the affected frame certificate path.

The linear-only frame in the recheck-store regression has matching member map
keys and record IDs. The checked ID index therefore resolves the same member as
before, and the plastic certificate storage forecast is never called. Its result
does not change with this correction, so its exact opening-notice list stays
unchanged (#1957). The native balance correction also covers noncanonical IDs in
linear and P-Delta inputs, as exercised by the engine regressions; this plastic
notice does not assert a change to ordinary linear frame results.

The recovered-force accuracy check resolves element and node IDs from the model that
produced the result. It no longer interprets those IDs as JSON object keys. Both 2D
and 3D checks use the same checked index. A missing or ambiguous recovered ID follows
the coded conditioning refusal path instead of panicking or borrowing another
member's geometry. Stiffness, loads, transforms, releases and constraints continue to
come from that solve's model.

Exact plastic certification now budgets the initial section samples before exact
model elimination and budgets each LP's actual halfspace count before constructing
its floating matrices. The shared check still adds retained exact and floating
storage and the reduced-dimension simplex workspace. The engine byte ceiling,
exact workspace ceiling, rational limb limit, refinement counts and numerical
accuracy tolerances are unchanged. Fuzz admission retains its conservative full
refinement forecast.

An optional refinement that cannot fit keeps the preceding matched LP solution and
sample set. Its static and kinematic candidates still have to pass the existing exact
checks. The certificate therefore retains bounds it can prove instead of refusing
solely because a hypothetical maximum refinement would exceed storage.

On main at `1549793fe`, the nightly plane-frame case 0 returned a raw factor of
16.304002204946766 but refused its certificate on a 1094472352-byte forecast against
the 1073741824-byte ceiling. The unchanged exact checks prove the interval
[16.304002203583256, 16.304002204583703] after this correction, including without a
solver result as a candidate. The raw factor differs from the exact upper bound by
about 2.3e-11 relatively, within the test's existing 1e-9 comparison. The checked API
continues to return the certified lower bound and preserve its existing mismatch
warning policy.

The crash was introduced by `4399b2971`; the false plane certificate refusal first
appears at `5c0ca25b3`, before the conditioning changes merged. Their immediate
parents were checked with the same artifact and first random-frame model. These
findings establish a crash and lost availability on current main, not a newly
established silent wrong structural answer. No new advisory is assigned here.

The first-storey reduction of space case 2 still failed the old gate: its hypothetical
simplex workspace was 2531855824 bytes against 1046490872 bytes after reserving
27250952 retained bytes. With candidate accounting it proves
[29.43827832675951, 29.438715985324652]. The raw factor 28.538141992029562 is below
this interval and retains the existing biaxial lower-bound warning. The full case 2
was bounded locally rather than run to completion; the original nightly generator
and assertions remain intact.
