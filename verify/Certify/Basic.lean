/-
Coercivity error bound (CERTIFY.md, "Theorem (coercivity error bound)").

Vectors are `Fin n → ℝ`, matrices `Matrix (Fin n) (Fin n) ℝ`, and `vnorm` is the
Euclidean norm written out as `√(∑ xᵢ²)` (shown equal to the `EuclideanSpace` norm).
-/
import Mathlib

open Matrix Finset

namespace Certify

variable {n : ℕ}

/-- Euclidean norm `‖x‖₂ = √(∑ᵢ xᵢ²)`. -/
noncomputable def vnorm (x : Fin n → ℝ) : ℝ := Real.sqrt (∑ i, x i ^ 2)

lemma vnorm_nonneg (x : Fin n → ℝ) : 0 ≤ vnorm x := Real.sqrt_nonneg _

lemma sumsq_nonneg (x : Fin n → ℝ) : 0 ≤ ∑ i, x i ^ 2 :=
  Finset.sum_nonneg fun i _ => sq_nonneg (x i)

lemma vnorm_sq (x : Fin n → ℝ) : vnorm x ^ 2 = ∑ i, x i ^ 2 :=
  Real.sq_sqrt (sumsq_nonneg x)

lemma dotProduct_self_eq (x : Fin n → ℝ) : x ⬝ᵥ x = ∑ i, x i ^ 2 := by
  simp [dotProduct, sq]

lemma vnorm_sq_eq_dot (x : Fin n → ℝ) : vnorm x ^ 2 = x ⬝ᵥ x := by
  rw [vnorm_sq, dotProduct_self_eq]

/-- `vnorm` is the norm of `EuclideanSpace ℝ (Fin n)`. -/
lemma vnorm_eq_euclidean (x : Fin n → ℝ) : vnorm x = ‖(WithLp.toLp 2 x : EuclideanSpace ℝ (Fin n))‖ := by
  rw [EuclideanSpace.norm_eq]
  simp [vnorm, Real.norm_eq_abs, sq_abs]

lemma vnorm_eq_zero {x : Fin n → ℝ} : vnorm x = 0 ↔ x = 0 := by
  constructor
  · intro h
    have hs : ∑ i, x i ^ 2 = 0 := by
      have := vnorm_sq x
      rw [h] at this
      linarith
    rw [Finset.sum_eq_zero_iff_of_nonneg (fun i _ => sq_nonneg (x i))] at hs
    funext i
    exact pow_eq_zero_iff (n := 2) (by norm_num) |>.mp (hs i (Finset.mem_univ i))
  · rintro rfl
    simp [vnorm]

/-- Cauchy–Schwarz for the explicit norm. -/
lemma abs_dot_le (x y : Fin n → ℝ) : |x ⬝ᵥ y| ≤ vnorm x * vnorm y := by
  have h := Finset.sum_mul_sq_le_sq_mul_sq (Finset.univ) x y
  rw [vnorm, vnorm, ← Real.sqrt_mul (sumsq_nonneg x)]
  exact Real.abs_le_sqrt (by simpa [dotProduct] using h)

/-! ### (1) Coercivity -/

/-- If `σ‖x‖² ≤ xᵀKx` for all `x`, then `σ‖x‖ ≤ ‖Kx‖` for all `x`. -/
theorem coercive_norm_le {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ}
    (h : ∀ x, σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x)) (x : Fin n → ℝ) :
    σ * vnorm x ≤ vnorm (K *ᵥ x) := by
  have h1 : σ * vnorm x ^ 2 ≤ vnorm x * vnorm (K *ᵥ x) :=
    (h x).trans ((le_abs_self _).trans (abs_dot_le x (K *ᵥ x)))
  rcases (vnorm_nonneg x).eq_or_lt with h0 | hpos
  · rw [← h0, mul_zero]; exact vnorm_nonneg _
  · have : (σ * vnorm x) * vnorm x ≤ vnorm (K *ᵥ x) * vnorm x := by nlinarith
    exact le_of_mul_le_mul_right this hpos

/-- A coercive matrix (σ > 0) has nonzero determinant. -/
theorem coercive_det_ne_zero {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ} (hσ : 0 < σ)
    (h : ∀ x, σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x)) : K.det ≠ 0 := by
  intro hdet
  obtain ⟨v, hv, hKv⟩ := Matrix.exists_mulVec_eq_zero_iff.mpr hdet
  have := coercive_norm_le h v
  rw [hKv, show vnorm (0 : Fin n → ℝ) = 0 from vnorm_eq_zero.mpr rfl] at this
  have hz : vnorm v = 0 := le_antisymm (by nlinarith [vnorm_nonneg v]) (vnorm_nonneg v)
  exact hv (vnorm_eq_zero.mp hz)

theorem coercive_isUnit {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ} (hσ : 0 < σ)
    (h : ∀ x, σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x)) : IsUnit K :=
  (Matrix.isUnit_iff_isUnit_det K).mpr (isUnit_iff_ne_zero.mpr (coercive_det_ne_zero hσ h))

