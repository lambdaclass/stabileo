### Fixed
#### A coded refusal no longer hides a containment refusal carried by the same error (2026-11-06)

When an engine error carried both a containment refusal (a known wrong result) and a coded refusal such as "no compressed elements" or "no free degrees of freedom", the app took the coded one and dropped the containment refusal (#1558). Some of those coded refusals are benign answers: the P-Δ comparison read "no compressed elements" as λ₁ = ∞ and B₂ = 1, the advanced toolbar showed it as information, P-Δ with nothing free returned the linear result, and a failed space eigen decomposition was retried with the mechanism held. An error that is a containment refusal is now always shown as one, and is never treated as a coded refusal.
