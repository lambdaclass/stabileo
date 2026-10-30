# Buckling certificate consistency (2026-10-29)

## Buckling factors outside their enclosure are refused

Issue #741; PR **#817**; results version **6**.

The minimized `json_dynamics` input has three 3D frame members and 15 free DOFs.
The raw factor is **4691.397553909858**. Before this change it was certified with
lower bound **4644.4835783707595** and upper bound **4688.92209616787**, despite
exceeding the upper bound by **2.475457741988** (about **0.0528%**).
After the change the raw factor is unchanged, but the certificate is **uncertified**,
with the computed factor and upper bound in its refusal reason.

An independent dense eigenvalue bisection, using exact rational Schur/LDL pivots on
the f64 assembled pencil, brackets the true first loss of positive definiteness in
**[4688.920342922211, 4688.920354843140]**. Exact rational checks also confirm positive
definiteness at the old lower bound and its loss at the old upper bound. Thus the
old enclosure is sound for this assembled pencil; it is the reported factor that
is inaccurate. This reference does not certify mesh error or the computed prestress.

The small-system solver obtains the reciprocal eigenvalue from dense Cholesky
reduction and Jacobi diagonalization of `N phi = mu K phi`. Here its spectrum spans
approximately **-8.4745030415e9** to **2.1315609869e-4**: the critical positive
eigenvalue is tiny relative to the negative spectrum. Floating-point reduction and
diagonalization lose relative accuracy in that small positive eigenvalue, which is
then inverted for the reported factor. The checker independently bounds the critical
factor using stability and an interval Rayleigh quotient, but previously never
compared the reported factor with that upper bound before returning `Certified`.
The lower-bound search already constructs a value below the reported factor.

The fix adds the missing strict upper-bound check in the shared checker. It refuses
even a round-off-sized violation, preserving both bound computations and the
existing lower-only certificate when no upper bound can be established. No tolerance
or widening conceals an inconsistent estimate. The solver's numerical refinement is
outside this minimal certificate fix.

The regression records the original two option bytes and minimized JSON, verifies
the enclosure against exact arithmetic, and checks reported-factor containment (or
the explicit refusal). Deterministically generated 2D and 3D models exercise the
invariant in 64 pairs normally and 4096 pairs in the ignored extended test.
Both runs report solver errors by dimension and reason, require every generated
2D column to certify, and require at least one eighth of the generated 3D cases
to reach certification, including both certified and refused outcomes.

## Regression evidence and validation

Before changing production code,
`cargo test --locked --test robustness buckling_741 -- --nocapture` failed:

```text
reported 4691.397553909858 outside [4644.4835783707595, 4688.92209616787]
test fuzz_regressions::buckling_741_certificate_contains_reported_and_reference_factors ... FAILED
```

The same test passes after the fix and prints the explicit upper-bound refusal.
The independent eigenvalue bracket and exact checks at both original bounds run
on the fixed code as well. The reference also checks that `K` is positive definite
in exact arithmetic before bisecting the first loss of stability.

Validation uses Nix.
The affected library/certificates/robustness targets passed (572/149/231 tests;
8 existing certificate tests and the extended generated test ignored in that run).
The strengthened buckling unit tests then passed all 4 tests. The final generated
runs passed at 64 and 4096 pairs, including the ignored extended test; the latter
produced 4096 certified 2D cases, 430 certified 3D cases and 381 uncertified results.
The remaining 3285 3D cases returned “No compressed elements — buckling not
applicable”; no 2D cases returned solver errors. The 64-pair run produced
64 certified 2D cases, 7 certified and 5 uncertified 3D cases, and 52 3D cases
with the same solver error.
The final exact-arithmetic regression passed separately.

Release validation passed all 4763 tests. `make wasm` succeeded;
`make test.web.results` passed all 41 tests with no changed result snapshots, so
none were regenerated. `make check.results-snapshot-gate` and
`make check.changelog` passed. The project fixture's results stamp moved from 4 to
5, with only its two pinned content hashes updated; the model and CAD goldens are
unchanged. The TypeScript gate reports the existing 247 baseline errors and no new
errors; the Svelte gate reports no errors in guarded paths.

The final `npx vitest run --project unit` passed 15742 tests, with 14 skipped
(1263 files passed, 2 skipped). Its first run exposed an empty-model applicability
notice and an obsolete assertion that version 4 was current; both were corrected,
with explicit applicability coverage, before this full passing rerun.
