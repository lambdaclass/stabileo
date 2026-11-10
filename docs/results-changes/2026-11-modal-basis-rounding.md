# Modal bases use the rounding scale of each mass Gram entry

## Modal bases use the rounding scale of each mass Gram entry

PR #1890 tightened the mass-orthogonality check to a derived basis-accuracy
bound, including repeated frequencies. Its initial rounding allowance used the
global energy-scaled mass norm. That can be much larger than the rounding scale
of an individual Gram entry and can reach the unchanged refusal limit even
when the basis is exactly orthogonal.

For the checked regression K = I, M = diag(1, 1e12), unit energy scales and
mass-normalized modes (1, 0), (0, 1e-6), the old allowance for the first diagonal
entry reaches the refusal limit. The measured Gram error is zero. Both mode
orders now pass. K and M are distinct, so scaling by the stiffness cannot hide
the contrast.

For mass-normalized columns P_i and P_j, the arithmetic allowance is now

    gamma_(n+4) sum_l |P_li (M P_j)_l|
      + (gamma_(r+1) + gamma_(n+4)) |P_i|^T |M| |P_j|,

with gamma_q = q epsilon / (1 - q epsilon), solve dimension n and largest mass
row nonzero count r. The basis term 2 tau + tau squared is unchanged, with tau
from the eigensolver default. Absolute values precede the mass multiplication;
using |M P_j| would miss cancellation. Both 2D mass representations and the 3D
sparse mass path supply this product in solve coordinates. No matrix is
densified. One additional mass product is needed per mode.

Each entry still refuses if its error reaches its derived bound, or if the
bound is non-finite or reaches the existing refusal limit. The cumulative Gram
Frobenius measurement is unchanged. The cancellation control uses the positive
definite matrix with diagonal 1e12 and off-diagonal 1 - 1e12: its mode (1, 1)
has M phi = (1, 1), yet its absolute product remains large enough to refuse.
Duplicate modes and mixed repeated modes remain refused.

## CI regression and observable changes

The release metamorphic shard originally failed
`nightly_tolerances::eigen_based_rows_account_for_spread_and_gaps` at the #1267
modal symmetry comparison. The harness requests the full spectrum to estimate
the pencil spread. The global allowance refused that larger request, although
the six-mode response solve completed. The missing spectrum left the harness
without its eigenvalue-spread estimate, causing the comparison failure.

The new focused public-solver reproducer requests that full spectrum from the
symmetrized #1267 case. It fails with the old rounding-bound refusal and passes
with this correction. The original nightly test retains every assertion and
tolerance; its expected inconclusive comparisons are restored.

| Input or output | Before this correction | After |
|---|---|---|
| Exact diagonal contrast regression | False rounding-bound refusal | Two modes accepted, zero Gram error |
| Symmetrized #1267 full spectrum | False rounding-bound refusal | Spectrum available for conditioning |
| Arithmetic uncertainty above the refusal limit | Refused | Refused |
| Duplicate or inaccurate modal basis | Refused | Refused |
| Accepted modal diagnostic thresholds | Global rounding scale | Per-entry rounding scale |

The eigensolver, eigenvectors, frequencies and participation calculations are
unchanged. Calls previously refused can now return results. The registry entry
`modal-basis-entrywise-rounding` flags modal and spectral analyses, including
seismic workflows that request modes. It declares solve availability and
structured diagnostic changes. The #759 containment row is CORRECTED, matching
the earlier shipped eigensolver fixes and the new guard regressions.

This correction is local and has not been released or deployed. No wrong
numerical result returned to a public caller was reproduced in this round:
the defect withheld valid results. No new safety advisory is added. Historical
#759 mode-completeness changes remain documented in
[the earlier results change](2026-10-modal-completeness.md).
