/-
Buckling load-factor enclosure (CERTIFY.md, "Buckling load-factor enclosure").

Pencil `K φ = λ N φ` with `N = −K_G`. The stability matrix `A(λ) = K − λ N` is affine
in `λ`; the structure is stable at `λ` when `A(λ)` is positive definite. Justifies
`engine/src/certify/buckling.rs`:
* lower bound: Gram/Gershgorin certificates for `A(0)` and `A(λ̲)` give stability on
  all of `[0, λ̲]` (the quadratic form is affine in `λ`);
* upper bound: an interval-evaluated Rayleigh quotient of any `φ ≠ 0` with
  `φᵀNφ > 0` gives a `λ̄` at which `A(λ̄)` is not positive definite.
-/
import Certify.Gram

open Matrix Finset

namespace Certify

open Certify.Interval

variable {n : ℕ}

/-- `K − t N` is positive definite (as a quadratic form). -/
def Stable (K N : Matrix (Fin n) (Fin n) ℝ) (t : ℝ) : Prop :=
  ∀ x : Fin n → ℝ, x ≠ 0 → 0 < x ⬝ᵥ ((K - t • N) *ᵥ x)

/-- The quadratic form of `K − t N` is affine in `t`. -/
lemma quad_stab (K N : Matrix (Fin n) (Fin n) ℝ) (t : ℝ) (x : Fin n → ℝ) :
    x ⬝ᵥ ((K - t • N) *ᵥ x) = x ⬝ᵥ (K *ᵥ x) - t * x ⬝ᵥ (N *ᵥ x) := by
  rw [Matrix.sub_mulVec, dotProduct_sub, Matrix.smul_mulVec, dotProduct_smul, smul_eq_mul]

/-- Stability at `0` and at `tl` gives stability on `[0, tl]`. -/
theorem stable_segment {K N : Matrix (Fin n) (Fin n) ℝ} {tl : ℝ}
    (h0 : Stable K N 0) (hl : Stable K N tl) : ∀ t ∈ Set.Icc 0 tl, Stable K N t := by
  rintro t ⟨ht0, htl⟩ x hx
  have a := h0 x hx
  have b := hl x hx
  rw [quad_stab] at a b ⊢
  rcases le_total (x ⬝ᵥ (N *ᵥ x)) 0 with hN | hN
  · nlinarith
  · nlinarith

/-- Rayleigh upper bound: `φᵀKφ / φᵀNφ ≤ tu` with `φᵀNφ > 0` makes `K − tu N` not
positive definite. -/
theorem not_stable_of_rayleigh {K N : Matrix (Fin n) (Fin n) ℝ} {φ : Fin n → ℝ} {tu : ℝ}
    (hφ : φ ≠ 0) (hden : 0 < φ ⬝ᵥ (N *ᵥ φ))
    (hq : φ ⬝ᵥ (K *ᵥ φ) / φ ⬝ᵥ (N *ᵥ φ) ≤ tu) : ¬ Stable K N tu := by
  intro hs
  have h := hs φ hφ
  rw [quad_stab] at h
  rw [div_le_iff₀ hden] at hq
  linarith

/-- Interval Rayleigh upper bound (as in `rayleigh_upper`): enclosures `Inum ∋ φᵀKφ`,
`Iden ∋ φᵀNφ` with `0 < Iden.lo`, `Inum.hi / Iden.lo ≤ tu` and `0 ≤ tu`. -/
theorem not_stable_of_interval_rayleigh {K N : Matrix (Fin n) (Fin n) ℝ} {φ : Fin n → ℝ}
    {tu : ℝ} {Inum Iden : Interval} (hφ : φ ≠ 0)
    (hnum : φ ⬝ᵥ (K *ᵥ φ) ∈ᵢ Inum) (hden : φ ⬝ᵥ (N *ᵥ φ) ∈ᵢ Iden) (hlo : 0 < Iden.lo)
    (hq : Inum.hi / Iden.lo ≤ tu) (htu : 0 ≤ tu) : ¬ Stable K N tu := by
  intro hs
  have h := hs φ hφ
  rw [quad_stab] at h
  rw [div_le_iff₀ hlo] at hq
  have := mul_le_mul_of_nonneg_left hden.1 htu
  linarith [hnum.2]

/-- Gram/Gershgorin certificate for `K − t N` (as in `certify_lambda_min_lower`)
gives stability at `t`. -/
theorem stable_of_gram {K N : Matrix (Fin n) (Fin n) ℝ} {t : ℝ}
    (L : Matrix (Fin n) (Fin n) ℝ) (IR : Matrix (Fin n) (Fin n) Interval)
    (hR : ∀ i j, (symPart (K - t • N) - L * Lᵀ) i j ∈ᵢ IR i j)
    {μ : ℝ} (hμ0 : 0 < μ) (hμ : ∀ i, μ ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j)) :
    Stable K N t := by
  intro x hx
  have h := coercive_of_gram (K - t • N) L IR hR hμ x
  have hv : 0 < vnorm x :=
    lt_of_le_of_ne (vnorm_nonneg x) (fun h0 => hx (vnorm_eq_zero.mp h0.symm))
  have : 0 < μ * vnorm x ^ 2 := by positivity
  linarith

