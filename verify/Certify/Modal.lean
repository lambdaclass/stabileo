/-
Modal enclosures and completeness (CERTIFY.md, "Modal enclosures and completeness").

Pencil `K φ = λ M φ`, cutoff `μ`, `A = K − μ M`. "At most `j` eigenvalues `λ ≤ μ`" is
stated without eigenvalues, in min-max form: every subspace on which the quadratic form
of `A` is nonpositive has dimension at most `j`. Justifies the upper count in
`engine/src/certify/modal.rs`:
* `count_le_of_pos_on`: `A` positive on a subspace `V` ⇒ nonpositive subspaces have
  dimension `≤ n − dim V` (they meet `V` only in `0`);
* `count_le_of_deleted`: `A` positive on `{x | xᵢ = 0, i ∈ I}` (a principal submatrix
  with the rows/columns `I` deleted is positive definite) ⇒ count `≤ |I|`;
* `count_le_of_finsler` / `count_le_of_finsler_gram`: `A + c U Uᵀ ≻ 0` with
  `U : n × j` ⇒ count `≤ j`.
Also the single-mode residual enclosure for a symmetric matrix
(`exists_eigenvalue_near`, Bauer–Fike for normal matrices).
Kahan's block theorem (lower count) is in `Certify.Kahan`.
-/
import Certify.Gram

open Matrix Finset

namespace Certify

open Certify.Interval

variable {n : ℕ}

/-- The quadratic form of `A` is nonpositive on `S`. -/
def NonposSubspace (A : Matrix (Fin n) (Fin n) ℝ) (S : Submodule ℝ (Fin n → ℝ)) : Prop :=
  ∀ x ∈ S, x ⬝ᵥ (A *ᵥ x) ≤ 0

/-- A nonpositive subspace meets a positive subspace only in `0`. -/
lemma nonpos_inf_pos_eq_bot {A : Matrix (Fin n) (Fin n) ℝ} {S V : Submodule ℝ (Fin n → ℝ)}
    (hS : NonposSubspace A S) (hV : ∀ x ∈ V, x ≠ 0 → 0 < x ⬝ᵥ (A *ᵥ x)) : S ⊓ V = ⊥ := by
  rw [eq_bot_iff]
  intro x ⟨hxS, hxV⟩
  rw [Submodule.mem_bot]
  by_contra hx
  have := hV x hxV hx
  have := hS x hxS
  linarith

/-- **A1.** If `A` is positive on `V`, every nonpositive subspace `S` satisfies
`dim S + dim V ≤ n`. -/
theorem count_le_of_pos_on {A : Matrix (Fin n) (Fin n) ℝ} (V : Submodule ℝ (Fin n → ℝ))
    (hV : ∀ x ∈ V, x ≠ 0 → 0 < x ⬝ᵥ (A *ᵥ x)) :
    ∀ S, NonposSubspace A S → Module.finrank ℝ S + Module.finrank ℝ V ≤ n := by
  intro S hS
  have h := Submodule.finrank_sup_add_finrank_inf_eq S V
  rw [nonpos_inf_pos_eq_bot hS hV, finrank_bot, add_zero] at h
  rw [← h]
  simpa using Submodule.finrank_le (S ⊔ V)

theorem count_le_of_pos_on' {A : Matrix (Fin n) (Fin n) ℝ} (V : Submodule ℝ (Fin n → ℝ))
    (hV : ∀ x ∈ V, x ≠ 0 → 0 < x ⬝ᵥ (A *ᵥ x)) :
    ∀ S, NonposSubspace A S → Module.finrank ℝ S ≤ n - Module.finrank ℝ V := fun S hS =>
  Nat.le_sub_of_add_le (count_le_of_pos_on V hV S hS)

/-- Kernel form: if `A` is positive on `ker f \ {0}` for a linear `f` into `W`, then every
nonpositive subspace has dimension `≤ dim W` (`f` is injective on it). -/
theorem count_le_of_pos_on_ker {A : Matrix (Fin n) (Fin n) ℝ} {W : Type*} [AddCommGroup W]
    [Module ℝ W] [FiniteDimensional ℝ W] (f : (Fin n → ℝ) →ₗ[ℝ] W)
    (hpos : ∀ x, f x = 0 → x ≠ 0 → 0 < x ⬝ᵥ (A *ᵥ x)) :
    ∀ S, NonposSubspace A S → Module.finrank ℝ S ≤ Module.finrank ℝ W := by
  intro S hS
  refine LinearMap.finrank_le_finrank_of_injective (f := f ∘ₗ S.subtype) ?_
  rw [← LinearMap.ker_eq_bot, eq_bot_iff]
  intro x hx
  rw [LinearMap.mem_ker, LinearMap.comp_apply, Submodule.subtype_apply] at hx
  rw [Submodule.mem_bot]
  by_contra h0
  have h1 := hpos x hx (fun h => h0 (Subtype.ext h))
  have h2 := hS x x.2
  linarith

