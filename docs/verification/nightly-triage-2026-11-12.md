# Nightly findings #1962–#1985 — triage 2026-11-12

Tested `origin/main` **`c11af4e36316a0c1251a7175cb4fe16660090778`**, verified against GitHub main during replay. The nightly ran `8c93eba0d5a53edfd0b11ec96d0f0eb3c53ceb12`. All **24 issues** were fetched with their comments; all have an inline witness and zero comments. No artifact substitution or seed regeneration was needed. The [JSON archive](nightly-triage-2026-11-12.json) follows the [November 11 replay](candidate-replay-2026-11-11.md): source inventory, hashes, exact models, observations, historical checks, owner suggestions and limitations. The [fixture archive](../../engine/tests/fixtures/nightly-triage-2026-11-12.json) preserves all original models, exact fuzz bytes and captured follow-ups.

**18 HARNESS, 2 FALSE-REFUSAL, 4 DUPLICATE.** Three duplicates are engine crashes already addressed by open PR #1957/#1953; the fourth is the warned numerical-invariance issue #762. No silent wrong engineering result beyond its certified uncertainty was established by these witnesses. This does not certify the engine generally and does not recommend closing any issue.

## Method and commands

All substantive work used `make` targets or `make shell`; initial `pwd` and file-list discovery preceded the shell. Native checks use the dev profile; fuzz targets were built without sanitizers and replayed once per exact input. Public WASM was built with `make wasm`. OpenSeesPy 3.8.0 ran in worktree-local isolated processes. No full suite, random campaign, large model, refined mesh, engine/oracle change, weakened assertion, issue mutation, push, PR or advisory.

| Key | Command / scope |
|---|---|
| `I` | gh issue view N --json number,title,body,comments,url,labels (24 issues and relevant existing issues); gh pr list --state open --limit 100 --json number,title,headRefName,headRefOid,body,url; git ls-remote origin refs/heads/main |
| `F` | Inside make shell: cargo build --locked --manifest-path engine/fuzz/Cargo.toml --bin json_static --bin json_dynamics --bin json_plastic --bin model_certify -j 2; engine/fuzz/target/debug/TARGET exact.bin -runs=1. Fixed input replay only, no fuzz campaign. |
| `M` | Temporary selected-cell metamorphic probe: make test.engine.targeted TEST=metamorphic FILTER="triage_probe::selected -- --ignored". Preserve case name, densities, reported seed and invariant prefix for RNG-consuming relations. Symmetry runs both constructions. The probe records outcomes and is removed. |
| `X` | Inside make shell: cargo build --locked -p dedaliano-engine --example solve_json; isolated local OpenSeesPy 3.8.0 reference, tools/opensees/compare.py exact-model-{1967,1968,1969}.json --bin target/debug/examples/solve_json -j 1 --report report.json. No mesh refinement. |
| `W` | make wasm; node probes of the actual public exports, exact raw JSON for crashes and captured native transformed models for refusals. No web suite. |
| `H` | git archive selected-commit Cargo.toml Cargo.lock engine ai-backend [docs] into worktree-local scratch; targeted builds/replays there. Separate build directories, or touch all archived Rust sources before reusing one: git archive preserves old mtimes and Cargo otherwise reused a stale binary. The stale historical run was discarded and rerun after a logged engine rebuild. |
| `P` | make test.engine.targeted TEST=metamorphic FILTER=nightly_triage::; make test.engine.targeted TEST=metamorphic FILTER="nightly_triage:: -- --ignored"; make check.test-targets |

## Per-issue classification

