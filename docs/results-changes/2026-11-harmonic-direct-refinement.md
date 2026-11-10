# Harmonic direct solves preserve accuracy on coupled systems (2026-11-10)

Issue #1539. PR #1922. Results-change entry `harmonic-direct-refinement`.

After merging main, the #1539 harmonic cantilever regression passed its reciprocity
checks but failed the comparison between two direct solves at zero frequency.
The model has six free DOFs, so this failure exercises dense block LU, not the new
above-ceiling sparse path. Column normalization introduced by this unmerged PR
rounded the matrix coefficients before elimination. Ill-conditioning amplifies
that rounding. The damping model and physical assembly are unchanged.

For the checked-in `engine/tests/metamorphic_corpus/nightly/issue-1539.json`, a unit
Fz at node 2 produced ux = -0.00013347953413025163 from the scaled dense LU and
-0.00013347953550669998 from the test's floating-point Gauss-Jordan reference at
zero frequency. An independent 80-digit decimal elimination of the exact binary
assembled coefficients gives
-0.00013347953396253733195317921684700143964444474766620700408247474230861175353409069.
The refined low-level dense result is -1.33479533962537340e-4, matching that
reference when rounded to f64. The public 3D solve uses the symmetric sparse
assembly, whose coefficients differ from the raw dense assembly by roundoff.
For its actual matrix, the public result is -1.33479532665594020e-4 and the
independent 80-digit reference is
-0.00013347953266559402265304004188503884443951689763756677372996174439793790831738244.
The two public values also agree when rounded to f64. The existing public/dense
assembly comparison tolerance is retained.

Thus the old floating-point reference also loses accuracy. The regression now uses
exact fraction-free integer elimination with rational back substitution on those
binary coefficients. Every integer division is checked for a zero remainder. Both original
assertions remain: direct solves must agree within 1e-9 of the response scale and
the public response within 1e-6. All reciprocity and superposition checks remain. The #1371 C2-symmetric frame
regression uses the same improved reference: its former floating-point oracle
returned 4.171706870426312e-9 for a symmetry-zero component at zero frequency,
while the refined dense solve returns 4.009410737403032e-11. Its original direct
comparison and symmetry assertions are also retained.

A separate closed form reproduces the production defect on both implementations:
K = [[s+1, s], [s, s+1]], M = I, F = [1, 0], omega = 0, s = 1e7.
The exact solution is [(s+1)/(2s+1), -s/(2s+1)]. Before the fix both paths return
[0.5000000252032409, -0.4999999752032434], versus the closed form rounded to
[0.5000000249999987, -0.49999997500000126], failing the 1e-10 relative assertion.
These are synthetic numerical data, not recommended engineering inputs.

Both direct paths now round each column scale upward to a power of two, avoiding
rounding from division by arbitrary normalization constants. The scale still
includes the stiffness, inertia and damping contributions before cancellation,
is floored at one, and retains the existing pivot cutoff. Rounding upward can
only make that cutoff more conservative. A non-finite scale refuses the solve.
Two refinement steps use compensated residuals, including fused-multiply-add
product remainders, evaluated against the unscaled dynamic matrix. Each correction
reuses the same factors; non-finite corrections or final responses refuse. Generic
LU callers outside harmonic analysis are unchanged.

The sparse factorization retains its lower factors for correction solves. Its
existing storage budget charges these entries, so additional factor storage can
refuse rather than grow without a bound. Forward and backward substitution visit
stored factor entries; refinement adds no dense allocation. Sparse assembly and
residual evaluation merge the sorted stiffness and mass columns and use the same
real and imaginary block coefficients.

The #1434 ledger row was already CORRECTED, but the active registry still listed
HARM-TRUNCATION. The registry entry and obsolete predicate listing are retired.
The private modal intermediate no longer constructs this retired diagnostic;
the existing replacement/refusal policy resolves every unbounded frequency before
returning a public result. MD-ORTHOGONALITY and other active diagnostics remain.

**What to re-check:** harmonic real and imaginary responses, amplitudes, phases and
sampled peaks from this PR's earlier direct implementation, especially for strongly
coupled ill-conditioned systems. Both closed-form regressions and the exact rational
cantilever comparisons pass with the original tolerances. The retained wrong-result
checks for harmonic seeds 2026110200030 (2D), 2026110200045 (3D),
2026110200167 (2D) and 2026110200176 (2D) now require explicit refusal of the
previously failing cells; zero passes or an empty failure list alone cannot satisfy
them. A diagnostic replay of pushed commit 74aabdfd2 confirms these four refusals
already existed there; the post-merge expected-failure table had not followed that
change. The retained PCG failure and the other harmonic/time-history failures remain
required. Structural-scale undamped
resonance remains refused. This scaling defect was introduced on the unmerged branch;
this change assigns no advisory. The previously documented main omitted-mode issue
and existing SA-2026-058 remain separate.
