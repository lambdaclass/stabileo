/-
Member force bounds (CERTIFY.md, "Member force bounds").

Local end forces are affine in the element end displacements, `f = k T u_e − fef`, so the
forces at the exact `u` and at the computed `ũ` differ by `k T (u − ũ)`. Justifies
`engine/src/certify/forces.rs`: component `i` of that difference is at most
`‖row_i k‖₂ · ‖T‖₂ · ‖u − ũ‖₂`.
-/
import Certify.Basic

open Matrix

namespace Certify

variable {m p q : ℕ}

/-- Cauchy–Schwarz per row: `|(B (u − ũ))ᵢ| ≤ ‖row_i B‖ ‖u − ũ‖`. -/
theorem abs_mulVec_sub_le (B : Matrix (Fin m) (Fin q) ℝ) (u ut : Fin q → ℝ) (i : Fin m) :
    |(B *ᵥ (u - ut)) i| ≤ vnorm (B i) * vnorm (u - ut) :=
  abs_dot_le (B i) (u - ut)

/-- **Member force bound.** If `‖row_i k‖ ≤ r`, `‖T x‖ ≤ τ ‖x‖` for all `x` (`τ ≥ 0`) and
`‖u − ũ‖ ≤ b`, then `|((k T)(u − ũ))ᵢ| ≤ r τ b`. -/
theorem force_bound (k : Matrix (Fin m) (Fin p) ℝ) (T : Matrix (Fin p) (Fin q) ℝ)
    (u ut : Fin q → ℝ) (i : Fin m) {r τ b : ℝ} (hr : vnorm (k i) ≤ r) (hτ0 : 0 ≤ τ)
    (hτ : ∀ x, vnorm (T *ᵥ x) ≤ τ * vnorm x) (hb : vnorm (u - ut) ≤ b) :
    |((k * T) *ᵥ (u - ut)) i| ≤ r * τ * b := by
  rw [← Matrix.mulVec_mulVec]
  have h1 := abs_dot_le (k i) (T *ᵥ (u - ut))
  have h2 : vnorm (T *ᵥ (u - ut)) ≤ τ * b :=
    (hτ _).trans (mul_le_mul_of_nonneg_left hb hτ0)
  have hr0 : 0 ≤ r := (vnorm_nonneg _).trans hr
  calc |(k *ᵥ (T *ᵥ (u - ut))) i| ≤ vnorm (k i) * vnorm (T *ᵥ (u - ut)) := h1
    _ ≤ r * (τ * b) := mul_le_mul hr h2 (vnorm_nonneg _) hr0
    _ = r * τ * b := by ring

end Certify