| Issue | Reported analysis/relation | Class | Cause | Evidence / owner |
|---|---|---|---|---|
| [#1962](https://github.com/lambdaclass/stabileo/issues/1962) | fuzz/json_dynamics | DUPLICATE #1953 (CRASH) | `record-id` | `F, H, W`; PR #1957 owner (conditioning/recovery) |
| [#1963](https://github.com/lambdaclass/stabileo/issues/1963) | fuzz/json_plastic | DUPLICATE #1953 (CRASH) | `record-id` | `F, H, W`; PR #1957 owner (conditioning/recovery) |
| [#1964](https://github.com/lambdaclass/stabileo/issues/1964) | fuzz/json_static | DUPLICATE #1953 (CRASH) | `record-id` | `F, H, W`; PR #1957 owner (conditioning/recovery) |
| [#1965](https://github.com/lambdaclass/stabileo/issues/1965) | certified modal/rotation | FALSE-REFUSAL | `modal-mass-rank` | `M`; Dynamics/modal finite-spectrum owner |
| [#1966](https://github.com/lambdaclass/stabileo/issues/1966) | fuzz/model_certify | HARNESS | `rigid-translation-oracle` | `F, H, W`; Fuzz certificate-oracle owner |
| [#1967](https://github.com/lambdaclass/stabileo/issues/1967) | opensees/mismatch | HARNESS | `opensees-reference` | `X`; OpenSees differential-reference owner |
| [#1968](https://github.com/lambdaclass/stabileo/issues/1968) | opensees/false_reject | HARNESS | `refusal-contract` | `X`; OpenSees refusal-classifier owner |
| [#1969](https://github.com/lambdaclass/stabileo/issues/1969) | opensees/false_reject | FALSE-REFUSAL | `truss-action-balance` | `X`; Conditional member-balance owner (2D and 3D) |
| [#1970](https://github.com/lambdaclass/stabileo/issues/1970) | creep & shrinkage (t = t0)/reversal | HARNESS | `reversal-assembly-budget` | `M`; Metamorphic accuracy-budget owner |
| [#1971](https://github.com/lambdaclass/stabileo/issues/1971) | creep & shrinkage (t = t0)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1972](https://github.com/lambdaclass/stabileo/issues/1972) | constrained/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1973](https://github.com/lambdaclass/stabileo/issues/1973) | linear (WASM typed path)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1974](https://github.com/lambdaclass/stabileo/issues/1974) | linear (WASM typed path)/reversal | HARNESS | `reversal-assembly-budget` | `M`; Metamorphic accuracy-budget owner |
| [#1975](https://github.com/lambdaclass/stabileo/issues/1975) | linear (sparse path)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1976](https://github.com/lambdaclass/stabileo/issues/1976) | linear/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1977](https://github.com/lambdaclass/stabileo/issues/1977) | material nonlinear/units | DUPLICATE #762 | `material-conditioned-recovery` | `M`; Nonlinear/conditioning accuracy owner (#762; coordinate with #428) |
| [#1978](https://github.com/lambdaclass/stabileo/issues/1978) | linear (dense reference)/reversal | HARNESS | `reversal-assembly-budget` | `M`; Metamorphic accuracy-budget owner |
| [#1979](https://github.com/lambdaclass/stabileo/issues/1979) | Winkler (no foundation)/reversal | HARNESS | `reversal-assembly-budget` | `M`; Metamorphic accuracy-budget owner |
| [#1980](https://github.com/lambdaclass/stabileo/issues/1980) | load combinations/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1981](https://github.com/lambdaclass/stabileo/issues/1981) | staged (one stage)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1982](https://github.com/lambdaclass/stabileo/issues/1982) | Winkler (no foundation)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1983](https://github.com/lambdaclass/stabileo/issues/1983) | staged (loads in two stages)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1984](https://github.com/lambdaclass/stabileo/issues/1984) | certified linear/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |
| [#1985](https://github.com/lambdaclass/stabileo/issues/1985) | linear (dense reference)/symmetry | HARNESS | `symmetry-construction` | `M`; Metamorphic symmetrisation/accuracy owner |

## Root causes and evidence

### record-id — #1962, #1963, #1964

The conditional recovered-member balance indexes maps by stringified record ID although assembly and recovery use the records themselves. The witnesses use noncanonical or duplicate JSON keys. The missing element key panics at conditioning_accuracy.rs:113.

Exact json_dynamics, json_plastic and json_static witnesses exit 77 in their original fuzz targets. Native stack traces all reach member_balance_3d. Actual public WASM solve_buckling_3d, solve_plastic_3d and certify_linear_3d trap with RuntimeError: unreachable. All three exact fuzz witnesses exit 0 on PR #1957 head 33d5f21c41fd7ae4c366cd82879ff8afee4b99c4. Deletion-minimal equivalents retain 4 nodes and respectively 2/3/3 members, with no loads. They refuse without panic on 6218cd2e9c604e28254e4b751cc5c58b8aae622b and panic at the new balance lookup on its child 4399b29719fddced1194df72f90364933a1aea8f. The historical check is a shared native linear entry point on these minimal equivalents, not a second execution of the original fuzz targets.

### modal-mass-rank — #1965

The physical mass has rank two: only the truss material has density. A quarter-turn plus the linear MPC leaves tiny floating-point mass couplings in the reduced pencil. The finite-spectrum solver produces a spurious third finite eigenvalue; the modal Gram rounding check correctly refuses that unresolvable mode.

The unchanged seeded certified-modal rotation relation fails natively and through the actual public WASM export. The original returns both finite modes. The reduced pencils both have two nonzero singular values at double precision, about 0.0511461 and 0.0388323. Original eigenvalues are 229973.51067756 and 6243695.14223602; the transformed solver also proposes 4.46185047e50. This is safe refusal, not a silent bad modal result. The arbitrary-angle transform is unrepresentable for this spring layout; the representable quarter-turn is the failing copy. The ignored regression requests the same six modes and requires the original finite-mode count.

### rigid-translation-oracle — #1966

The fuzz equilibrium assertion scales a global reaction sum by applied nodal loads and the tiny computed reactions, and adds the free-system residual norm. It omits support-settlement/reaction-recovery rounding. Both supports undergo the same translation and there are no external loads, so the exact engineering solution is rigid translation and zero reactions.

The assertion, not an engine function, panics at engine/fuzz/src/lib.rs:268. Maximum free translation error is about 3.41e-16, within the reported displacement absBound 6.181110124825524e-15. The x reaction sum is 1.8114861441681138e-11, rejected against 2.414946409490597e-17. The two returned x reaction error bounds are 7.374333640316691e-11 and 7.730628117684627e-11; every exact zero reaction is covered. Public WASM certifies normally. Semantic deletion minimization leaves three nodes, three members and two translating supports. The invalid oracle formula was introduced in 0f767873f (2026-10-17) and is unchanged there; no engine panic or engine first-bad commit is claimed.

### opensees-reference — #1967

The reference solve loses accuracy on an unloaded soft cantilever attached to a much stiffer structure. Its free tip must follow its base rigidly because no load acts on that member. OpenSees violates this independent compatibility relation.

The exact main replay retains the differential mismatch, maximum normalized displacement error 3.5674174909451525e-6 against unchanged tolerance 2.540608455216239e-6. For unloaded member 4, node 3 must have u3 = u5 + theta5 cross (x3-x5) and theta3 = theta5. Native largest translation departure is 3.52e-12; OpenSees departs by 9.653006766938144e-5 and invents rx = 7.903001040650027e-7. The base node response agrees closely between solvers. Main already emits high_diagonal_ratio and NUM-INVARIANCE warnings. This witness does not establish a silent wrong engine displacement.

### refusal-contract — #1968

The differential classifier calls any OpenSees solve below its regularity cutoff a false rejection. It does not account for the engine independent node-anisotropy admission limit.

Exact replay refuses at node anisotropy 1.3e8, beyond the unchanged MAX_ANISOTROPY = 1e8. OpenSees reports scaled condition 1.912201308e9, which does not test that independent limit. This is an intentional documented numerical admission refusal, not proof that the engine should accept the model. No tolerance or limit is changed and no acceptance regression is added for this policy refusal.

### truss-action-balance — #1969

The conditional member-balance check clears the elements and keeps only nodal loads in the remainder. A transverse distributed truss load is assembled as equivalent nodal actions, while truss recovered shear is zero. The balance check consequently drops those actions and refuses an equilibrium solution.

The exact model refuses despite scaled condition 1.3e8 and anisotropy 1.5e7, below both admission limits. Replacing its sole transverse truss span load by the statically equivalent nodal forces makes the same main model solve; OpenSees independently solves the original. The public WASM entry point has the same member/nodal distinction. A 3D XZ embedding also solves the nodal control and refuses the member-load copy. No engineering result is returned for the failing copy. Exact 2D and embedded 3D regressions remain ignored.

### reversal-assembly-budget — #1970, #1974, #1978, #1979

The reversal oracle allowance is smaller than the independently certified load-assembly uncertainty of the reversed near-end point load. Reversal evaluates hinge-condensed fixed-end loads near the other endpoint, where subtraction loses digits. The noncertified adapters do not carry the end-to-end assembly bound into this comparison.

All four exact seeded adapter cells reproduce |diff| = 2.214e-16 against unchanged tolerance 3.932e-17. A 90-digit cantilever point-load reference gives tip uz = -0.0000999039056704766879003624773592269218931814407574953547. The original native error is 5.421010862427522e-20; the reversed error is 2.214347412030082e-16. Their independently computed end-to-end displacement bounds are 1.0755882101078782e-15 and 5.439986021166702e-14, respectively, both covering the reference. This is a real floating-point difference, but the finding demands more precision than the certified assembly uncertainty permits; it does not establish a wrong result outside its error bound. No comparison allowance is changed.

### symmetry-construction — #1971, #1972, #1973, #1975, #1976, #1980, #1981, #1982, #1983, #1984, #1985

All eleven cells share the same 2D half model. Reflection at a nonzero pivot rounds the new endpoint; the stored full model is not exactly symmetric. The antisymmetric centre response is then compared to its exact negative with an allowance that does not cover this geometry perturbation and assembly cancellation.

All eleven exact adapter cells pass the symmetric load case and fail the antisymmetric case. The generated coordinates satisfy 2*xcentre-xleft-xright = -1.4210854715202004e-14. A 90-digit independent two-translation beam assembly on those exact binary64 coordinates gives centre uz = -3.5528998947785659603e-12, already beyond the unchanged oracle allowance 3.639e-15. Thus even an exact solver cannot satisfy that assertion on the stored model. Main computes 1.2492192205033671e-11 (some combination/stage paths 1.4551915228e-11), including additional assembly rounding. Constructing exactly opposite spans about zero gives centre uz exactly zero with the same engine. The unchanged relation and witness also fail on the complete November 9 checkout 8f4c3ee6c07c661c090865f7390d10b78162786f. The cluster is not new since November 10; no bisect is needed.

### material-conditioned-recovery — #1977

The yielded whole-member secant material solver recovers reactions on an extremely slender, softened member. Cancellation in global force recovery changes with units. This is the already open numerical-invariance class #762 on a solver explicitly contained by NL-5/#428.

The exact units cell still fails: reaction difference 7.969e-4 > unchanged tolerance 5.704e-4. Direct runs of the actual material solver at all three harness unit scales return converged results with the NL-5 warning #428; no silent-result claim is made. The independent statics of a single point-loaded cantilever fixes the reactions, while recovered reaction rounding changes with the force/length scales. Matching PR #1952 head 9d0d32b6302935c567a7cfc00bdbe9cc0b8b7a90 and PR #1940 head 3e545f4aa5b8d21cd324bebe053abe04432ec1ca both retain the exact failure. Do not mark it fixed by either PR. An ignored exact seeded regression is added; the specific stable recovery refactor remains for the owner.

## History and matching open PRs

The symmetry cluster reproduces, with the same half-model and comparison, on **November 9 main `8f4c3ee6c07c661c090865f7390d10b78162786f`**. It therefore predates November 10. No regression bisect is warranted for that cluster. Different tiny centre values in the issue and replay do not change the intrinsic failure of the exact rounded model.

The record-ID crash first appears at **`4399b29719fddced1194df72f90364933a1aea8f`**: its parent safely refuses the three deletion-minimal models, while the child panics in the added member-balance lookup. Initial use of a shared Cargo target with archived old mtimes reused a stale parent binary; that child observation was discarded. Sources were touched, the engine rebuild was verified, and the child panic was rerun. The JSON contains only the corrected observations.

Only heads with matching areas were built: **#1957** eliminates all three exact fuzz panics; **#1952** (material reaction recovery) and **#1940** (nonlinear convergence) both retain #1977. Their exact SHAs and observations are archived. #1943 staged regularization does not explain an intrinsically invalid symmetry assertion shared with ordinary linear analysis; #1960 performance and #1954 LP budgets do not match these stacks. No combined stack or speculative PR head was tested.

For #1966, the first invalid oracle formula is in **`0f767873f` (2026-10-17)**, not a new engine panic. The exact bytes reproduce a harness assertion on main, and public WASM returns the correctly bounded result. No exact-byte historical engine first-bad claim is made.

## Reproducers and parent proof

[nightly_triage.rs](../../engine/tests/metamorphic/nightly_triage.rs) originally added seven ignored failing tests. After merging main's #1957 fix, the #1962, #1963 and #1964 record-ID crash regressions pass and run as active tests. Four tests remain ignored: the #1965 modal false refusal, exact 2D and embedded 3D #1969 false refusals, and the warned #1977 reaction-units mismatch. Their ignore reasons retain `known wrong result: #N` for reproducer discovery and describe the observed failure. Two active controls retain a canonical-record-key solve and the equivalent nodal truss-action solve; three active oracle guards reject fabricated displacement and modal results.

On the current merged engine, `make test.engine.targeted TEST=metamorphic FILTER=nightly_triage::` gives **8 passed, 4 ignored**. Explicitly selecting the four remaining ignored tests gives **4 failed**, for the reasons above. The [Engine Quick Checks issue-reproducers output](https://github.com/lambdaclass/stabileo/actions/runs/43167315454/job/131012274455) at `20c7e7a1a` selected all seven original tests: #1962–#1964 unexpectedly passed because their ignores outlived the merged fix; #1965, both #1969 paths and #1977 ran and failed as expected. No selector miss was reported. Removing only the three stale ignores makes the expected-failure registration match the current engine behavior.

The original before-fix evidence remains in the JSON: with engine sources equal to parent **`c11af4e36316a0c1251a7175cb4fe16660090778`**, all seven original ignored reproducers failed, including the three record-ID panics subsequently fixed by #1957. The current active/ignored counts above supersede the original run counts. `make check.test-targets` passes.

## Handoff constraints

The implementation is intentionally untouched. No results-change write-up or registry entry is required because no engine result changes in this branch. No advisory is authored. The coordinator should retain #1957 ownership of the crash duplicates, assign physical mass-rank handling and shared truss action accumulation to the engine owners, and assign the oracle defects to verification. The numerical #1977 problem remains warned and unresolved; neither tested nonlinear PR should claim to close it.

Any follow-up fix must preserve the admission and orthogonality limits. Recommended designs are a checked record-ID index shared by every caller (#1957 already implements it), a physical mass-factor/rank representation before finite-spectrum classification, and a single representation of member actions consumed by both assembly and balance. For the harness, carry independent geometry/load-assembly/reaction bounds into comparisons and retain deliberately wrong-output negative tests. No such refactor is implemented here.
