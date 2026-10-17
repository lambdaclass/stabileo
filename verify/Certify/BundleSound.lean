/-
Soundness of the executable bundle checker (`Certify.BundleCheck`).

`check d = true` implies the conclusion of `certified_error_bound_gram` for the real
matrices the bundle denotes (`kMat d`, `lMat d`, `uVec d`) and every right-hand side `f`
inside the bundle's enclosure: `K` is invertible and `‖K⁻¹f − ũ‖₂ ≤ bound`.

The proof instantiates `certified_error_bound_gram` with point intervals (the residual
`R = K − L Lᵀ` is computed exactly, so its enclosure is `[Rᵢⱼ, Rᵢⱼ]`), after showing that
* the dyadic arithmetic is exact (`Dy.val_add`, …) and so is the fixed-point encoding
  (`intAt_val`);
* each dense column of `resCol` is the exact residual column (`resCol_val`), and the
  Gershgorin array holds exactly `Rₜₜ − Σ_{j≠t} |Rₜⱼ|` (`gershSums_val`);
* the hash-map computation of `K ũ` equals the matrix-vector product (`mulVec_eq`).
-/
import Certify.Gram
import Certify.BundleCheck

open Matrix Finset

namespace Certify.Bundle

open Certify Certify.Interval

/-! ### Dyadic arithmetic is exact -/

namespace Dy

/-- The rational `m · 2^e`. -/
def val (a : Dy) : ℚ := a.m * (2 : ℚ) ^ a.e

lemma two_zpow_pos (e : ℤ) : (0 : ℚ) < (2 : ℚ) ^ e := zpow_pos (by norm_num) e

lemma shift_val (m : ℤ) (k : ℕ) (e : ℤ) :
    ((shift m k : ℤ) : ℚ) * (2 : ℚ) ^ e = m * (2 : ℚ) ^ (e + k) := by
  rw [shift, zpow_add₀ (by norm_num : (2 : ℚ) ≠ 0), zpow_natCast]
  push_cast
  ring

@[simp] lemma val_zero : (0 : Dy).val = 0 := by
  show ((0 : ℤ) : ℚ) * (2 : ℚ) ^ (0 : ℤ) = 0
  simp

lemma val_add (a b : Dy) : (a + b).val = a.val + b.val := by
  show (Dy.add a b).val = _
  unfold Dy.add
  split_ifs with h1 h2 h3 h4
  · simp [val, h1]
  · simp [val, h2]
  · simp only [val, Int.cast_add, add_mul, h3]
  · simp only [val, Int.cast_add, add_mul, shift_val]
    rw [Int.toNat_of_nonneg (by omega)]
    congr 2
    ring_nf
  · simp only [val, Int.cast_add, add_mul, shift_val]
    rw [Int.toNat_of_nonneg (by omega)]
    congr 2
    ring_nf

lemma val_neg (a : Dy) : (-a).val = -a.val := by
  show (Dy.neg a).val = _
  simp [Dy.neg, val]

lemma val_sub (a b : Dy) : (a - b).val = a.val - b.val := by
  show (Dy.add a (Dy.neg b)).val = _
  rw [show Dy.add a (Dy.neg b) = a + -b from rfl, val_add, val_neg, sub_eq_add_neg]

lemma val_mul (a b : Dy) : (a * b).val = a.val * b.val := by
  show (Dy.mul a b).val = _
  simp only [Dy.mul, val, Int.cast_mul, zpow_add₀ (by norm_num : (2 : ℚ) ≠ 0)]
  ring

lemma val_abs (a : Dy) : a.abs.val = |a.val| := by
  simp only [Dy.abs, val, abs_mul, abs_of_pos (two_zpow_pos a.e)]
  congr 1
  split_ifs with h
  · rw [abs_of_neg (by exact_mod_cast h)]; push_cast; ring
  · rw [abs_of_nonneg (by exact_mod_cast not_lt.mp h)]

lemma nonneg_iff (a : Dy) : a.nonneg = true ↔ 0 ≤ a.val := by
  simp only [nonneg, decide_eq_true_eq, val]
  rw [mul_nonneg_iff_of_pos_right (two_zpow_pos a.e)]
  exact_mod_cast Iff.rfl

lemma pos_iff (a : Dy) : a.pos = true ↔ 0 < a.val := by
  simp only [pos, decide_eq_true_eq, val]
  rw [mul_pos_iff_of_pos_right (two_zpow_pos a.e)]
  exact_mod_cast Iff.rfl

lemma le_iff (a b : Dy) : Dy.le a b = true ↔ a.val ≤ b.val := by
  rw [Dy.le, nonneg_iff, val_sub, sub_nonneg]

lemma val_max (a b : Dy) : (Dy.max a b).val = Max.max a.val b.val := by
  unfold Dy.max
  split_ifs with h
  · exact (max_eq_right ((le_iff a b).mp h)).symm
  · exact (max_eq_left (le_of_lt (not_le.mp (mt (le_iff a b).mpr h)))).symm

lemma val_foldr_add (l : List Dy) : (l.foldr (· + ·) 0).val = (l.map val).sum := by
  induction l with
  | nil => simp
  | cons x l ih => simp [val_add, ih]

end Dy

open Dy (val val_add val_neg val_sub val_mul val_abs val_max)

/-! ### Denotation -/

/-- Contribution of entry `e = (a, b, v)` of `kEnt` to `K i j`. -/
def kTerm (i j : ℕ) (e : ℕ × ℕ × Dy) : ℚ :=
  (if (e.1, e.2.1) = (i, j) then e.2.2.val else 0) +
    (if e.1 = e.2.1 then 0 else if (e.2.1, e.1) = (i, j) then e.2.2.val else 0)

/-- Entry `(i, j)` of the symmetric `K` denoted by the bundle. -/
def kAt (d : Bundle) (i j : ℕ) : ℚ := (d.kEnt.map (kTerm i j)).sum

