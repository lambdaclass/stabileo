/-
End-to-end certificates (CERTIFY.md, "End-to-end certificates").

The re-assembly (`engine/src/certify/reassembly/`) writes the model's displacements as
`u = C q + p`: `q` the free parameters (free DOFs, tangential motion at inclined
supports, constraint masters), `p` the prescribed values (settlements). The model's exact
solution is the `q*` with `Cᵀ K (C q* + p) = Cᵀ f`: virtual work over every admissible
variation `C v` (`virtual_work`). With `A = Cᵀ K C` and `b = Cᵀ (f − K p)` that is
`A q* = b`.

The checker establishes, for enclosures of the exact model `K`, `f`, `C`, `p` (interval
inclusion, `Certify.Interval.mem_*`):
* the Gram residual `symPart A − L Lᵀ` lies in `IR`, which passes the Gershgorin row
  test with `μ > 0` (`Certify.coercive_of_gram`);
* `Ir` encloses the reduced residual `Cᵀ(f − K(C q̃ + p))`, `ρ ≥ √(∑ mag(Irᵢ)²)`;
* every row of `|CᵀC|` sums to at most `g` (so `‖C x‖ ≤ √g ‖x‖`);
* `δ ≥ ‖C q̃ + p − ũ‖`.

Conclusion (`end_to_end_bound`): `q*` exists and is unique, and the model's exact
displacements `u* = C q* + p` satisfy `‖u* − ũ‖₂ ≤ √g · ρ/μ + δ`.

Not formalized: that the interval formulas of the re-assembly enclose the model's
mechanics (the element formulas themselves; trusted, see TRUSTED_BASE.md), and the
exclusion of DOFs nothing stiffens (columns of `C` whose rows of `K` are structurally
zero, removed before this theorem applies).
-/
import Certify.Gram

open Matrix Finset

namespace Certify

open Certify.Interval

variable {n m : ℕ}

/-- Triangle inequality for `vnorm`. -/
lemma vnorm_add_le (x y : Fin n → ℝ) : vnorm (x + y) ≤ vnorm x + vnorm y := by
  rw [vnorm_eq_euclidean, vnorm_eq_euclidean, vnorm_eq_euclidean, WithLp.toLp_add]
  exact norm_add_le _ _

/-- `xᵀ (Cᵀ C) x = ‖C x‖²`. -/
lemma quad_transpose_mul_self (C : Matrix (Fin n) (Fin m) ℝ) (x : Fin m → ℝ) :
    x ⬝ᵥ ((Cᵀ * C) *ᵥ x) = vnorm (C *ᵥ x) ^ 2 := by
  rw [← Matrix.mulVec_mulVec, Matrix.dotProduct_mulVec, Matrix.vecMul_transpose,
    vnorm_sq_eq_dot]

lemma transpose_mul_self_isSymm (C : Matrix (Fin n) (Fin m) ℝ) : (Cᵀ * C).IsSymm := by
  unfold Matrix.IsSymm
  rw [Matrix.transpose_mul, Matrix.transpose_transpose]

