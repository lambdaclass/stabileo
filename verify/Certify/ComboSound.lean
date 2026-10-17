/-
Soundness of the load-combination bundle checker (`Certify.ComboCheck`).

* `check_sound_disp` — every case is a verified linear-static certificate
  (`Certify.Bundle.check_sound` over the shared `K`); every combination's exact solution
  `Σ cᵢ K⁻¹fᵢ` is within `B_j` of the computed `ũ_j` (2-norm); and the envelope value
  `envMaxAbs[k]` is within `envBound` of the exact `max_j |(Σ cᵢ K⁻¹fᵢ)[k]|`.
* `check_sound_quantities` — the interval linear-combination rule: if every case value is
  within its (assumed) bound of the exact one, every combination value is within `B_{j,q}`
  of the exact combination, and within the envelope bound `E_q`.
-/
import Certify.BundleSound
import Certify.ComboCheck

open Matrix Finset

namespace Certify.Combo

open Certify Certify.Bundle
open Certify.Bundle.Dy (val val_add val_neg val_sub val_mul val_abs)

lemma val_dsum (l : List Dy) : (dsum l).val = (l.map Dy.val).sum := Dy.val_foldr_add l

lemma cast_dsum_map {α : Type} (l : List α) (g : α → Dy) :
    (((dsum (l.map g)).val : ℚ) : ℝ) = (l.map fun a => (((g a).val : ℚ) : ℝ)).sum := by
  induction l with
  | nil => simp [dsum]
  | cons a l ih =>
    simp only [dsum, List.map_cons, List.foldr_cons, val_add, Rat.cast_add, List.sum_cons] at ih ⊢
    rw [ih]

/-! ### Norm helpers -/

lemma vnorm_add_le {n : ℕ} (x y : Fin n → ℝ) : vnorm (x + y) ≤ vnorm x + vnorm y := by
  simp only [vnorm_eq_euclidean, WithLp.toLp_add]
  exact norm_add_le _ _

lemma vnorm_smul {n : ℕ} (c : ℝ) (x : Fin n → ℝ) : vnorm (c • x) = |c| * vnorm x := by
  simp only [vnorm_eq_euclidean, WithLp.toLp_smul, norm_smul, Real.norm_eq_abs]

lemma vnorm_list_sum_le {n : ℕ} {α : Type} (l : List α) (g : α → Fin n → ℝ) :
    vnorm (l.map g).sum ≤ (l.map fun a => vnorm (g a)).sum := by
  induction l with
  | nil =>
    simp only [List.map_nil, List.sum_nil]
    exact le_of_eq (vnorm_eq_zero.mpr rfl)
  | cons a l ih =>
    simp only [List.map_cons, List.sum_cons]
    exact (vnorm_add_le _ _).trans (add_le_add le_rfl ih)

lemma abs_le_vnorm {n : ℕ} (x : Fin n → ℝ) (k : Fin n) : |x k| ≤ vnorm x :=
  Real.abs_le_sqrt (Finset.single_le_sum (f := fun i => x i ^ 2) (fun _ _ => sq_nonneg _)
    (Finset.mem_univ k))

/-! ### Denotation -/

/-- The computed solution of combination `j`. -/
noncomputable def comboVec (cb : CBundle) (j : ℕ) : Fin cb.base.n → ℝ :=
  fun k => (((comboAt cb j).u.getD k 0).val : ℝ)

/-- The computed solution of case `i`. -/
noncomputable def caseVec (cb : CBundle) (i : ℕ) : Fin cb.base.n → ℝ :=
  fun k => (((caseAt cb i).u.getD k 0).val : ℝ)

/-- The exact combined solution `Σ cᵢ K⁻¹ fᵢ` for right-hand sides `f i`. -/
noncomputable def comboStar (cb : CBundle) (f : ℕ → Fin cb.base.n → ℝ) (j : ℕ) : Fin cb.base.n → ℝ :=
  ((comboAt cb j).factors.map fun p => (p.2.val : ℝ) • ((kMat cb.base)⁻¹ *ᵥ f p.1)).sum