/-! ### Deleted-index certificate -/

/-- Restriction to the deleted indices `I`. -/
def restrictI (I : Finset (Fin n)) : (Fin n → ℝ) →ₗ[ℝ] (I → ℝ) :=
  LinearMap.pi fun i : I => LinearMap.proj (R := ℝ) (φ := fun _ : Fin n => ℝ) i.1

/-- `{x | xᵢ = 0 for i ∈ I}`. -/
def deletedSubspace (I : Finset (Fin n)) : Submodule ℝ (Fin n → ℝ) :=
  LinearMap.ker (restrictI I)

lemma mem_deletedSubspace {I : Finset (Fin n)} {x : Fin n → ℝ} :
    x ∈ deletedSubspace I ↔ ∀ i ∈ I, x i = 0 := by
  simp only [deletedSubspace, LinearMap.mem_ker, funext_iff, restrictI, LinearMap.pi_apply,
    LinearMap.proj_apply, Pi.zero_apply, Subtype.forall]

/-- `dim {x | xᵢ = 0, i ∈ I} = n − |I|`. -/
theorem finrank_deletedSubspace (I : Finset (Fin n)) :
    Module.finrank ℝ (deletedSubspace I) = n - I.card := by
  have hsurj : Function.Surjective (restrictI I) := by
    intro w
    classical
    refine ⟨fun j => if h : j ∈ I then w ⟨j, h⟩ else 0, ?_⟩
    funext i
    simp [restrictI, i.2]
  have h := LinearMap.finrank_range_add_finrank_ker (restrictI I)
  rw [LinearMap.range_eq_top.mpr hsurj, finrank_top, Module.finrank_fintype_fun_eq_card,
    Fintype.card_coe, Module.finrank_fin_fun] at h
  rw [deletedSubspace]
  omega

/-- **A2.** If the quadratic form of `A` is positive on nonzero `x` with `xᵢ = 0` for
`i ∈ I` (the principal submatrix with `I` deleted is positive definite), every
nonpositive subspace has dimension `≤ |I|`. -/
theorem count_le_of_deleted {A : Matrix (Fin n) (Fin n) ℝ} (I : Finset (Fin n))
    (hpos : ∀ x : Fin n → ℝ, (∀ i ∈ I, x i = 0) → x ≠ 0 → 0 < x ⬝ᵥ (A *ᵥ x)) :
    ∀ S, NonposSubspace A S → Module.finrank ℝ S ≤ I.card := by
  intro S hS
  have h := count_le_of_pos_on_ker (restrictI I) (fun x hx => hpos x
    (mem_deletedSubspace.mp (LinearMap.mem_ker.mpr hx))) S hS
  simpa using h

/-! ### Finsler certificate -/

lemma quad_gram_rect {j : ℕ} (U : Matrix (Fin n) (Fin j) ℝ) (x : Fin n → ℝ) :
    x ⬝ᵥ ((U * Uᵀ) *ᵥ x) = (Uᵀ *ᵥ x) ⬝ᵥ (Uᵀ *ᵥ x) := by
  rw [← Matrix.mulVec_mulVec, Matrix.dotProduct_mulVec, ← Matrix.mulVec_transpose]

/-- **A3 (Finsler).** If `A + c U Uᵀ ≻ 0` for some `U : n × j` and any `c`, every
nonpositive subspace of `A` has dimension `≤ j`. -/
theorem count_le_of_finsler {A : Matrix (Fin n) (Fin n) ℝ} {j : ℕ}
    (U : Matrix (Fin n) (Fin j) ℝ) (c : ℝ)
    (hpos : ∀ x : Fin n → ℝ, x ≠ 0 → 0 < x ⬝ᵥ ((A + c • (U * Uᵀ)) *ᵥ x)) :
    ∀ S, NonposSubspace A S → Module.finrank ℝ S ≤ j := by
  intro S hS
  have h := count_le_of_pos_on_ker (Uᵀ.mulVecLin) (A := A) (fun x hx hx0 => by
    have := hpos x hx0
    rw [Matrix.add_mulVec, dotProduct_add, Matrix.smul_mulVec, dotProduct_smul,
      quad_gram_rect] at this
    rw [Matrix.mulVecLin_apply] at hx
    simpa [hx] using this) S hS
  simpa using h

