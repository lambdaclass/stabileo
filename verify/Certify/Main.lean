/-
End-to-end soundness of the linear-static certificate (CERTIFY.md).

The checker's hypotheses, as `engine/src/certify/linear.rs` establishes them:
* `IM` encloses `S − σI` entrywise, where `S = (K + Kᵀ)/2`;
* interval Cholesky on `IM` has every pivot (and its square root) with positive lower bound;
* `Ir` encloses the residual `f − K ũ` entrywise;
* `ρ` is an upper bound of `√(∑ mag(Irᵢ)²)` and `b` an upper bound of `ρ / σ`.

Conclusion: `K` is invertible and the exact solution `u* = K⁻¹ f` satisfies `‖u* − ũ‖₂ ≤ b`.
-/
import Certify.Cholesky

open Matrix Finset

namespace Certify

open Certify.Interval

variable {n : ℕ}

lemma shift_isSymm (K : Matrix (Fin n) (Fin n) ℝ) (σ : ℝ) : (symPart K - σ • 1).IsSymm := by
  ext i j
  simp only [Matrix.transpose_apply, Matrix.sub_apply, Matrix.smul_apply, symPart_apply]
  rw [Matrix.one_apply, Matrix.one_apply]
  by_cases h : i = j
  · subst h; rfl
  · simp [h, Ne.symm h]; ring

/-- An interval enclosure of the residual bounds its norm by `√(∑ mag²)`. -/
lemma vnorm_le_of_mem {x : Fin n → ℝ} {I : Fin n → Interval} (hx : ∀ i, x i ∈ᵢ I i) :
    vnorm x ≤ Real.sqrt (∑ i, mag (I i) ^ 2) :=
  Real.sqrt_le_sqrt (Finset.sum_le_sum fun i _ => sq_le_mag_sq (hx i))

/-- **Certificate soundness.** If the checker accepts, the exact solution exists, is
unique, and lies within `b` of the computed `ũ` in the Euclidean norm. -/
theorem certified_error_bound (r : Rounding) (K : Matrix (Fin n) (Fin n) ℝ) (f ut : Fin n → ℝ)
    {σ : ℝ} (hσ : 0 < σ)
    (IM : Matrix (Fin n) (Fin n) Interval) (hM : ∀ i j, (symPart K - σ • 1) i j ∈ᵢ IM i j)
    (hp : IntervalPivotsPos r (extend (Interval.point 0) IM) n)
    (Ir : Fin n → Interval) (hr : ∀ i, (f - K *ᵥ ut) i ∈ᵢ Ir i)
    {ρ b : ℝ} (hρ : Real.sqrt (∑ i, mag (Ir i) ^ 2) ≤ ρ) (hb : ρ / σ ≤ b) :
    K *ᵥ (K⁻¹ *ᵥ f) = f ∧ (∀ u, K *ᵥ u = f → u = K⁻¹ *ᵥ f) ∧ vnorm (K⁻¹ *ᵥ f - ut) ≤ b := by
  have hpd := posDef_of_interval_cholesky r _ IM (shift_isSymm K σ) hM hp
  obtain ⟨hsol, huniq, hbound⟩ := coercive_solution hσ (coercive_of_posDef hpd) f ut
  refine ⟨hsol, huniq, hbound.trans ((div_le_div_of_nonneg_right ?_ hσ.le).trans hb)⟩
  exact (vnorm_le_of_mem hr).trans hρ

end Certify
