/-
Block residual eigenvalue count (Kahan; CERTIFY.md, "Modal enclosures and completeness").

`C` real symmetric `n × n`, `Y : n × m`, `ν : Fin m → ℝ`, `R = C Y − Y diag(ν)`. If
`‖Y z‖² ≥ g ‖z‖²` (`g > 0`, i.e. `σ_min(Y)² ≥ g`) and `‖R‖_F ≤ r`, then with
`ρ = r / √g`:
* `kahan_union_count`: at least `m` eigenvalues of `C` (with multiplicity) lie in
  `⋃ⱼ [νⱼ − ρ, νⱼ + ρ]`;
* `kahan_lower_count`: at least `m` eigenvalues of `C` are `≥ min ν − ρ` (the form used
  by the lower count in `engine/src/certify/modal.rs`).
Both follow from `kahan_count_of_sep`: if every eigenvalue outside a set `P` is
separated from all `νⱼ` by more than `ρ`, then `#P ≥ m`.

Proof (eigen-coordinates): write `Ŷ = Uᵀ Y`, `R̂ = Uᵀ R`, so `R̂ₖⱼ = (λₖ − νⱼ) Ŷₖⱼ`. If
`#P < m`, some `z ≠ 0` has `(Ŷ z)ₖ = 0` for all `k ∈ P`; then by Cauchy–Schwarz
`g ‖z‖² ≤ ‖Y z‖² ≤ ‖z‖² Σ_{k ∉ P, j} Ŷₖⱼ²` while `r² Σ_{k ∉ P, j} Ŷₖⱼ² < g ‖R̂‖_F² ≤ g r²`.
-/
import Certify.Modal

open Matrix Finset

namespace Certify

variable {n : ℕ}

section
variable {C : Matrix (Fin n) (Fin n) ℝ} (hC : C.IsHermitian)
include hC

/-- Parseval in the eigenbasis of `C`, as dot products. -/
lemma parseval_eig (x : Fin n → ℝ) :
    ∑ l, (x ⬝ᵥ (hC.eigenvectorBasis l : Fin n → ℝ)) ^ 2 = vnorm x ^ 2 := by
  have h := hC.eigenvectorBasis.sum_sq_inner_right (WithLp.toLp 2 x)
  rw [← vnorm_eq_euclidean] at h
  rw [← h]
  refine Finset.sum_congr rfl fun l _ => ?_
  rw [EuclideanSpace.inner_eq_star_dotProduct]
  simp

/-- Eigen-coordinate `l` of a residual `C y − ν y` is `(λₗ − ν)` times that of `y`. -/
lemma coord_resid (y : Fin n → ℝ) (ν : ℝ) (l : Fin n) :
    (C *ᵥ y - ν • y) ⬝ᵥ (hC.eigenvectorBasis l : Fin n → ℝ) =
      (hC.eigenvalues l - ν) * (y ⬝ᵥ (hC.eigenvectorBasis l : Fin n → ℝ)) := by
  have hCT : Cᵀ = C := by
    have := hC.eq
    rwa [Matrix.conjTranspose_eq_transpose_of_trivial] at this
  rw [sub_dotProduct, smul_dotProduct, dotProduct_comm (C *ᵥ y),
    Matrix.dotProduct_mulVec, ← Matrix.mulVec_transpose, hCT, hC.mulVec_eigenvectorBasis l,
    smul_dotProduct, dotProduct_comm _ y]
  simp only [smul_eq_mul]
  ring

end

/-- Column `j` of `C Y − Y diag(ν)` is `C yⱼ − νⱼ yⱼ`. -/
lemma resid_entry {m : ℕ} (C : Matrix (Fin n) (Fin n) ℝ) (Y : Matrix (Fin n) (Fin m) ℝ)
    (ν : Fin m → ℝ) (i : Fin n) (j : Fin m) :
    (C * Y - Y * diagonal ν) i j = (C *ᵥ (fun l => Y l j) - ν j • fun l => Y l j) i := by
  rw [Matrix.sub_apply, Matrix.mul_diagonal]
  simp [Matrix.mul_apply, Matrix.mulVec, dotProduct, mul_comm]