/-- **A3 (Finsler, Gram/Gershgorin certificate).** For the pencil `(K, M)` and cutoff `μ`,
an interval Gram-residual certificate for `K − μ M + c U Uᵀ` (any real `L`, Gershgorin
bound `g > 0`) shows that at most `j` eigenvalues lie at or below `μ`: every subspace on
which `xᵀ(K − μ M)x ≤ 0` has dimension `≤ j`. -/
theorem count_le_of_finsler_gram {K M : Matrix (Fin n) (Fin n) ℝ} {μ : ℝ} {j : ℕ}
    (U : Matrix (Fin n) (Fin j) ℝ) (c : ℝ)
    (L : Matrix (Fin n) (Fin n) ℝ) (IR : Matrix (Fin n) (Fin n) Interval)
    (hR : ∀ i k, (symPart (K - μ • M + c • (U * Uᵀ)) - L * Lᵀ) i k ∈ᵢ IR i k)
    {g : ℝ} (hg0 : 0 < g) (hg : ∀ i, g ≤ (IR i i).lo - ∑ k ∈ univ.erase i, mag (IR i k)) :
    ∀ S, NonposSubspace (K - μ • M) S → Module.finrank ℝ S ≤ j := by
  refine count_le_of_finsler U c fun x hx => ?_
  have h := coercive_of_gram (K - μ • M + c • (U * Uᵀ)) L IR hR hg x
  have hv : 0 < vnorm x :=
    lt_of_le_of_ne (vnorm_nonneg x) (fun h0 => hx (vnorm_eq_zero.mp h0.symm))
  have : 0 < g * vnorm x ^ 2 := by positivity
  linarith

/-! ### Single-mode enclosure (symmetric residual bound) -/

/-- **A4 (Bauer–Fike, symmetric case).** For a real symmetric `C`, any `y ≠ 0` and `ν`,
some eigenvalue `e` of `C` satisfies `|e − ν| ≤ ‖C y − ν y‖ / ‖y‖`. -/
theorem exists_eigenvalue_near {C : Matrix (Fin n) (Fin n) ℝ} (hC : C.IsHermitian)
    {y : Fin n → ℝ} (hy : y ≠ 0) (ν : ℝ) :
    ∃ k, |hC.eigenvalues k - ν| ≤ vnorm (C *ᵥ y - ν • y) / vnorm y := by
  obtain ⟨i0, -⟩ := Function.ne_iff.mp hy
  have : Nonempty (Fin n) := ⟨i0⟩
  set b := hC.eigenvectorBasis
  set ev := hC.eigenvalues
  obtain ⟨k, -, hk⟩ := Finset.exists_min_image univ (fun k => |ev k - ν|) univ_nonempty
  refine ⟨k, ?_⟩
  have hCT : Cᵀ = C := by
    have := hC.eq
    rwa [Matrix.conjTranspose_eq_transpose_of_trivial] at this
  -- coordinates in the eigenbasis
  have hinner : ∀ (l : Fin n) (z : Fin n → ℝ),
      inner ℝ (b l) (WithLp.toLp 2 z) = z ⬝ᵥ (b l : Fin n → ℝ) := by
    intro l z
    rw [EuclideanSpace.inner_eq_star_dotProduct]
    simp
  have hcoord : ∀ l, inner ℝ (b l) (WithLp.toLp 2 (C *ᵥ y - ν • y)) =
      (ev l - ν) * inner ℝ (b l) (WithLp.toLp 2 y) := by
    intro l
    rw [hinner, hinner, sub_dotProduct, smul_dotProduct, dotProduct_comm (C *ᵥ y),
      Matrix.dotProduct_mulVec, ← Matrix.mulVec_transpose, hCT, hC.mulVec_eigenvectorBasis l,
      smul_dotProduct, dotProduct_comm _ y]
    simp only [smul_eq_mul, ev, b]
    ring
  have hz := b.sum_sq_inner_right (WithLp.toLp 2 (C *ᵥ y - ν • y))
  have hy2 := b.sum_sq_inner_right (WithLp.toLp 2 y)
  rw [← vnorm_eq_euclidean] at hz hy2
  simp_rw [hcoord, mul_pow] at hz
  have hle : |ev k - ν| ^ 2 * vnorm y ^ 2 ≤ vnorm (C *ᵥ y - ν • y) ^ 2 := by
    rw [← hz, ← hy2, Finset.mul_sum]
    refine Finset.sum_le_sum fun l _ => mul_le_mul_of_nonneg_right ?_ (sq_nonneg _)
    rw [← sq_abs (ev l - ν)]
    exact pow_le_pow_left₀ (abs_nonneg _) (hk l (mem_univ l)) 2
  have hv : 0 < vnorm y :=
    lt_of_le_of_ne (vnorm_nonneg y) (fun h0 => hy (vnorm_eq_zero.mp h0.symm))
  rw [le_div_iff₀ hv]
  have h2 : (|ev k - ν| * vnorm y) ^ 2 ≤ vnorm (C *ᵥ y - ν • y) ^ 2 := by
    rw [mul_pow]; exact hle
  exact (pow_le_pow_iff_left₀ (by positivity) (vnorm_nonneg _) two_ne_zero).mp h2

end Certify