/-- Entry `(i, c)` of `L'` (original row numbering): `Σ v` over the entries `(a, v)` of
column `c` with `perm[a] = i`. -/
def colAt (perm : Array ℕ) (i : ℕ) (col : List (ℕ × Dy)) : ℚ :=
  (col.map fun p => if perm.getD p.1 0 = i then p.2.val else 0).sum

def lAt (d : Bundle) (i c : ℕ) : ℚ := colAt d.perm i (d.lCols.getD c [])

/-- The real matrix `K` denoted by the bundle. -/
noncomputable def kMat (d : Bundle) : Matrix (Fin d.n) (Fin d.n) ℝ := fun i j => (kAt d i j : ℝ)

/-- The real factor `L'` (rows un-permuted) denoted by the bundle. -/
noncomputable def lMat (d : Bundle) : Matrix (Fin d.n) (Fin d.n) ℝ := fun i c => (lAt d i c : ℝ)

/-- The computed solution `ũ`. -/
noncomputable def uVec (d : Bundle) : Fin d.n → ℝ := fun i => ((d.u.getD i 0).val : ℝ)

/-- The enclosure of the right-hand side. -/
noncomputable def fLoVec (d : Bundle) : Fin d.n → ℝ := fun i => ((d.fLo.getD i 0).val : ℝ)
noncomputable def fHiVec (d : Bundle) : Fin d.n → ℝ := fun i => ((d.fHi.getD i 0).val : ℝ)

/-! ### Hash-map accumulation (for `K ũ`) -/

section Accum

variable {κ α : Type} [BEq κ] [Hashable κ]

lemma getD_addTo [LawfulBEq κ] (m : Std.HashMap κ Dy) (k a : κ) (v : Dy) :
    ((addTo m k v).getD a 0).val = (m.getD a 0).val + if k == a then v.val else 0 := by
  unfold addTo
  rw [Std.HashMap.getD_alter]
  by_cases h : k = a
  · subst h; simp [val_add, Std.HashMap.getD_eq_getD_getElem?]
  · simp [h]

/-- A left fold whose steps each add `c x` at key `k` adds `Σ c x` at `k`. -/
lemma foldl_getD (F : Std.HashMap κ Dy → α → Std.HashMap κ Dy) (c : α → ℚ) (k : κ)
    (hF : ∀ m x, ((F m x).getD k 0).val = (m.getD k 0).val + c x) :
    ∀ (l : List α) (m : Std.HashMap κ Dy),
      ((l.foldl F m).getD k 0).val = (m.getD k 0).val + (l.map c).sum
  | [], m => by simp
  | x :: l, m => by
    rw [List.foldl_cons, foldl_getD F c k hF l, hF, List.map_cons, List.sum_cons]; ring

end Accum