/-- **Buckling load-factor enclosure.** Gram/Gershgorin certificates for `K` (at `0`)
and for `K − tl N`, together with an interval Rayleigh quotient bound `tu` for some
`φ ≠ 0`, give: `K − t N ≻ 0` for every `t ∈ [0, tl]`, and `K − tu N` is not `≻ 0`. -/
theorem buckling_enclosure (K N : Matrix (Fin n) (Fin n) ℝ) {tl tu : ℝ}
    -- certificate at t = 0
    (L₀ : Matrix (Fin n) (Fin n) ℝ) (IR₀ : Matrix (Fin n) (Fin n) Interval)
    (hR₀ : ∀ i j, (symPart (K - (0 : ℝ) • N) - L₀ * L₀ᵀ) i j ∈ᵢ IR₀ i j)
    {μ₀ : ℝ} (hμ₀0 : 0 < μ₀) (hμ₀ : ∀ i, μ₀ ≤ (IR₀ i i).lo - ∑ j ∈ univ.erase i, mag (IR₀ i j))
    -- certificate at t = tl
    (L₁ : Matrix (Fin n) (Fin n) ℝ) (IR₁ : Matrix (Fin n) (Fin n) Interval)
    (hR₁ : ∀ i j, (symPart (K - tl • N) - L₁ * L₁ᵀ) i j ∈ᵢ IR₁ i j)
    {μ₁ : ℝ} (hμ₁0 : 0 < μ₁) (hμ₁ : ∀ i, μ₁ ≤ (IR₁ i i).lo - ∑ j ∈ univ.erase i, mag (IR₁ i j))
    -- Rayleigh upper bound
    {φ : Fin n → ℝ} {Inum Iden : Interval} (hφ : φ ≠ 0)
    (hnum : φ ⬝ᵥ (K *ᵥ φ) ∈ᵢ Inum) (hden : φ ⬝ᵥ (N *ᵥ φ) ∈ᵢ Iden) (hlo : 0 < Iden.lo)
    (hq : Inum.hi / Iden.lo ≤ tu) (htu : 0 ≤ tu) :
    (∀ t ∈ Set.Icc 0 tl, Stable K N t) ∧ ¬ Stable K N tu :=
  ⟨stable_segment (stable_of_gram L₀ IR₀ hR₀ hμ₀0 hμ₀) (stable_of_gram L₁ IR₁ hR₁ hμ₁0 hμ₁),
    not_stable_of_interval_rayleigh hφ hnum hden hlo hq htu⟩

/-- The critical load factor: supremum of `t ≥ 0` with `K − t' N ≻ 0` on `[0, t]`. -/
noncomputable def criticalFactor (K N : Matrix (Fin n) (Fin n) ℝ) : ℝ :=
  sSup {t | 0 ≤ t ∧ ∀ t' ∈ Set.Icc 0 t, Stable K N t'}

/-- If `K − t N ≻ 0` on `[0, tl]` (`0 ≤ tl`) and `K − tu N` is not (`0 ≤ tu`), then
`tl ≤ λ_cr ≤ tu`. -/
theorem criticalFactor_mem {K N : Matrix (Fin n) (Fin n) ℝ} {tl tu : ℝ} (htl : 0 ≤ tl)
    (htu : 0 ≤ tu) (hl : ∀ t ∈ Set.Icc 0 tl, Stable K N t) (hu : ¬ Stable K N tu) :
    criticalFactor K N ∈ Set.Icc tl tu := by
  have hub : ∀ t ∈ {t | 0 ≤ t ∧ ∀ t' ∈ Set.Icc 0 t, Stable K N t'}, t ≤ tu := by
    rintro t ⟨_, ht⟩
    by_contra h
    exact hu (ht tu ⟨htu, (not_le.mp h).le⟩)
  exact ⟨le_csSup ⟨tu, hub⟩ ⟨htl, hl⟩, csSup_le ⟨tl, htl, hl⟩ hub⟩

/-- Corollary of `buckling_enclosure`: with `0 ≤ tl`, `tl ≤ λ_cr ≤ tu`. -/
theorem buckling_criticalFactor_mem (K N : Matrix (Fin n) (Fin n) ℝ) {tl tu : ℝ}
    (htl : 0 ≤ tl)
    (L₀ : Matrix (Fin n) (Fin n) ℝ) (IR₀ : Matrix (Fin n) (Fin n) Interval)
    (hR₀ : ∀ i j, (symPart (K - (0 : ℝ) • N) - L₀ * L₀ᵀ) i j ∈ᵢ IR₀ i j)
    {μ₀ : ℝ} (hμ₀0 : 0 < μ₀) (hμ₀ : ∀ i, μ₀ ≤ (IR₀ i i).lo - ∑ j ∈ univ.erase i, mag (IR₀ i j))
    (L₁ : Matrix (Fin n) (Fin n) ℝ) (IR₁ : Matrix (Fin n) (Fin n) Interval)
    (hR₁ : ∀ i j, (symPart (K - tl • N) - L₁ * L₁ᵀ) i j ∈ᵢ IR₁ i j)
    {μ₁ : ℝ} (hμ₁0 : 0 < μ₁) (hμ₁ : ∀ i, μ₁ ≤ (IR₁ i i).lo - ∑ j ∈ univ.erase i, mag (IR₁ i j))
    {φ : Fin n → ℝ} {Inum Iden : Interval} (hφ : φ ≠ 0)
    (hnum : φ ⬝ᵥ (K *ᵥ φ) ∈ᵢ Inum) (hden : φ ⬝ᵥ (N *ᵥ φ) ∈ᵢ Iden) (hlo : 0 < Iden.lo)
    (hq : Inum.hi / Iden.lo ≤ tu) (htu : 0 ≤ tu) :
    criticalFactor K N ∈ Set.Icc tl tu :=
  let h := buckling_enclosure K N L₀ IR₀ hR₀ hμ₀0 hμ₀ L₁ IR₁ hR₁ hμ₁0 hμ₁ hφ hnum hden hlo hq htu
  criticalFactor_mem htl htu h.1 h.2

end Certify