/-- The right-hand sides lie in the cases' enclosures. -/
def RhsIn (cb : CBundle) (f : ℕ → Fin cb.base.n → ℝ) : Prop :=
  ∀ i < cb.cases.size, ∀ k : Fin cb.base.n,
    (((caseAt cb i).fLo.getD k 0).val : ℝ) ≤ f i k ∧ f i k ≤ (((caseAt cb i).fHi.getD k 0).val : ℝ)

/-! ### Cases -/

lemma caseAt_mem (cb : CBundle) {i : ℕ} (hi : i < cb.cases.size) : caseAt cb i ∈ cb.cases := by
  rw [caseAt, Array.getD_eq_getD_getElem?, Array.getElem?_eq_getElem hi]
  exact Array.getElem_mem hi

lemma comboAt_mem (cb : CBundle) {j : ℕ} (hj : j < cb.combos.size) : comboAt cb j ∈ cb.combos := by
  rw [comboAt, Array.getD_eq_getD_getElem?, Array.getElem?_eq_getElem hj]
  exact Array.getElem_mem hj

lemma case_check (cb : CBundle) (h : check cb = true) {c : Case} (hc : c ∈ cb.cases) :
    Bundle.check (caseBundle cb c) = true := by
  simp only [check, casesOk, Bool.and_eq_true, Array.all_eq_true_iff_forall_mem] at h
  obtain ⟨⟨⟨⟨hg, hcs⟩, _⟩, _⟩, _⟩ := h
  obtain ⟨hs, hr⟩ := hcs c hc
  have hg' : gershgorinOk (caseBundle cb c) = gershgorinOk cb.base := rfl
  simp only [Bundle.check, hs, hr, hg', hg, Bool.and_self]

/-- Each case: `‖K⁻¹fᵢ − ũᵢ‖₂ ≤ bᵢ` (the linear-static theorem over the shared `K`). -/
theorem case_sound (cb : CBundle) (h : check cb = true) (f : ℕ → Fin cb.base.n → ℝ)
    (hf : RhsIn cb f) {i : ℕ} (hi : i < cb.cases.size) :
    vnorm ((kMat cb.base)⁻¹ *ᵥ f i - caseVec cb i) ≤ (caseAt cb i).bound.val := by
  have := (Bundle.check_sound (caseBundle cb (caseAt cb i)) (case_check cb h (caseAt_mem cb hi))
    (f i) (fun k => hf i hi k)).2.2
  exact this

/-! ### Combinations -/

lemma combo_bound (cb : CBundle) (h : check cb = true) (f : ℕ → Fin cb.base.n → ℝ)
    (hf : RhsIn cb f) {j : ℕ} (hj : j < cb.combos.size) :
    vnorm (comboStar cb f j - comboVec cb j) ≤ (comboAt cb j).bound.val := by
  have hco : comboOk cb (comboAt cb j) = true := by
    simp only [check, Bool.and_eq_true, Array.all_eq_true_iff_forall_mem] at h
    exact h.1.1.2 _ (comboAt_mem cb hj)
  simp only [comboOk, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq, Dy.nonneg_iff,
    Dy.le_iff, val_sub, val_mul] at hco
  obtain ⟨⟨hidx, hslack⟩, hdev⟩ := hco
  set co := comboAt cb j
  set ut : ℕ → Fin cb.base.n → ℝ := fun i => (kMat cb.base)⁻¹ *ᵥ f i
  -- split: Σ cᵢ (u*ᵢ − ũᵢ) + (Σ cᵢ ũᵢ − ũ_j)
  have hsplit : comboStar cb f j - comboVec cb j =
      (co.factors.map fun p => (p.2.val : ℝ) • (ut p.1 - caseVec cb p.1)).sum +
      ((co.factors.map fun p => (p.2.val : ℝ) • caseVec cb p.1).sum - comboVec cb j) := by
    have : ∀ l : List (ℕ × Dy), (l.map fun p => (p.2.val : ℝ) • ut p.1).sum =
        (l.map fun p => (p.2.val : ℝ) • (ut p.1 - caseVec cb p.1)).sum +
          (l.map fun p => (p.2.val : ℝ) • caseVec cb p.1).sum := by
      intro l
      induction l with
      | nil => simp
      | cons a l ih => simp only [List.map_cons, List.sum_cons, ih, smul_sub]; abel
    rw [comboStar, this]
    abel
  rw [hsplit]
  -- the case part
  have h1 : vnorm (co.factors.map fun p => (p.2.val : ℝ) • (ut p.1 - caseVec cb p.1)).sum ≤
      ((linBound cb co).val : ℝ) := by
    refine (vnorm_list_sum_le _ _).trans ?_
    rw [linBound, cast_dsum_map]
    refine List.sum_le_sum fun p hp => ?_
    rw [vnorm_smul, val_mul, val_abs]
    push_cast
    exact mul_le_mul_of_nonneg_left (case_sound cb h f hf (hidx p hp)) (abs_nonneg _)
  -- the rounding part
  have h2 : vnorm ((co.factors.map fun p => (p.2.val : ℝ) • caseVec cb p.1).sum - comboVec cb j) ≤
      ((co.bound.val - (linBound cb co).val : ℚ) : ℝ) := by
    have hsq : vnorm ((co.factors.map fun p => (p.2.val : ℝ) • caseVec cb p.1).sum - comboVec cb j) ^ 2 =
        (((dev2 cb co).val : ℚ) : ℝ) := by
      rw [vnorm_sq, dev2, cast_dsum_map, list_range_sum', ← Fin.sum_univ_eq_sum_range]
      refine Finset.sum_congr rfl fun k _ => ?_
      have hsum : ∀ l : List (ℕ × Dy), (((l.map fun p => (p.2.val : ℝ) • caseVec cb p.1).sum :
          Fin cb.base.n → ℝ) k) =
          (((dsum (l.map fun p => p.2 * (caseAt cb p.1).u.getD k 0)).val : ℚ) : ℝ) := by
        intro l
        rw [cast_dsum_map]
        induction l with
        | nil => simp
        | cons a l ih =>
          simp only [List.map_cons, List.sum_cons, Pi.add_apply, ih, Pi.smul_apply, smul_eq_mul,
            caseVec, val_mul]
          push_cast
          ring
      rw [devTerm, Pi.sub_apply, hsum, val_mul, val_sub]
      simp only [comboVec, co]
      push_cast
      ring
    have hd : (((dev2 cb co).val : ℚ) : ℝ) ≤ ((co.bound.val - (linBound cb co).val : ℚ) : ℝ) ^ 2 := by
      have : (((dev2 cb co).val : ℚ) : ℝ) ≤
          (((co.bound.val - (linBound cb co).val) * (co.bound.val - (linBound cb co).val) : ℚ) : ℝ) := by
        exact_mod_cast hdev
      push_cast at this ⊢
      nlinarith [this]
    rw [← hsq] at hd
    exact abs_le_of_sq_le_sq hd (by exact_mod_cast hslack) |>.trans' (le_abs_self _)
  calc _ ≤ _ := vnorm_add_le _ _
    _ ≤ ((linBound cb co).val : ℝ) + ((co.bound.val - (linBound cb co).val : ℚ) : ℝ) := add_le_add h1 h2
    _ = co.bound.val := by push_cast; ring

/-- **Verified combination checker, displacements.** If `check cb = true` then for all
right-hand sides `fᵢ` in the cases' enclosures: every case satisfies
`‖K⁻¹fᵢ − ũᵢ‖₂ ≤ bᵢ`; every combination `j` satisfies `‖Σ cᵢ K⁻¹fᵢ − ũ_j‖₂ ≤ B_j`; and for
every DOF `k` the reported envelope `envMaxAbs[k]` is within `envBound` of the exact
`max_j |(Σ cᵢ K⁻¹fᵢ)[k]|` (every exact value is at most `envMaxAbs[k] + envBound`, and some
exact value is at least `envMaxAbs[k] − envBound`). -/
theorem check_sound_disp (cb : CBundle) (h : check cb = true) (f : ℕ → Fin cb.base.n → ℝ)
    (hf : RhsIn cb f) :
    (∀ i < cb.cases.size, vnorm ((kMat cb.base)⁻¹ *ᵥ f i - caseVec cb i) ≤ (caseAt cb i).bound.val) ∧
    (∀ j < cb.combos.size, vnorm (comboStar cb f j - comboVec cb j) ≤ (comboAt cb j).bound.val) ∧
    ∀ k : Fin cb.base.n,
      (∀ j < cb.combos.size, |comboStar cb f j k| ≤ (cb.envMaxAbs.getD k 0).val + cb.envBound.val) ∧
      ∃ j < cb.combos.size, ((cb.envMaxAbs.getD k 0).val : ℝ) - cb.envBound.val ≤ |comboStar cb f j k| := by
  refine ⟨fun i hi => case_sound cb h f hf hi, fun j hj => combo_bound cb h f hf hj, fun k => ?_⟩
  have he : envelopeOk cb = true := by
    simp only [check, Bool.and_eq_true] at h; exact h.1.2
  simp only [envelopeOk, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true,
    Array.all_eq_true_iff_forall_mem, Array.any_eq_true, Dy.le_iff, val_abs] at he
  obtain ⟨⟨_, hE⟩, hk⟩ := he
  obtain ⟨hall, j0, hj0, hany⟩ := hk k (List.mem_range.mpr k.isLt)
  -- |u*_j[k] − ũ_j[k]| ≤ B_j ≤ E
  have hclose : ∀ j < cb.combos.size, |comboStar cb f j k - comboVec cb j k| ≤ cb.envBound.val := by
    intro j hj
    have h1 := (abs_le_vnorm (comboStar cb f j - comboVec cb j) k).trans (combo_bound cb h f hf hj)
    have h2 : ((comboAt cb j).bound.val : ℝ) ≤ cb.envBound.val := by
      exact_mod_cast hE _ (comboAt_mem cb hj)
    simpa using h1.trans h2
  refine ⟨fun j hj => ?_, ⟨j0, hj0, ?_⟩⟩
  · have hu : |comboVec cb j k| ≤ (cb.envMaxAbs.getD k 0).val := by
      have := hall _ (comboAt_mem cb hj)
      simp only [comboVec]
      rw [← Rat.cast_abs]
      exact_mod_cast this
    have := abs_sub_abs_le_abs_sub (comboStar cb f j k) (comboVec cb j k)
    linarith [hclose j hj]
  · have hu : ((cb.envMaxAbs.getD k 0).val : ℝ) ≤ |comboVec cb j0 k| := by
      have : cb.combos[j0] = comboAt cb j0 := by
        rw [comboAt, Array.getD_eq_getD_getElem?, Array.getElem?_eq_getElem hj0]; rfl
      simp only [comboVec]
      rw [← Rat.cast_abs, ← this]
      exact_mod_cast hany
    have := abs_sub_abs_le_abs_sub (comboVec cb j0 k) (comboStar cb f j0 k)
    rw [abs_sub_comm] at this
    linarith [hclose j0 hj0]

/-! ### Other quantities -/

/-- **Interval linear combination.** If every exact case value `e i q` is within the
(assumed) case bound of the reported case value, then every exact combination value
`Σ cᵢ e i q` is within `B_{j,q}` of the reported combination value, and `B_{j,q} ≤ E_q`. -/
theorem check_sound_quantities (cb : CBundle) (h : check cb = true) (e : ℕ → ℕ → ℝ)
    (he : ∀ i < cb.cases.size, ∀ q < cb.nq,
      |e i q - (qAt cb.caseVals i q).val| ≤ (qAt cb.caseBounds i q).val) :
    ∀ j < cb.combos.size, ∀ q < cb.nq,
      |((comboAt cb j).factors.map fun p => (p.2.val : ℝ) * e p.1 q).sum - (qAt cb.comboVals j q).val| ≤
        (qAt cb.comboBounds j q).val ∧
      ((qAt cb.comboBounds j q).val : ℝ) ≤ (cb.envQBounds.getD q 0).val := by
  intro j hj q hq
  have hco : comboOk cb (comboAt cb j) = true := by
    simp only [check, Bool.and_eq_true, Array.all_eq_true_iff_forall_mem] at h
    exact h.1.1.2 _ (comboAt_mem cb hj)
  simp only [comboOk, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at hco
  have hidx := hco.1.1
  have hq' : quantityOk cb j q = true := by
    simp only [check, quantitiesOk, Bool.and_eq_true, List.all_eq_true] at h
    exact h.2 j (List.mem_range.mpr hj) q (List.mem_range.mpr hq)
  simp only [quantityOk, Bool.and_eq_true, Dy.le_iff, val_add, val_abs, val_sub] at hq'
  obtain ⟨h1, h2⟩ := hq'
  refine ⟨?_, by exact_mod_cast h2⟩
  set co := comboAt cb j
  have hsplit : ∀ l : List (ℕ × Dy), (∀ p ∈ l, p.1 < cb.cases.size) →
      |(l.map fun p => (p.2.val : ℝ) * e p.1 q).sum -
          (l.map fun p => (((p.2 * qAt cb.caseVals p.1 q).val : ℚ) : ℝ)).sum| ≤
        (l.map fun p => (((p.2.abs * qAt cb.caseBounds p.1 q).val : ℚ) : ℝ)).sum := by
    intro l
    induction l with
    | nil => simp
    | cons a l ih =>
      intro hl
      simp only [List.map_cons, List.sum_cons]
      have ha := he a.1 (hl a (by simp)) q hq
      have hrest := ih fun p hp => hl p (by simp [hp])
      have hterm : |(a.2.val : ℝ) * e a.1 q - (((a.2 * qAt cb.caseVals a.1 q).val : ℚ) : ℝ)| ≤
          (((a.2.abs * qAt cb.caseBounds a.1 q).val : ℚ) : ℝ) := by
        rw [val_mul, val_mul, val_abs]
        push_cast
        rw [← mul_sub, abs_mul]
        exact mul_le_mul_of_nonneg_left ha (abs_nonneg _)
      calc _ = |((a.2.val : ℝ) * e a.1 q - (((a.2 * qAt cb.caseVals a.1 q).val : ℚ) : ℝ)) +
            ((l.map fun p => (p.2.val : ℝ) * e p.1 q).sum -
              (l.map fun p => (((p.2 * qAt cb.caseVals p.1 q).val : ℚ) : ℝ)).sum)| := by
            congr 1; ring
        _ ≤ _ := (abs_add_le _ _).trans (add_le_add hterm hrest)
  have hl := hsplit co.factors hidx
  have h1' : (((dsum (co.factors.map fun p => p.2.abs * qAt cb.caseBounds p.1 q)).val : ℚ) : ℝ) +
      |(((dsum (co.factors.map fun p => p.2 * qAt cb.caseVals p.1 q)).val : ℚ) : ℝ) -
        (qAt cb.comboVals j q).val| ≤ (qAt cb.comboBounds j q).val := by
    rw [← Rat.cast_sub, ← Rat.cast_abs, ← Rat.cast_add]
    exact_mod_cast h1
  rw [cast_dsum_map, cast_dsum_map] at h1'
  have := abs_sub_le ((co.factors.map fun p => (p.2.val : ℝ) * e p.1 q).sum)
    (co.factors.map fun p => (((p.2 * qAt cb.caseVals p.1 q).val : ℚ) : ℝ)).sum
    ((qAt cb.comboVals j q).val : ℝ)
  linarith

end Certify.Combo