/-- **Norm of the kinematic map.** If every row of `|CᵀC|` sums to at most `g`, then
`‖C x‖₂ ≤ √g ‖x‖₂` (Gershgorin on `g I − CᵀC`). -/
theorem vnorm_mulVec_le_of_rows (C : Matrix (Fin n) (Fin m) ℝ) {g : ℝ}
    (hg : ∀ a, ∑ b, |(Cᵀ * C) a b| ≤ g) (x : Fin m → ℝ) :
    vnorm (C *ᵥ x) ≤ Real.sqrt g * vnorm x := by
  set M := Cᵀ * C
  have hM : M.IsSymm := transpose_mul_self_isSymm C
  have hR : (g • (1 : Matrix (Fin m) (Fin m) ℝ) - M).IsSymm := by
    unfold Matrix.IsSymm
    rw [Matrix.transpose_sub, Matrix.transpose_smul, Matrix.transpose_one, hM]
  have hrow : ∀ a, (0 : ℝ) ≤ (g • (1 : Matrix (Fin m) (Fin m) ℝ) - M) a a -
      ∑ b ∈ univ.erase a, |(g • (1 : Matrix (Fin m) (Fin m) ℝ) - M) a b| := by
    intro a
    have hoff : ∀ b ∈ univ.erase a, |(g • (1 : Matrix (Fin m) (Fin m) ℝ) - M) a b| = |M a b| := by
      intro b hb
      have hne : a ≠ b := fun h => (Finset.mem_erase.mp hb).1 (h ▸ rfl)
      simp [Matrix.sub_apply, Matrix.smul_apply, Matrix.one_apply_ne hne]
    rw [Finset.sum_congr rfl hoff]
    have hsplit := Finset.add_sum_erase univ (fun b => |M a b|) (Finset.mem_univ a)
    have hdiag : (g • (1 : Matrix (Fin m) (Fin m) ℝ) - M) a a = g - M a a := by
      simp [Matrix.sub_apply, Matrix.smul_apply]
    rw [hdiag]
    have := hg a
    have habs := le_abs_self (M a a)
    linarith
  have hq := gershgorin_quad hR hrow x
  rw [Matrix.sub_mulVec, dotProduct_sub, Matrix.smul_mulVec, Matrix.one_mulVec,
    dotProduct_smul, smul_eq_mul, quad_transpose_mul_self, ← vnorm_sq_eq_dot] at hq
  have h2 : vnorm (C *ᵥ x) ^ 2 ≤ g * vnorm x ^ 2 := by linarith
  calc vnorm (C *ᵥ x) = Real.sqrt (vnorm (C *ᵥ x) ^ 2) := (Real.sqrt_sq (vnorm_nonneg _)).symm
    _ ≤ Real.sqrt (g * vnorm x ^ 2) := Real.sqrt_le_sqrt h2
    _ = Real.sqrt g * vnorm x := by
      rw [Real.sqrt_mul' _ (sq_nonneg _), Real.sqrt_sq (vnorm_nonneg _)]

/-- `(C v) · r = v · (Cᵀ r)`. -/
lemma dot_mulVec_eq (C : Matrix (Fin n) (Fin m) ℝ) (v : Fin m → ℝ) (r : Fin n → ℝ) :
    (C *ᵥ v) ⬝ᵥ r = v ⬝ᵥ (Cᵀ *ᵥ r) := by
  rw [Matrix.dotProduct_mulVec, Matrix.vecMul_transpose]

/-- The reduced equations are virtual work: `A q = b` iff the out-of-balance force
`f − K (C q + p)` does no work on any admissible variation `C v`. -/
theorem virtual_work (K : Matrix (Fin n) (Fin n) ℝ) (C : Matrix (Fin n) (Fin m) ℝ)
    (f p : Fin n → ℝ) (q : Fin m → ℝ) :
    (Cᵀ * K * C) *ᵥ q = Cᵀ *ᵥ (f - K *ᵥ p) ↔
      ∀ v : Fin m → ℝ, (C *ᵥ v) ⬝ᵥ (f - K *ᵥ (C *ᵥ q + p)) = 0 := by
  have e : Cᵀ *ᵥ (f - K *ᵥ p) - (Cᵀ * K * C) *ᵥ q = Cᵀ *ᵥ (f - K *ᵥ (C *ᵥ q + p)) := by
    simp only [Matrix.mulVec_sub, Matrix.mulVec_add, ← Matrix.mulVec_mulVec]
    abel
  have hiff : (Cᵀ * K * C) *ᵥ q = Cᵀ *ᵥ (f - K *ᵥ p) ↔ Cᵀ *ᵥ (f - K *ᵥ (C *ᵥ q + p)) = 0 := by
    rw [← e, sub_eq_zero, eq_comm]
  rw [hiff]
  constructor
  · intro h v
    rw [dot_mulVec_eq, h, dotProduct_zero]
  · intro h
    funext i
    have := h (Pi.single i 1)
    rw [dot_mulVec_eq] at this
    simpa using this

/-- **End-to-end soundness.** If the checker accepts (hypotheses as in the module
docstring), the model has a unique solution `q* = A⁻¹ b` and its displacements
`C q* + p` lie within `√g · ρ/μ + δ` of the computed `ũ` in the Euclidean norm. -/
theorem end_to_end_bound (K : Matrix (Fin n) (Fin n) ℝ) (C : Matrix (Fin n) (Fin m) ℝ)
    (f p ut : Fin n → ℝ) (qt : Fin m → ℝ) (L : Matrix (Fin m) (Fin m) ℝ)
    (IR : Matrix (Fin m) (Fin m) Interval)
    (hR : ∀ i j, (symPart (Cᵀ * K * C) - L * Lᵀ) i j ∈ᵢ IR i j)
    {μ : ℝ} (hμ0 : 0 < μ) (hμ : ∀ i, μ ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j))
    (Ir : Fin m → Interval) (hr : ∀ i, (Cᵀ *ᵥ (f - K *ᵥ (C *ᵥ qt + p))) i ∈ᵢ Ir i)
    {ρ g δ : ℝ} (hρ : Real.sqrt (∑ i, mag (Ir i) ^ 2) ≤ ρ)
    (hg : ∀ a, ∑ b, |(Cᵀ * C) a b| ≤ g) (hδ : vnorm (C *ᵥ qt + p - ut) ≤ δ) :
    (Cᵀ * K * C) *ᵥ ((Cᵀ * K * C)⁻¹ *ᵥ (Cᵀ *ᵥ (f - K *ᵥ p))) = Cᵀ *ᵥ (f - K *ᵥ p) ∧
      (∀ q, (Cᵀ * K * C) *ᵥ q = Cᵀ *ᵥ (f - K *ᵥ p) →
        q = (Cᵀ * K * C)⁻¹ *ᵥ (Cᵀ *ᵥ (f - K *ᵥ p))) ∧
      vnorm (C *ᵥ ((Cᵀ * K * C)⁻¹ *ᵥ (Cᵀ *ᵥ (f - K *ᵥ p))) + p - ut) ≤
        Real.sqrt g * (ρ / μ) + δ := by
  set A := Cᵀ * K * C
  set b := Cᵀ *ᵥ (f - K *ᵥ p)
  have hres : ∀ i, (b - A *ᵥ qt) i ∈ᵢ Ir i := by
    intro i
    have e : b - A *ᵥ qt = Cᵀ *ᵥ (f - K *ᵥ (C *ᵥ qt + p)) := by
      simp only [b, A, Matrix.mulVec_sub, Matrix.mulVec_add, ← Matrix.mulVec_mulVec]
      abel
    rw [e]
    exact hr i
  obtain ⟨hsol, huniq, hq⟩ := certified_error_bound_gram A b qt L IR hR hμ0 hμ Ir hres hρ le_rfl
  refine ⟨hsol, huniq, ?_⟩
  have e : C *ᵥ (A⁻¹ *ᵥ b) + p - ut = C *ᵥ (A⁻¹ *ᵥ b - qt) + (C *ᵥ qt + p - ut) := by
    rw [Matrix.mulVec_sub]
    abel
  rw [e]
  calc vnorm (C *ᵥ (A⁻¹ *ᵥ b - qt) + (C *ᵥ qt + p - ut))
      ≤ vnorm (C *ᵥ (A⁻¹ *ᵥ b - qt)) + vnorm (C *ᵥ qt + p - ut) := vnorm_add_le _ _
    _ ≤ Real.sqrt g * (ρ / μ) + δ :=
      add_le_add ((vnorm_mulVec_le_of_rows C hg _).trans
        (mul_le_mul_of_nonneg_left hq (Real.sqrt_nonneg _))) hδ

end Certify
