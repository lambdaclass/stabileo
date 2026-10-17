/-
Scalable certificate: Gram residual + Gershgorin (CERTIFY.md,
"Scalable certificate (Gram residual + Gershgorin)").

For ANY real matrix `L` (in practice a floating-point sparse Cholesky factor of `S − tI`,
possibly row-permuted; nothing about `L` is assumed), write `S = symPart K = L Lᵀ + R`.
Since `xᵀ L Lᵀ x = ‖Lᵀx‖² ≥ 0`, `xᵀ S x ≥ xᵀ R x`, and Gershgorin's row bound on the
symmetric `R` gives `xᵀ R x ≥ μ ‖x‖²`. The checker only needs an entrywise interval
enclosure `IR` of `R`.
-/
import Certify.Main

open Matrix Finset

namespace Certify

open Certify.Interval

variable {n : ℕ}

/-- `xᵀ (L Lᵀ) x = ‖Lᵀ x‖² ≥ 0` for any real `L`. -/
theorem quad_gram_nonneg (L : Matrix (Fin n) (Fin n) ℝ) (x : Fin n → ℝ) :
    0 ≤ x ⬝ᵥ ((L * Lᵀ) *ᵥ x) := by
  rw [← Matrix.mulVec_mulVec, Matrix.dotProduct_mulVec, ← Matrix.mulVec_transpose,
    dotProduct_self_eq]
  exact sumsq_nonneg _

lemma gram_isSymm (L : Matrix (Fin n) (Fin n) ℝ) : (L * Lᵀ).IsSymm := by
  unfold Matrix.IsSymm
  rw [Matrix.transpose_mul, Matrix.transpose_transpose]

/-- Swapping the off-diagonal double sum for a symmetric weight. -/
lemma sum_erase_swap {a : Fin n → Fin n → ℝ} (ha : ∀ i j, a i j = a j i) (x : Fin n → ℝ) :
    ∑ i, ∑ j ∈ univ.erase i, a i j * x j ^ 2 = ∑ i, ∑ j ∈ univ.erase i, a i j * x i ^ 2 := by
  simp only [Finset.sum_erase_eq_sub (Finset.mem_univ _), Finset.sum_sub_distrib]
  congr 1
  rw [Finset.sum_comm]
  refine Finset.sum_congr rfl fun i _ => Finset.sum_congr rfl fun j _ => ?_
  rw [ha]

/-- **Gershgorin quadratic-form bound.** For symmetric `R` with
`μ ≤ Rᵢᵢ − ∑_{j≠i} |Rᵢⱼ|` for every row, `μ ‖x‖² ≤ xᵀ R x`. -/
theorem gershgorin_quad {R : Matrix (Fin n) (Fin n) ℝ} (hR : R.IsSymm) {μ : ℝ}
    (hμ : ∀ i, μ ≤ R i i - ∑ j ∈ univ.erase i, |R i j|) (x : Fin n → ℝ) :
    μ * vnorm x ^ 2 ≤ x ⬝ᵥ (R *ᵥ x) := by
  have hs : ∀ i j, R i j = R j i := fun i j => by
    conv_rhs => rw [← hR]
    rfl
  have hq : x ⬝ᵥ (R *ᵥ x) =
      ∑ i, (R i i * x i ^ 2 + ∑ j ∈ univ.erase i, R i j * x i * x j) := by
    simp only [dotProduct, mulVec, Finset.mul_sum]
    refine Finset.sum_congr rfl fun i _ => ?_
    rw [← Finset.add_sum_erase _ _ (Finset.mem_univ i)]
    congr 1
    · ring
    · exact Finset.sum_congr rfl fun j _ => by ring
  -- termwise: `Rᵢⱼ xᵢ xⱼ ≥ −|Rᵢⱼ| (xᵢ² + xⱼ²)/2`
  have hterm : ∀ i j, -(|R i j| * x i ^ 2 + |R i j| * x j ^ 2) / 2 ≤ R i j * x i * x j := by
    intro i j
    have h1 : |R i j * (x i * x j)| ≤ |R i j| * ((x i ^ 2 + x j ^ 2) / 2) := by
      rw [abs_mul]
      refine mul_le_mul_of_nonneg_left ?_ (abs_nonneg _)
      rw [abs_mul]
      nlinarith [sq_nonneg (|x i| - |x j|), sq_abs (x i), sq_abs (x j)]
    have h2 := neg_abs_le (R i j * (x i * x j))
    nlinarith
  have hoff : ∀ i, R i i * x i ^ 2 - (∑ j ∈ univ.erase i, |R i j| * x i ^ 2 +
      ∑ j ∈ univ.erase i, |R i j| * x j ^ 2) / 2 ≤
      R i i * x i ^ 2 + ∑ j ∈ univ.erase i, R i j * x i * x j := by
    intro i
    have h := Finset.sum_le_sum fun j (_ : j ∈ univ.erase i) => hterm i j
    have e : ∑ j ∈ univ.erase i, -(|R i j| * x i ^ 2 + |R i j| * x j ^ 2) / 2 =
        -(∑ j ∈ univ.erase i, |R i j| * x i ^ 2 + ∑ j ∈ univ.erase i, |R i j| * x j ^ 2) / 2 := by
      rw [← Finset.sum_add_distrib, neg_div, Finset.sum_div, ← Finset.sum_neg_distrib]
      exact Finset.sum_congr rfl fun j _ => by ring
    rw [e] at h
    linarith
  have hswap := sum_erase_swap (a := fun i j => |R i j|) (fun i j => by rw [hs]) x
  have hlow : ∑ i, (R i i - ∑ j ∈ univ.erase i, |R i j|) * x i ^ 2 ≤ x ⬝ᵥ (R *ᵥ x) := by
    rw [hq]
    refine le_trans (le_of_eq ?_) (Finset.sum_le_sum fun i (_ : i ∈ univ) => hoff i)
    simp only [Finset.sum_sub_distrib, ← Finset.sum_div, Finset.sum_add_distrib, sub_mul,
      Finset.sum_mul] at hswap ⊢
    rw [hswap]
    ring
  refine le_trans (le_of_eq ?_) (le_trans (Finset.sum_le_sum fun i _ =>
    mul_le_mul_of_nonneg_right (hμ i) (sq_nonneg (x i))) hlow)
  rw [vnorm_sq, Finset.mul_sum]