/-- **Kahan, separation form.** `C` symmetric, `‖Y z‖² ≥ g ‖z‖²` with `g > 0`,
`‖C Y − Y diag(ν)‖_F² ≤ r²`. If every eigenvalue `λₖ` with `¬ P k` satisfies
`r² < g (λₖ − νⱼ)²` for all `j` (separated from every `νⱼ` by more than `r/√g`), then at
least `m` indices `k` satisfy `P k`. -/
theorem kahan_count_of_sep {C : Matrix (Fin n) (Fin n) ℝ} (hC : C.IsHermitian) {m : ℕ}
    (Y : Matrix (Fin n) (Fin m) ℝ) (ν : Fin m → ℝ) {g r : ℝ} (hg : 0 < g)
    (hY : ∀ z, g * vnorm z ^ 2 ≤ vnorm (Y *ᵥ z) ^ 2)
    (hR : ∑ i, ∑ j, ((C * Y - Y * diagonal ν) i j) ^ 2 ≤ r ^ 2)
    (P : Fin n → Prop) [DecidablePred P]
    (hsep : ∀ k, ¬ P k → ∀ j, r ^ 2 < g * (hC.eigenvalues k - ν j) ^ 2) :
    m ≤ #{k | P k} := by
  classical
  set b := hC.eigenvectorBasis
  set ev := hC.eigenvalues
  by_contra hlt
  push Not at hlt
  set a : Fin n → Fin m → ℝ := fun k j => (fun l => Y l j) ⬝ᵥ (b k : Fin n → ℝ) with ha
  let S := ({k | P k} : Finset (Fin n))
  let Z : Matrix S (Fin m) ℝ := Matrix.of fun k j => a k.1 j
  have hker := LinearMap.ker_ne_bot_of_finrank_lt (f := Z.mulVecLin) (by simpa using hlt)
  obtain ⟨z, hzker, hz0⟩ := Submodule.exists_mem_ne_zero_of_ne_bot hker
  set x := Y *ᵥ z with hxdef
  have hxa : ∀ k, x ⬝ᵥ (b k : Fin n → ℝ) = ∑ j, z j * a k j := by
    intro k
    simp only [x, a, dotProduct, mulVec, Finset.mul_sum, Finset.sum_mul]
    rw [Finset.sum_comm]
    exact sum_congr rfl fun _ _ => sum_congr rfl fun _ _ => by ring
  have hin : ∀ k, P k → x ⬝ᵥ (b k : Fin n → ℝ) = 0 := by
    intro k hk
    have := congrFun (LinearMap.mem_ker.mp hzker) ⟨k, by simpa [S] using hk⟩
    rw [hxa]
    simpa [Z, Matrix.mulVec, dotProduct, mul_comm] using this
  have hzpos : 0 < vnorm z ^ 2 := by
    have : 0 < vnorm z :=
      lt_of_le_of_ne (vnorm_nonneg z) (fun h0 => hz0 (vnorm_eq_zero.mp h0.symm))
    positivity
  set out := ({k | ¬ P k} : Finset (Fin n))
  have hx2 : vnorm x ^ 2 = ∑ k ∈ out, (∑ j, z j * a k j) ^ 2 := by
    rw [← parseval_eig hC x, Finset.sum_filter]
    refine sum_congr rfl fun k _ => ?_
    by_cases h : P k
    · simp only [h, not_true_eq_false, ite_false]
      exact (congrArg (· ^ 2) (hin k h)).trans (by ring)
    · simp only [h, not_false_eq_true, ite_true]
      exact congrArg (· ^ 2) (hxa k)
  -- Frobenius norm in eigen-coordinates
  have hRcol : ∀ j, ∑ k, ((ev k - ν j) * a k j) ^ 2 =
      ∑ i, ((C * Y - Y * diagonal ν) i j) ^ 2 := by
    intro j
    have h := parseval_eig hC (C *ᵥ (fun l => Y l j) - ν j • fun l => Y l j)
    rw [vnorm_sq] at h
    simp_rw [coord_resid hC] at h
    simp_rw [resid_entry]
    exact h
  have hF : ∑ k, ∑ j, g * ((ev k - ν j) * a k j) ^ 2 ≤ g * r ^ 2 := by
    calc ∑ k, ∑ j, g * ((ev k - ν j) * a k j) ^ 2
        = g * ∑ j, ∑ k, ((ev k - ν j) * a k j) ^ 2 := by
          simp_rw [Finset.mul_sum]; rw [Finset.sum_comm]
      _ = g * ∑ j, ∑ i, ((C * Y - Y * diagonal ν) i j) ^ 2 := by simp only [hRcol]
      _ = g * ∑ i, ∑ j, ((C * Y - Y * diagonal ν) i j) ^ 2 := by rw [Finset.sum_comm]
      _ ≤ g * r ^ 2 := mul_le_mul_of_nonneg_left hR hg.le
  set A := ∑ k ∈ out, ∑ j, a k j ^ 2 with hA
  have h1 : vnorm x ^ 2 ≤ vnorm z ^ 2 * A := by
    rw [hx2, vnorm_sq z, hA, Finset.mul_sum]
    exact sum_le_sum fun k _ => sum_mul_sq_le_sq_mul_sq _ _ _
  by_cases hne : ∃ k ∈ out, ∃ j, a k j ≠ 0
  · obtain ⟨k0, hk0, j0, hj0⟩ := hne
    have hk0' : ¬ P k0 := by simpa [out] using hk0
    have hle : ∀ k ∈ out, ∀ j, r ^ 2 * a k j ^ 2 ≤ g * ((ev k - ν j) * a k j) ^ 2 := by
      intro k hk j
      have := hsep k (by simpa [out] using hk) j
      rw [mul_pow, ← mul_assoc]
      exact mul_le_mul_of_nonneg_right this.le (sq_nonneg _)
    have h2 : r ^ 2 * A < g * r ^ 2 := by
      calc r ^ 2 * A = ∑ k ∈ out, ∑ j, r ^ 2 * a k j ^ 2 := by
            rw [hA, Finset.mul_sum]; simp_rw [Finset.mul_sum]
        _ < ∑ k ∈ out, ∑ j, g * ((ev k - ν j) * a k j) ^ 2 := by
          refine Finset.sum_lt_sum (fun k hk => sum_le_sum fun j _ => hle k hk j)
            ⟨k0, hk0, Finset.sum_lt_sum (fun j _ => hle k0 hk0 j) ⟨j0, mem_univ _, ?_⟩⟩
          rw [mul_pow, ← mul_assoc]
          exact mul_lt_mul_of_pos_right (hsep k0 hk0' j0)
            (lt_of_le_of_ne (sq_nonneg _) (Ne.symm (pow_ne_zero 2 hj0)))
        _ ≤ ∑ k, ∑ j, g * ((ev k - ν j) * a k j) ^ 2 :=
          sum_le_sum_of_subset_of_nonneg (subset_univ _)
            (fun _ _ _ => sum_nonneg fun _ _ => by positivity)
        _ ≤ g * r ^ 2 := hF
    have h3 := mul_lt_mul_of_pos_left h2 hzpos
    have h4 := mul_le_mul_of_nonneg_right ((hY z).trans h1) (sq_nonneg r)
    nlinarith
  · push Not at hne
    have hx0 : vnorm x ^ 2 = 0 := by
      rw [hx2]
      exact sum_eq_zero fun k hk => by simp [hne k hk]
    have := hY z
    nlinarith [mul_pos hg hzpos]

lemma sq_lt_of_div_sqrt_lt {g r d : ℝ} (hg : 0 < g) (hr : 0 ≤ r) (h : r / √g < |d|) :
    r ^ 2 < g * d ^ 2 := by
  have hs : 0 < √g := Real.sqrt_pos.mpr hg
  have h1 : r < |d| * √g := (div_lt_iff₀ hs).mp h
  have h2 : r ^ 2 < (|d| * √g) ^ 2 := pow_lt_pow_left₀ h1 hr two_ne_zero
  rwa [mul_pow, sq_abs, Real.sq_sqrt hg.le, mul_comm] at h2

/-- **Kahan (Frobenius form).** `C` symmetric, `‖Y z‖² ≥ g ‖z‖²` (`g > 0`),
`‖C Y − Y diag(ν)‖_F ≤ r`: at least `m` eigenvalues of `C`, with multiplicity, lie in
`⋃ⱼ [νⱼ − r/√g, νⱼ + r/√g]`. -/
theorem kahan_union_count {C : Matrix (Fin n) (Fin n) ℝ} (hC : C.IsHermitian) {m : ℕ}
    (Y : Matrix (Fin n) (Fin m) ℝ) (ν : Fin m → ℝ) {g r : ℝ} (hg : 0 < g) (hr : 0 ≤ r)
    (hY : ∀ z, g * vnorm z ^ 2 ≤ vnorm (Y *ᵥ z) ^ 2)
    (hR : ∑ i, ∑ j, ((C * Y - Y * diagonal ν) i j) ^ 2 ≤ r ^ 2) :
    m ≤ #{k | ∃ j, |hC.eigenvalues k - ν j| ≤ r / √g} :=
  kahan_count_of_sep hC Y ν hg hY hR _ fun _ hk j =>
    sq_lt_of_div_sqrt_lt hg hr (lt_of_not_ge fun h => hk ⟨j, h⟩)

/-- **Kahan, lower count (used by `modal.rs`).** Under the hypotheses of
`kahan_union_count`, if `νmin ≤ νⱼ` for all `j`, at least `m` eigenvalues of `C`, with
multiplicity, are `≥ νmin − r/√g`. -/
theorem kahan_lower_count {C : Matrix (Fin n) (Fin n) ℝ} (hC : C.IsHermitian) {m : ℕ}
    (Y : Matrix (Fin n) (Fin m) ℝ) (ν : Fin m → ℝ) {g r : ℝ} (hg : 0 < g) (hr : 0 ≤ r)
    (hY : ∀ z, g * vnorm z ^ 2 ≤ vnorm (Y *ᵥ z) ^ 2)
    (hR : ∑ i, ∑ j, ((C * Y - Y * diagonal ν) i j) ^ 2 ≤ r ^ 2)
    {νmin : ℝ} (hν : ∀ j, νmin ≤ ν j) :
    m ≤ #{k | νmin - r / √g ≤ hC.eigenvalues k} :=
  kahan_count_of_sep hC Y ν hg hY hR _ fun k hk j => by
    apply sq_lt_of_div_sqrt_lt hg hr
    rw [abs_sub_comm]
    have := not_le.mp hk
    calc r / √g < ν j - hC.eigenvalues k := by linarith [hν j]
      _ ≤ |ν j - hC.eigenvalues k| := le_abs_self _

end Certify