/-- Error bound: for any `u` with `K u = f` and any approximation `ũ`,
`‖u − ũ‖ ≤ ‖f − K ũ‖ / σ`. -/
theorem error_bound {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ} (hσ : 0 < σ)
    (h : ∀ x, σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x)) {u f : Fin n → ℝ} (hu : K *ᵥ u = f)
    (ut : Fin n → ℝ) : vnorm (u - ut) ≤ vnorm (f - K *ᵥ ut) / σ := by
  have := coercive_norm_le h (u - ut)
  rw [Matrix.mulVec_sub, hu] at this
  rw [le_div_iff₀ hσ, mul_comm]
  exact this

/-- The exact solution `K⁻¹ f` exists, is unique, and satisfies the error bound. -/
theorem coercive_solution {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ} (hσ : 0 < σ)
    (h : ∀ x, σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x)) (f ut : Fin n → ℝ) :
    K *ᵥ (K⁻¹ *ᵥ f) = f ∧ (∀ u, K *ᵥ u = f → u = K⁻¹ *ᵥ f) ∧
      vnorm (K⁻¹ *ᵥ f - ut) ≤ vnorm (f - K *ᵥ ut) / σ := by
  have hdet : IsUnit K.det := isUnit_iff_ne_zero.mpr (coercive_det_ne_zero hσ h)
  have hsol : K *ᵥ (K⁻¹ *ᵥ f) = f := by
    rw [Matrix.mulVec_mulVec, Matrix.mul_nonsing_inv _ hdet, Matrix.one_mulVec]
  refine ⟨hsol, fun u hu => ?_, error_bound hσ h hsol ut⟩
  rw [← hu, Matrix.mulVec_mulVec, Matrix.nonsing_inv_mul _ hdet, Matrix.one_mulVec]

/-! ### (2) Symmetric part -/

/-- `S = (K + Kᵀ)/2`. -/
noncomputable def symPart (K : Matrix (Fin n) (Fin n) ℝ) : Matrix (Fin n) (Fin n) ℝ :=
  (1 / 2 : ℝ) • (K + Kᵀ)

lemma symPart_apply (K : Matrix (Fin n) (Fin n) ℝ) (i j : Fin n) :
    symPart K i j = (K i j + K j i) / 2 := by
  simp [symPart]; ring

lemma symPart_isSymm (K : Matrix (Fin n) (Fin n) ℝ) : (symPart K).IsSymm := by
  ext i j; simp [symPart_apply]; ring

lemma quad_transpose (K : Matrix (Fin n) (Fin n) ℝ) (x : Fin n → ℝ) :
    x ⬝ᵥ (Kᵀ *ᵥ x) = x ⬝ᵥ (K *ᵥ x) := by
  rw [Matrix.mulVec_transpose, dotProduct_comm, ← Matrix.dotProduct_mulVec]

/-- `xᵀKx = xᵀSx`. -/
theorem quad_symPart (K : Matrix (Fin n) (Fin n) ℝ) (x : Fin n → ℝ) :
    x ⬝ᵥ (symPart K *ᵥ x) = x ⬝ᵥ (K *ᵥ x) := by
  rw [symPart, Matrix.smul_mulVec, Matrix.add_mulVec, dotProduct_smul, dotProduct_add,
    quad_transpose]
  simp; ring

lemma quad_shift (S : Matrix (Fin n) (Fin n) ℝ) (σ : ℝ) (x : Fin n → ℝ) :
    x ⬝ᵥ ((S - σ • (1 : Matrix (Fin n) (Fin n) ℝ)) *ᵥ x) = x ⬝ᵥ (S *ᵥ x) - σ * vnorm x ^ 2 := by
  rw [Matrix.sub_mulVec, dotProduct_sub, Matrix.smul_mulVec, Matrix.one_mulVec, dotProduct_smul,
    vnorm_sq_eq_dot]
  simp

/-- If `xᵀ(S − σI)x ≥ 0` for all `x` then `σ‖x‖² ≤ xᵀKx` for all `x`. -/
theorem coercive_of_shift_nonneg {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ}
    (h : ∀ x : Fin n → ℝ, 0 ≤ x ⬝ᵥ ((symPart K - σ • 1) *ᵥ x)) (x : Fin n → ℝ) :
    σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x) := by
  have := h x
  rw [quad_shift, quad_symPart] at this
  linarith

/-- `(S − σI) ⪰ 0` (Mathlib `PosSemidef`) gives the coercivity hypothesis. -/
theorem coercive_of_posSemidef {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ}
    (h : (symPart K - σ • 1).PosSemidef) (x : Fin n → ℝ) :
    σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x) :=
  coercive_of_shift_nonneg (fun x => by simpa using h.dotProduct_mulVec_nonneg x) x

theorem coercive_of_posDef {K : Matrix (Fin n) (Fin n) ℝ} {σ : ℝ}
    (h : (symPart K - σ • 1).PosDef) (x : Fin n → ℝ) :
    σ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x) :=
  coercive_of_posSemidef h.posSemidef x

end Certify