/-- Interval Gershgorin: an enclosure `IR` of `R = S − L Lᵀ` and the row test on
`(lo, mag)` give the real Gershgorin hypothesis. -/
lemma gershgorin_of_interval {R : Matrix (Fin n) (Fin n) ℝ}
    (IR : Matrix (Fin n) (Fin n) Interval) (hR : ∀ i j, R i j ∈ᵢ IR i j) {μ : ℝ}
    (hμ : ∀ i, μ ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j)) (i : Fin n) :
    μ ≤ R i i - ∑ j ∈ univ.erase i, |R i j| := by
  have h1 := (hR i i).1
  have h2 : ∑ j ∈ univ.erase i, |R i j| ≤ ∑ j ∈ univ.erase i, mag (IR i j) :=
    Finset.sum_le_sum fun j _ => abs_le_mag (hR i j)
  linarith [hμ i]

/-- Coercivity from the Gram-residual certificate: for any real `L`, if `IR` encloses
`symPart K − L Lᵀ` and passes the interval Gershgorin row test with bound `μ`, then
`μ ‖x‖² ≤ xᵀ K x`. -/
theorem coercive_of_gram (K L : Matrix (Fin n) (Fin n) ℝ)
    (IR : Matrix (Fin n) (Fin n) Interval) (hR : ∀ i j, (symPart K - L * Lᵀ) i j ∈ᵢ IR i j)
    {μ : ℝ} (hμ : ∀ i, μ ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j)) (x : Fin n → ℝ) :
    μ * vnorm x ^ 2 ≤ x ⬝ᵥ (K *ᵥ x) := by
  have hsym : (symPart K - L * Lᵀ).IsSymm := (symPart_isSymm K).sub (gram_isSymm L)
  have hg := gershgorin_quad hsym (gershgorin_of_interval IR hR hμ) x
  have h0 := quad_gram_nonneg L x
  rw [Matrix.sub_mulVec, dotProduct_sub, quad_symPart] at hg
  linarith

/-- **Certificate soundness (Gram residual + Gershgorin).** For any real `L`, if `IR`
encloses `symPart K − L Lᵀ`, the Gershgorin row test gives `μ > 0`, `Ir` encloses the
residual `f − K ũ`, `√(∑ mag(Irᵢ)²) ≤ ρ` and `ρ / μ ≤ b`, then the exact solution
exists, is unique, and lies within `b` of `ũ` in the Euclidean norm. -/
theorem certified_error_bound_gram (K : Matrix (Fin n) (Fin n) ℝ) (f ut : Fin n → ℝ)
    (L : Matrix (Fin n) (Fin n) ℝ)
    (IR : Matrix (Fin n) (Fin n) Interval) (hR : ∀ i j, (symPart K - L * Lᵀ) i j ∈ᵢ IR i j)
    {μ : ℝ} (hμ0 : 0 < μ) (hμ : ∀ i, μ ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j))
    (Ir : Fin n → Interval) (hr : ∀ i, (f - K *ᵥ ut) i ∈ᵢ Ir i)
    {ρ b : ℝ} (hρ : Real.sqrt (∑ i, mag (Ir i) ^ 2) ≤ ρ) (hb : ρ / μ ≤ b) :
    K *ᵥ (K⁻¹ *ᵥ f) = f ∧ (∀ u, K *ᵥ u = f → u = K⁻¹ *ᵥ f) ∧ vnorm (K⁻¹ *ᵥ f - ut) ≤ b := by
  obtain ⟨hsol, huniq, hbound⟩ := coercive_solution hμ0 (coercive_of_gram K L IR hR hμ) f ut
  refine ⟨hsol, huniq, hbound.trans ((div_le_div_of_nonneg_right ?_ hμ0.le).trans hb)⟩
  exact (vnorm_le_of_mem hr).trans hρ

end Certify