/-- On the lower triangle, an entry's contribution is its `(max, min)` key. -/
lemma kTerm_low {i j : ℕ} (hji : j ≤ i) (e : ℕ × ℕ × Dy) :
    kTerm i j e = if (max e.1 e.2.1, min e.1 e.2.1) = (i, j) then e.2.2.val else 0 := by
  obtain ⟨a, b, v⟩ := e
  show kTerm i j (a, b, v) = if (max a b, min a b) = (i, j) then v.val else 0
  rcases lt_trichotomy a b with h | h | h
  · rw [max_eq_right h.le, min_eq_left h.le]
    simp only [kTerm, Prod.mk.injEq, h.ne, ite_false]
    split_ifs <;> first | (exfalso; omega) | ring
  · subst h
    simp [kTerm]
  · rw [max_eq_left h.le, min_eq_right h.le]
    simp only [kTerm, Prod.mk.injEq, h.ne', ite_false]
    split_ifs <;> first | (exfalso; omega) | ring


/-! ### `K` is symmetric; the real residual -/

lemma kTerm_symm (i j : ℕ) (e : ℕ × ℕ × Dy) : kTerm i j e = kTerm j i e := by
  obtain ⟨a, b, v⟩ := e
  simp only [kTerm, Prod.mk.injEq]
  by_cases hab : a = b
  · subst hab
    by_cases h1 : a = i <;> by_cases h2 : a = j <;> simp_all
  · by_cases h1 : a = i <;> by_cases h2 : b = j <;> by_cases h3 : a = j <;> by_cases h4 : b = i <;>
      simp_all

lemma kAt_symm (d : Bundle) (i j : ℕ) : kAt d i j = kAt d j i := by
  unfold kAt
  congr 1
  exact List.map_congr_left fun e _ => kTerm_symm i j e

/-- The exact residual entry `(K − L' L'ᵀ)ᵢⱼ`. -/
def rq (d : Bundle) (i j : ℕ) : ℚ :=
  kAt d i j - ((List.range d.n).map fun c => lAt d i c * lAt d j c).sum

lemma rq_symm (d : Bundle) (i j : ℕ) : rq d i j = rq d j i := by
  unfold rq
  rw [kAt_symm d i j]
  simp only [mul_comm]

lemma list_range_sum {n : ℕ} (f : ℕ → ℚ) : ((List.range n).map f).sum = ∑ i : Fin n, f i := by
  rw [Fin.sum_univ_eq_sum_range]
  simp [Finset.sum_eq_multiset_sum, Finset.range_val, Multiset.range]

lemma list_range_sum' {M : Type} [AddCommMonoid M] (n : ℕ) (f : ℕ → M) :
    ((List.range n).map f).sum = ∑ i ∈ Finset.range n, f i := by
  simp [Finset.sum_eq_multiset_sum, Finset.range_val, Multiset.range]

lemma list_range'_sum {M : Type} [AddCommMonoid M] (a k : ℕ) (f : ℕ → M) :
    ((List.range' a k).map f).sum = ∑ i ∈ Finset.Ico a (a + k), f i := by
  rw [List.range'_eq_map_range, List.map_map, list_range_sum', Finset.sum_Ico_eq_sum_range]
  simp

/-- The exact residual `symPart K − L' L'ᵀ`, entrywise. -/
lemma resid_eq (d : Bundle) (i j : Fin d.n) :
    (symPart (kMat d) - lMat d * (lMat d)ᵀ) i j = (rq d i j : ℝ) := by
  rw [Matrix.sub_apply, symPart_apply, Matrix.mul_apply, rq, list_range_sum]
  simp only [kMat, lMat, Matrix.transpose_apply]
  rw [kAt_symm d j i]
  push_cast
  ring

/-! ### Fixed point -/

lemma intAt_val {E : ℤ} {x : Dy} (h : E ≤ x.e) : ((intAt E x : ℤ) : ℚ) * 2 ^ E = x.val := by
  unfold intAt
  rw [Dy.shift_val, Int.toNat_of_nonneg (by omega), show E + (x.e - E) = x.e by ring]
  rfl

lemma foldl_min_le {α : Type} (f : α → ℤ) : ∀ (l : List α) (acc : ℤ),
    l.foldl (fun a x => min a (f x)) acc ≤ acc ∧ ∀ x ∈ l, l.foldl (fun a x => min a (f x)) acc ≤ f x
  | [], acc => by simp
  | x :: l, acc => by
    obtain ⟨h1, h2⟩ := foldl_min_le f l (min acc (f x))
    refine ⟨h1.trans (min_le_left _ _), fun y hy => ?_⟩
    rcases List.mem_cons.mp hy with rfl | hy
    · exact h1.trans (min_le_right _ _)
    · exact h2 y hy

lemma minExpL_le (d : Bundle) {col : List (ℕ × Dy)} (hc : col ∈ d.lCols.toList) {p : ℕ × Dy}
    (hp : p ∈ col) : minExpL d ≤ p.2.e :=
  (foldl_min_le (fun p : ℕ × Dy => p.2.e) _ 0).2 p (List.mem_flatten.mpr ⟨col, hc, hp⟩)

lemma minExpK_le (d : Bundle) {e : ℕ × ℕ × Dy} (he : e ∈ d.kEnt) : minExpK d ≤ e.2.2.e :=
  (foldl_min_le (fun e : ℕ × ℕ × Dy => e.2.2.e) _ 0).2 e he

/-! ### Array accumulation -/

lemma getD_addAt (w : Array ℤ) (k i : ℕ) (v : ℤ) (hi : i < w.size) :
    (addAt w k v).getD i 0 = w.getD i 0 + if k = i then v else 0 := by
  unfold addAt
  simp only [Array.getD_eq_getD_getElem?, Array.getElem?_modify, Array.getElem?_eq_getElem hi]
  split_ifs <;> simp

lemma size_addAt (w : Array ℤ) (k : ℕ) (v : ℤ) : (addAt w k v).size = w.size := Array.size_modify

/-- A left fold whose steps keep the size `n` and add `c x` at index `i`. -/
lemma foldl_arr {α : Type} {n : ℕ} (F : Array ℤ → α → Array ℤ) (c : α → ℤ) (i : ℕ)
    (hF : ∀ w x, w.size = n → (F w x).size = n ∧ (F w x).getD i 0 = w.getD i 0 + c x) :
    ∀ (l : List α) (w : Array ℤ), w.size = n →
      (l.foldl F w).size = n ∧ (l.foldl F w).getD i 0 = w.getD i 0 + (l.map c).sum
  | [], w, hw => by simp [hw]
  | x :: l, w, hw => by
    obtain ⟨h1, h2⟩ := hF w x hw
    obtain ⟨h3, h4⟩ := foldl_arr F c i hF l (F w x) h1
    refine ⟨h3, ?_⟩
    rw [List.foldl_cons, h4, h2, List.map_cons, List.sum_cons]; ring

lemma sum_map_neg' {β : Type} (l : List β) (g : β → ℚ) : (l.map fun x => -g x).sum = -(l.map g).sum := by
  induction l with
  | nil => simp
  | cons x l ih => simp only [List.map_cons, List.sum_cons, ih]; ring

lemma cast_sum_mul {α : Type} (l : List α) (f : α → ℤ) (c : ℚ) :
    (((l.map f).sum : ℤ) : ℚ) * c = (l.map fun x => (f x : ℚ) * c).sum := by
  induction l with
  | nil => simp
  | cons x l ih => simp only [List.map_cons, List.sum_cons, Int.cast_add, add_mul, ih]

/-! ### Buckets -/

lemma buckets_sum_aux {β M : Type} [AddCommMonoid M] {n k : ℕ} (hk : k < n) (g : β → M) :
    ∀ (l : List (ℕ × β)) (A : Array (List β)), A.size = n →
      (((l.foldl (fun A p => A.modify p.1 (List.cons p.2)) A).getD k []).map g).sum =
        ((A.getD k []).map g).sum + (l.map fun p => if p.1 = k then g p.2 else 0).sum
  | [], A, _ => by simp
  | p :: l, A, hA => by
    rw [List.foldl_cons, buckets_sum_aux hk g l _ (by simp [hA])]
    have hkA : k < A.size := hA ▸ hk
    simp only [Array.getD_eq_getD_getElem?, Array.getElem?_modify, Array.getElem?_eq_getElem hkA,
      List.map_cons, List.sum_cons]
    split_ifs <;> simp [add_left_comm, add_assoc]

lemma buckets_sum {β M : Type} [AddCommMonoid M] (n : ℕ) (l : List (ℕ × β)) {k : ℕ} (hk : k < n)
    (g : β → M) :
    (((buckets n l).getD k []).map g).sum = (l.map fun p => if p.1 = k then g p.2 else 0).sum := by
  unfold buckets
  rw [buckets_sum_aux hk g l _ (by simp)]
  have : (Array.replicate n ([] : List β)).getD k [] = [] := by
    simp [hk]
  simp [this]

lemma sum_flatMap {α β M : Type} [AddCommMonoid M] (l : List α) (f : α → List β) (g : β → M) :
    ((l.flatMap f).map g).sum = (l.map fun x => ((f x).map g).sum).sum := by
  induction l with
  | nil => simp
  | cons x l ih => simp [List.flatMap_cons, ih]

/-! ### The residual columns -/

lemma prep_lc_getD (d : Bundle) (c : ℕ) :
    (prep d).lc.getD c [] =
      (d.lCols.getD c []).map fun p => (d.perm.getD p.1 0, intAt (minExpL d) p.2) := by
  simp only [prep, Array.getD_eq_getD_getElem?, Array.getElem?_map]
  cases d.lCols[c]? <;> simp

/-- Column `j` of `resCol`, as sums. -/
lemma resCol_getD (n : ℕ) (P : Prep) (j : ℕ) {i : ℕ} (hi : i < n) :
    (resCol n P j).size = n ∧ (resCol n P j).getD i 0 =
      ((P.kLow.getD j []).map fun p => if p.1 = i then p.2 else 0).sum +
      ((P.lr.getD j []).map fun r =>
        ((P.lc.getD r.1 []).map fun q => if j ≤ q.1 ∧ q.1 = i then q.2 * r.2 else 0).sum).sum := by
  have hstep : ∀ w (p : ℕ × ℤ), w.size = n →
      (addAt w p.1 p.2).size = n ∧ (addAt w p.1 p.2).getD i 0 = w.getD i 0 + if p.1 = i then p.2 else 0 :=
    fun w p hw => ⟨by rw [size_addAt, hw], getD_addAt w _ _ _ (hw ▸ hi)⟩
  have hinner : ∀ (r : ℕ × ℤ) w, w.size = n →
      ((P.lc.getD r.1 []).foldl (fun w q => if j ≤ q.1 then addAt w q.1 (q.2 * r.2) else w) w).size = n ∧
      ((P.lc.getD r.1 []).foldl (fun w q => if j ≤ q.1 then addAt w q.1 (q.2 * r.2) else w) w).getD i 0 =
        w.getD i 0 + ((P.lc.getD r.1 []).map fun q => if j ≤ q.1 ∧ q.1 = i then q.2 * r.2 else 0).sum := by
    intro r w hw
    refine foldl_arr _ _ i (fun w q hw => ?_) _ w hw
    by_cases hq : j ≤ q.1
    · simp only [hq, ite_true, true_and]
      exact ⟨by rw [size_addAt, hw], getD_addAt w _ _ _ (hw ▸ hi)⟩
    · simp [hq, hw]
  have hK0 := foldl_arr (fun w (p : ℕ × ℤ) => addAt w p.1 p.2) (fun p => if p.1 = i then p.2 else 0) i
    hstep (P.kLow.getD j []) (Array.replicate n 0) (by simp)
  have hL0 := foldl_arr _ _ i (fun w r hw => hinner r w hw) (P.lr.getD j []) _ hK0.1
  refine ⟨hL0.1, ?_⟩
  unfold resCol
  rw [hL0.2, hK0.2]
  simp [Array.getD_eq_getD_getElem?, hi]

/-- The fixed-point column `j` of `resCol` is the exact residual (rows `i ≥ j`). -/
lemma resCol_val (d : Bundle) (hlc : d.lCols.size = d.n) {i j : ℕ} (hji : j ≤ i) (hi : i < d.n) :
    ((resCol d.n (prep d) j).getD i 0 : ℚ) * 2 ^ (prep d).E2 = rq d i j := by
  have hj : j < d.n := lt_of_le_of_lt hji hi
  set E := minExpL d
  set E2 := min (2 * E) (minExpK d)
  have hE2 : (prep d).E2 = E2 := rfl
  set s := (2 * E - E2).toNat
  have hs : (s : ℤ) = 2 * E - E2 := Int.toNat_of_nonneg (by omega)
  rw [(resCol_getD d.n (prep d) j hi).2, hE2, Int.cast_add, add_mul]
  have hK : (((((prep d).kLow.getD j []).map fun p => if p.1 = i then p.2 else 0).sum : ℤ) : ℚ) * 2 ^ E2 =
      kAt d i j := by
    have hk : (prep d).kLow =
        buckets d.n (d.kEnt.map fun e => (min e.1 e.2.1, (max e.1 e.2.1, intAt E2 e.2.2))) := rfl
    rw [cast_sum_mul, hk]
    rw [show (fun p : ℕ × ℤ => ((if p.1 = i then p.2 else 0 : ℤ) : ℚ) * 2 ^ E2) =
      (fun p : ℕ × ℤ => if p.1 = i then (p.2 : ℚ) * 2 ^ E2 else 0) by
        funext p; split_ifs <;> simp]
    rw [buckets_sum _ _ hj, List.map_map, kAt]
    congr 1
    refine List.map_congr_left fun e he => ?_
    rw [kTerm_low hji]
    simp only [Function.comp, Prod.mk.injEq]
    by_cases h1 : min e.1 e.2.1 = j <;> by_cases h2 : max e.1 e.2.1 = i <;> simp [h1, h2]
    exact intAt_val ((min_le_right _ _).trans (minExpK_le d he))
  -- the `L` part
  have hcol : ∀ c k, (((prep d).lc.getD c []).map fun q => if q.1 = k then (q.2 : ℚ) * 2 ^ E else 0).sum =
      lAt d k c := by
    intro c k
    rw [prep_lc_getD, List.map_map, lAt, colAt]
    have hmem : ∀ p ∈ d.lCols.getD c [], minExpL d ≤ p.2.e := by
      intro p hp
      simp only [Array.getD_eq_getD_getElem?] at hp
      cases hc : d.lCols[c]? with
      | none => rw [hc] at hp; simp at hp
      | some col =>
        rw [hc] at hp
        have : col ∈ d.lCols := Array.mem_of_getElem? hc
        exact minExpL_le d (by simpa using this) hp
    congr 1
    refine List.map_congr_left fun p hp => ?_
    simp only [Function.comp]
    split_ifs
    · exact intAt_val (hmem p hp)
    · rfl
  have hshift : ∀ x : ℤ, ((Dy.shift x s : ℤ) : ℚ) * 2 ^ E2 = (x : ℚ) * 2 ^ E * 2 ^ E := by
    intro x
    rw [Dy.shift_val, hs, show E2 + (2 * E - E2) = E + E by ring, zpow_add₀ (by norm_num : (2 : ℚ) ≠ 0)]
    ring
  set G : ℕ × ℤ → ℚ := fun r =>
    (((prep d).lc.getD r.1 []).map fun q => if q.1 = i then (q.2 : ℚ) * r.2 * 2 ^ E2 else 0).sum
  have hL : (((((prep d).lr.getD j []).map fun r => (((prep d).lc.getD r.1 []).map
      fun q => if j ≤ q.1 ∧ q.1 = i then q.2 * r.2 else 0).sum).sum : ℤ) : ℚ) * 2 ^ E2 =
      -((List.range d.n).map fun c => lAt d i c * lAt d j c).sum := by
    have h1 : (((((prep d).lr.getD j []).map fun r => (((prep d).lc.getD r.1 []).map
        fun q => if j ≤ q.1 ∧ q.1 = i then q.2 * r.2 else 0).sum).sum : ℤ) : ℚ) * 2 ^ E2 =
        (((prep d).lr.getD j []).map G).sum := by
      rw [cast_sum_mul]
      congr 1
      refine List.map_congr_left fun r _ => ?_
      rw [cast_sum_mul]
      simp only [G]
      congr 1
      refine List.map_congr_left fun q _ => ?_
      by_cases hq : q.1 = i
      · simp [hq, hji]
      · simp [hq]
    rw [h1]
    have hlr : (prep d).lr = buckets d.n ((List.range (prep d).lc.size).flatMap fun c =>
        ((prep d).lc.getD c []).map fun q => (q.1, (c, -Dy.shift q.2 s))) := rfl
    have hsize : (prep d).lc.size = d.n := by simp [prep, hlc]
    rw [hlr, buckets_sum _ _ hj G, sum_flatMap, hsize, ← sum_map_neg']
    congr 1
    refine List.map_congr_left fun c _ => ?_
    rw [← hcol c i, ← hcol c j, List.map_map, mul_comm, ← List.sum_map_mul_right, ← sum_map_neg']
    congr 1
    refine List.map_congr_left fun q _ => ?_
    simp only [Function.comp, G]
    split_ifs with hq
    · rw [mul_comm, ← List.sum_map_mul_right, ← sum_map_neg']
      congr 1
      refine List.map_congr_left fun q' _ => ?_
      split_ifs
      · rw [mul_assoc, Int.cast_neg, neg_mul, mul_neg, hshift]; ring
      · simp
    · simp
  rw [hK, hL, rq]
  ring

/-! ### Gershgorin sums -/

/-- What column `j` adds to row `t` of `g`, per stored index `i > j`. -/
def gTerm (w : Array ℤ) (j t i : ℕ) : ℤ :=
  if w.getD i 0 = 0 then 0
  else (if i = t then -(((w.getD i 0).natAbs : ℕ) : ℤ) else 0) +
    (if j = t then -(((w.getD i 0).natAbs : ℕ) : ℤ) else 0)

lemma gershCol_getD (n : ℕ) (P : Prep) (j : ℕ) {t : ℕ} (ht : t < n) (g : Array ℤ) (hg : g.size = n) :
    (gershCol n P g j).size = n ∧ (gershCol n P g j).getD t 0 =
      g.getD t 0 + ((if j = t then (resCol n P j).getD j 0 else 0) +
        ((List.range' (j + 1) (n - (j + 1))).map (gTerm (resCol n P j) j t)).sum) := by
  set w := resCol n P j
  have h0 : (addAt g j (w.getD j 0)).size = n := by rw [size_addAt, hg]
  have h0' := getD_addAt g j t (w.getD j 0) (hg ▸ ht)
  have := foldl_arr (n := n) (fun g i => let v := w.getD i 0
      if v = 0 then g else addAt (addAt g i (-(v.natAbs : Int))) j (-(v.natAbs : Int)))
    (gTerm w j t) t (fun g i hg => ?_) (List.range' (j + 1) (n - (j + 1))) _ h0
  · refine ⟨this.1, ?_⟩
    unfold gershCol
    rw [this.2, h0']
    ring
  · by_cases hv : w.getD i 0 = 0
    · simp [gTerm, hv, hg]
    · have hs1 : (addAt g i (-(((w.getD i 0).natAbs : ℕ) : ℤ))).size = n := by rw [size_addAt, hg]
      simp only [gTerm, hv, ite_false]
      refine ⟨by rw [size_addAt, hs1], ?_⟩
      rw [getD_addAt _ _ _ _ (hs1 ▸ ht), getD_addAt _ _ _ _ (hg ▸ ht)]
      ring

lemma gershSums_getD (d : Bundle) (P : Prep) {t : ℕ} (ht : t < d.n) :
    (gershSums d P).getD t 0 = ((List.range d.n).map fun j =>
      (if j = t then (resCol d.n P j).getD j 0 else 0) +
        ((List.range' (j + 1) (d.n - (j + 1))).map (gTerm (resCol d.n P j) j t)).sum).sum := by
  have := foldl_arr (n := d.n) (gershCol d.n P) _ t
    (fun g j hg => gershCol_getD d.n P j ht g hg) (List.range d.n) (Array.replicate d.n 0) (by simp)
  unfold gershSums
  rw [this.2]
  simp [Array.getD_eq_getD_getElem?, ht]

lemma sum_erase_split {M : Type} [AddCommGroup M] {n t : ℕ} (ht : t < n) (f : ℕ → M) :
    ∑ j ∈ (Finset.range n).erase t, f j = ∑ j ∈ Finset.range t, f j + ∑ j ∈ Finset.Ico (t + 1) n, f j := by
  rw [Finset.sum_erase_eq_sub (Finset.mem_range.mpr ht), ← Finset.sum_range_add_sum_Ico f ht,
    Finset.sum_range_succ]
  abel

/-- `g` holds the exact Gershgorin quantities: `gₜ · 2^E2 = Rₜₜ − Σ_{j≠t} |Rₜⱼ|`. -/
lemma gershSums_val (d : Bundle) (hlc : d.lCols.size = d.n) {t : ℕ} (ht : t < d.n) :
    ((gershSums d (prep d)).getD t 0 : ℚ) * 2 ^ (prep d).E2 =
      rq d t t - ∑ j ∈ (Finset.range d.n).erase t, |rq d t j| := by
  set E2 := (prep d).E2
  set w : ℕ → Array ℤ := fun j => resCol d.n (prep d) j
  have hw : ∀ {i j}, j ≤ i → i < d.n → ((w j).getD i 0 : ℚ) * 2 ^ E2 = rq d i j :=
    fun hji hi => resCol_val d hlc hji hi
  have hterm : ∀ j, j < d.n → ∀ i ∈ Finset.Ico (j + 1) d.n,
      ((gTerm (w j) j t i : ℤ) : ℚ) * 2 ^ E2 =
        -((if i = t then |rq d i j| else 0) + (if j = t then |rq d i j| else 0)) := by
    intro j hj i hi
    have hi' := Finset.mem_Ico.mp hi
    have habs : |(((w j).getD i 0 : ℤ) : ℚ)| * 2 ^ E2 = |rq d i j| := by
      rw [← hw (by omega) hi'.2, abs_mul, abs_of_pos (Dy.two_zpow_pos E2)]
    unfold gTerm
    by_cases hv : (w j).getD i 0 = 0
    · have : rq d i j = 0 := by rw [← hw (by omega) hi'.2, hv]; simp
      simp [hv, this]
    · simp only [hv, ite_false]
      push_cast
      split_ifs <;> linarith [habs]
  rw [gershSums_getD d (prep d) ht, cast_sum_mul, list_range_sum']
  have hrow : ∀ j ∈ Finset.range d.n,
      (((if j = t then (w j).getD j 0 else 0) +
        ((List.range' (j + 1) (d.n - (j + 1))).map (gTerm (w j) j t)).sum : ℤ) : ℚ) * 2 ^ E2 =
      (if j = t then rq d j j else 0) - ∑ i ∈ Finset.Ico (j + 1) d.n,
        ((if i = t then |rq d i j| else 0) + (if j = t then |rq d i j| else 0)) := by
    intro j hj
    have hj' := Finset.mem_range.mp hj
    rw [Int.cast_add, add_mul, cast_sum_mul, list_range'_sum,
      show j + 1 + (d.n - (j + 1)) = d.n by omega, Finset.sum_congr rfl (hterm j hj'),
      Finset.sum_neg_distrib]
    split_ifs with h
    · subst h; rw [hw le_rfl hj']; ring
    · simp
  rw [Finset.sum_congr rfl hrow, Finset.sum_sub_distrib, Finset.sum_ite_eq' (Finset.range d.n) t]
  simp only [Finset.mem_range, ht, ite_true]
  have hA : ∀ j ∈ Finset.range d.n, ∑ i ∈ Finset.Ico (j + 1) d.n,
      ((if i = t then |rq d i j| else 0) + (if j = t then |rq d i j| else 0)) =
      (if j < t then |rq d t j| else 0) +
        (if j = t then ∑ i ∈ Finset.Ico (t + 1) d.n, |rq d i t| else 0) := by
    intro j _
    rw [Finset.sum_add_distrib, Finset.sum_ite_eq']
    congr 1
    · simp only [Finset.mem_Ico]
      split_ifs <;> first | rfl | (exfalso; omega)
    · split_ifs with h
      · subst h; rfl
      · simp
  rw [Finset.sum_congr rfl hA, Finset.sum_add_distrib, Finset.sum_ite_eq' (Finset.range d.n) t]
  simp only [Finset.mem_range, ht, ite_true]
  rw [← Finset.sum_filter,
    show (Finset.range d.n).filter (· < t) = Finset.range t by
      ext j; simp only [Finset.mem_filter, Finset.mem_range]; omega,
    sum_erase_split ht]
  rw [Finset.sum_congr rfl fun i (_ : i ∈ Finset.Ico (t + 1) d.n) => by rw [rq_symm d i t]]
/-! ### `K ũ` and the residual norm -/

/-- Contribution of entry `e = (a, b, v)` to `(K ũ)ᵢ`. -/
def kuTerm (u : Array Dy) (i : ℕ) (e : ℕ × ℕ × Dy) : ℚ :=
  (if e.1 = i then e.2.2.val * (u.getD e.2.1 0).val else 0) +
    (if e.1 = e.2.1 then 0 else if e.2.1 = i then e.2.2.val * (u.getD e.1 0).val else 0)

lemma kuMap_getD (d : Bundle) (i : ℕ) :
    ((kuMap d).getD i 0).val = (d.kEnt.map (kuTerm d.u i)).sum := by
  unfold kuMap
  rw [foldl_getD _ (kuTerm d.u i) i]
  · simp
  · intro m e
    unfold addKu kuTerm
    by_cases h : e.1 = e.2.1
    · simp only [h, ite_true, getD_addTo, beq_iff_eq, val_mul]; simp
    · simp only [h, ite_false, getD_addTo, beq_iff_eq, val_mul]; ring

lemma sum_if_val_eq {n : ℕ} (b : ℕ) (hb : b < n) (g : Fin n → ℚ) :
    ∑ j : Fin n, (if b = j.val then g j else 0) = g ⟨b, hb⟩ := by
  rw [Finset.sum_eq_single ⟨b, hb⟩]
  · simp
  · intro j _ hj
    have : b ≠ j.val := fun h => hj (Fin.ext h.symm)
    simp [this]
  · simp

lemma kTerm_mulVec {n : ℕ} (u : Array Dy) (i : ℕ) (e : ℕ × ℕ × Dy) (ha : e.1 < n) (hb : e.2.1 < n) :
    ∑ j : Fin n, kTerm i j e * (u.getD j 0).val = kuTerm u i e := by
  obtain ⟨a, b, v⟩ := e
  simp only at ha hb
  have h1 : ∀ j : Fin n, kTerm i j (a, b, v) * (u.getD j 0).val =
      (if b = j.val then (if a = i then v.val * (u.getD j 0).val else 0) else 0) +
      (if a = j.val then (if a = b then 0 else if b = i then v.val * (u.getD j 0).val else 0) else 0) := by
    intro j
    simp only [kTerm, Prod.mk.injEq]
    by_cases h1 : a = i <;> by_cases h2 : b = j.val <;> by_cases h3 : a = b <;> by_cases h4 : b = i <;>
      by_cases h5 : a = j.val <;> simp_all
  simp only [h1, Finset.sum_add_distrib]
  rw [sum_if_val_eq b hb (fun j => if a = i then v.val * (u.getD j 0).val else 0),
    sum_if_val_eq a ha (fun j => if a = b then 0 else if b = i then v.val * (u.getD j 0).val else 0)]
  simp [kuTerm]

lemma list_sum_finset_comm {β : Type} {n : ℕ} (l : List β) (g : Fin n → β → ℚ) :
    ∑ j : Fin n, (l.map (g j)).sum = (l.map fun e => ∑ j : Fin n, g j e).sum := by
  induction l with
  | nil => simp
  | cons x l ih => simp only [List.map_cons, List.sum_cons, Finset.sum_add_distrib, ih]

/-- `(K ũ)ᵢ` is what `kuMap` stores (all `K` indices in range). -/
lemma mulVec_eq (d : Bundle) (hk : ∀ e ∈ d.kEnt, e.1 < d.n ∧ e.2.1 < d.n) (i : Fin d.n) :
    (kMat d *ᵥ uVec d) i = (((kuMap d).getD i.val 0).val : ℝ) := by
  have hq : ∑ j : Fin d.n, kAt d i j * (d.u.getD j 0).val = ((kuMap d).getD i.val 0).val := by
    rw [kuMap_getD]
    simp only [kAt, ← List.sum_map_mul_right]
    rw [list_sum_finset_comm]
    congr 1
    exact List.map_congr_left fun e he => kTerm_mulVec d.u i e (hk e he).1 (hk e he).2
  rw [← hq]
  simp [Matrix.mulVec, dotProduct, kMat, uVec]

/-- `ρ² ≤ (bμ)²` with `μ > 0`, `b ≥ 0` gives `√ρ² / μ ≤ b`. -/
lemma sqrt_div_le_of_sq_le {ρ2 μ b : ℝ} (hμ : 0 < μ) (hb : 0 ≤ b) (h : ρ2 ≤ (b * μ) ^ 2) :
    Real.sqrt ρ2 / μ ≤ b := by
  rw [div_le_iff₀ hμ]
  calc Real.sqrt ρ2 ≤ Real.sqrt ((b * μ) ^ 2) := Real.sqrt_le_sqrt h
    _ = b * μ := Real.sqrt_sq (mul_nonneg hb hμ.le)

/-! ### Soundness -/

/-- What `check d = true` provides. -/
structure Facts (d : Bundle) : Prop where
  lcols : d.lCols.size = d.n
  krange : ∀ e ∈ d.kEnt, e.1 < d.n ∧ e.2.1 < d.n
  mu_pos : 0 < d.mu.val
  bound_nonneg : 0 ≤ d.bound.val
  rows : ∀ t : Fin d.n, d.mu.val ≤ ((gershSums d (prep d)).getD t 0 : ℚ) * 2 ^ (prep d).E2
  resid : (rho2 d).val ≤ (d.bound.val * d.mu.val) * (d.bound.val * d.mu.val)

lemma facts_of_check (d : Bundle) (h : check d = true) : Facts d := by
  simp only [check, shapeOk, gershgorinOk, residualOk, Bool.and_eq_true, beq_iff_eq,
    decide_eq_true_eq, List.all_eq_true] at h
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨_, _⟩, _⟩, _⟩, hlc⟩, hk⟩, _⟩, hμ0⟩, hb0⟩, hg⟩, hres⟩ := h
  refine ⟨hlc, fun e he => by simpa using hk e he, (Dy.pos_iff _).mp hμ0,
    (Dy.nonneg_iff _).mp hb0, fun t => ?_, ?_⟩
  · have := hg t.val (List.mem_range.mpr t.isLt)
    rw [rowOk, Dy.le_iff] at this
    exact this
  · simp only [Dy.le_iff, val_mul] at hres
    exact hres

lemma fin_erase_sum {n : ℕ} (f : ℕ → ℚ) (t : Fin n) :
    ∑ j ∈ univ.erase t, f j = ∑ j ∈ (Finset.range n).erase t, f j := by
  rw [Finset.sum_erase_eq_sub (Finset.mem_univ t),
    Finset.sum_erase_eq_sub (Finset.mem_range.mpr t.isLt), Fin.sum_univ_eq_sum_range]

/-- Gershgorin on the exact real residual, from the row tests. -/
lemma gershgorin_real (d : Bundle) (F : Facts d) (t : Fin d.n) :
    (d.mu.val : ℝ) ≤ (symPart (kMat d) - lMat d * (lMat d)ᵀ) t t -
      ∑ j ∈ univ.erase t, |(symPart (kMat d) - lMat d * (lMat d)ᵀ) t j| := by
  simp only [resid_eq]
  have hq : d.mu.val ≤ rq d t t - ∑ j ∈ univ.erase t, |rq d t j| := by
    rw [fin_erase_sum (fun j => |rq d t j|) t, ← gershSums_val d F.lcols t.isLt]
    exact F.rows t
  have hr : ((d.mu.val : ℚ) : ℝ) ≤ ((rq d t t - ∑ j ∈ univ.erase t, |rq d t j| : ℚ) : ℝ) := by
    exact_mod_cast hq
  push_cast at hr
  exact hr

/-- **Verified checker.** If `check d = true` then, for the real matrices denoted by the
bundle (`K = kMat d`, `ũ = uVec d`) and every right-hand side `f` in the bundle's enclosure
`[fLo, fHi]`, `K` is invertible, `K⁻¹ f` is the unique solution, and
`‖K⁻¹ f − ũ‖₂ ≤ bound` — the conclusion of `certified_error_bound_gram`, to which the
proof reduces with `L = lMat d`, point enclosures of the exactly computed `R = K − L Lᵀ`,
the residual interval `[fLo − Kũ, fHi − Kũ]` and `ρ = bound · μ`. -/
theorem check_sound (d : Bundle) (h : check d = true) (f : Fin d.n → ℝ)
    (hf : ∀ i, fLoVec d i ≤ f i ∧ f i ≤ fHiVec d i) :
    kMat d *ᵥ ((kMat d)⁻¹ *ᵥ f) = f ∧ (∀ u, kMat d *ᵥ u = f → u = (kMat d)⁻¹ *ᵥ f) ∧
      vnorm ((kMat d)⁻¹ *ᵥ f - uVec d) ≤ d.bound.val := by
  have F := facts_of_check d h
  set K := kMat d
  set L := lMat d
  -- the exact residual, as point intervals
  let IR : Matrix (Fin d.n) (Fin d.n) Interval := fun i j => point ((symPart K - L * Lᵀ) i j)
  have hR : ∀ i j, (symPart K - L * Lᵀ) i j ∈ᵢ IR i j := fun i j => mem_point _
  have hμ : ∀ i, (d.mu.val : ℝ) ≤ (IR i i).lo - ∑ j ∈ univ.erase i, mag (IR i j) := by
    intro i
    simp only [IR, point, mag, max_self]
    exact gershgorin_real d F i
  -- the residual interval
  let ku : Fin d.n → ℝ := fun i => (((kuMap d).getD i.val 0).val : ℝ)
  have hku : ∀ i, (K *ᵥ uVec d) i = ku i := mulVec_eq d F.krange
  let Ir : Fin d.n → Interval := fun i =>
    ⟨fLoVec d i - ku i, fHiVec d i - ku i, by linarith [(hf i).1, (hf i).2]⟩
  have hr : ∀ i, (f - K *ᵥ uVec d) i ∈ᵢ Ir i := by
    intro i
    simp only [Pi.sub_apply, hku]
    exact ⟨by linarith [(hf i).1], by linarith [(hf i).2]⟩
  have hsum : ∑ i, mag (Ir i) ^ 2 = (((rho2 d).val : ℚ) : ℝ) := by
    rw [rho2, Dy.val_foldr_add, List.map_map, list_range_sum]
    push_cast
    refine Finset.sum_congr rfl fun i _ => ?_
    simp only [Function.comp, resTerm, val_mul, val_max, val_abs, val_sub, mag, Ir, ku, fLoVec,
      fHiVec]
    push_cast
    ring
  have hρ2 : ∑ i, mag (Ir i) ^ 2 ≤ ((d.bound.val : ℝ) * d.mu.val) ^ 2 := by
    rw [hsum]
    have : (((rho2 d).val : ℚ) : ℝ) ≤ ((d.bound.val * d.mu.val * (d.bound.val * d.mu.val) : ℚ) : ℝ) := by
      exact_mod_cast F.resid
    push_cast at this
    nlinarith [this]
  have hμ0 : (0 : ℝ) < d.mu.val := by exact_mod_cast F.mu_pos
  have hb0 : (0 : ℝ) ≤ d.bound.val := by exact_mod_cast F.bound_nonneg
  have hρ : Real.sqrt (∑ i, mag (Ir i) ^ 2) ≤ d.bound.val * d.mu.val :=
    (div_le_iff₀ hμ0).mp (sqrt_div_le_of_sq_le hμ0 hb0 hρ2)
  have hb : (d.bound.val * d.mu.val : ℝ) / d.mu.val ≤ d.bound.val := by
    rw [mul_div_assoc, div_self hμ0.ne', mul_one]
  exact certified_error_bound_gram K f (uVec d) L IR hR hμ0 hμ Ir hr hρ hb

/-- The certified `μ` is a lower bound on the quadratic form of `K`: `λ_min(K) ≥ μ`. -/
theorem check_sound_coercive (d : Bundle) (h : check d = true) (x : Fin d.n → ℝ) :
    (d.mu.val : ℝ) * vnorm x ^ 2 ≤ x ⬝ᵥ (kMat d *ᵥ x) := by
  have F := facts_of_check d h
  refine coercive_of_gram (kMat d) (lMat d)
    (fun i j => point ((symPart (kMat d) - lMat d * (lMat d)ᵀ) i j)) (fun i j => mem_point _) ?_ x
  intro i
  simp only [point, mag, max_self]
  exact gershgorin_real d F i

end Certify.Bundle
