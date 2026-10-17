/-
Soundness of the plastic-collapse bundle checker (`Certify.PlasticCheck`).

`check d = true` implies, for every choice of plastic moments `Mp_c ∈ [mpLo_c, mpHi_c]`:
* **static theorem** — the bundle's field `(lamLo, x)` is statically and plastically
  admissible (`Admissible`): every equilibrium row holds and the yield condition holds at
  every point of every piece of every member; hence `lamLo ≤ λ_c`;
* **kinematic theorem** — every admissible `(λ, x)` has `λ ≤ lamUp`; hence `λ_c ≤ lamUp`;

where `λ_c = sSup {λ | ∃ x, Admissible λ x}` is the collapse load factor of the
discretized problem the bundle denotes (`collapseFactor`).

The static part rests on the cubic Bernstein bound (`bern_bound`): on `[s, s']` a cubic is a
convex combination of its Bernstein coefficients. The kinematic part is LP weak duality:
the checked coefficient identity gives `Σ_h θ_h · M(t_h) = λ W` for any equilibrium field
(the virtual-work equation), and Cauchy–Schwarz against the yield ellipse bounds each
hinge's term by its dissipation `D_h`.
-/
import Mathlib
import Certify.PlasticCheck

open Finset

namespace Certify.Plastic

/-! ### Real denotation -/

/-- `Σ c · xᵢ` over the reals. -/
noncomputable def termsR (l : List (ℕ × ℚ)) (x : ℕ → ℝ) : ℝ := (l.map fun p => (p.2 : ℝ) * x p.1).sum

noncomputable def Lin.evalR (f : Lin) (x : ℕ → ℝ) (lam : ℝ) : ℝ := termsR f.terms x + f.lam * lam

/-- `M(t) = c0 + c1 t + c2 t² + c3 t³` at the field `(x, λ)`. -/
noncomputable def Cubic.evalR (C : Cubic) (x : ℕ → ℝ) (lam t : ℝ) : ℝ :=
  C.c0.evalR x lam + C.c1.evalR x lam * t + C.c2.evalR x lam * t ^ 2 + C.c3.evalR x lam * t ^ 3

/-- `Σ_c M_c(t)² / (n_c · Mp_c²)` for member `M` on piece `P`. -/
noncomputable def yieldSum (M : Member) (P : Piece) (mp : ℕ → ℝ) (x : ℕ → ℝ) (lam t : ℝ) : ℝ :=
  ∑ c ∈ range M.comps.size,
    (P.polys.getD c default).evalR x lam t ^ 2 / ((M.comps.getD c default).n * mp c ^ 2)

/-- `(λ, x)` is statically and plastically admissible for the plastic moments `mp m c`
(member `m`, component `c`): equilibrium, and the yield condition at every point of every
piece of every member. -/
def Admissible (d : PBundle) (mp : ℕ → ℕ → ℝ) (lam : ℝ) (x : ℕ → ℝ) : Prop :=
  (∀ r ∈ d.rows, termsR r.terms x = lam * r.p) ∧
  ∀ m < d.members.size, ∀ P ∈ (d.members.getD m default).pieces, ∀ t : ℝ,
    (P.a : ℝ) ≤ t → t ≤ P.b → yieldSum (d.members.getD m default) P (mp m) x lam t ≤ 1

/-- The plastic moments lie in the bundle's enclosures. -/
def MpIn (d : PBundle) (mp : ℕ → ℕ → ℝ) : Prop :=
  ∀ m < d.members.size, ∀ c < (d.members.getD m default).comps.size,
    (((d.members.getD m default).comps.getD c default).mpLo : ℝ) ≤ mp m c ∧
      mp m c ≤ ((d.members.getD m default).comps.getD c default).mpHi

/-- The collapse load factor of the discretized problem. -/
noncomputable def collapseFactor (d : PBundle) (mp : ℕ → ℕ → ℝ) : ℝ :=
  sSup {lam | ∃ x, Admissible d mp lam x}

/-- The static certificate's field. -/
noncomputable def xR (d : PBundle) : ℕ → ℝ := fun i => ((d.x.getD i 0 : ℚ) : ℝ)

/-! ### Rational helpers -/

lemma rabs_eq (a : ℚ) : rabs a = |a| := by
  unfold rabs
  split_ifs with h
  · exact (abs_of_neg h).symm
  · exact (abs_of_nonneg (not_lt.mp h)).symm

lemma rmax_eq (a b : ℚ) : rmax a b = max a b := by
  unfold rmax
  split_ifs with h
  · exact (max_eq_right h).symm
  · exact (max_eq_left (le_of_lt (not_le.mp h))).symm

lemma termsR_cast (l : List (ℕ × ℚ)) (x : Array ℚ) :
    termsR l (fun i => ((x.getD i 0 : ℚ) : ℝ)) = ((termsEval l x : ℚ) : ℝ) := by
  rw [termsR, termsEval, Rat.cast_list_sum, List.map_map]
  refine congrArg List.sum (List.map_congr_left fun p _ => ?_)
  simp

lemma evalR_cast (f : Lin) (x : Array ℚ) (lam : ℚ) :
    f.evalR (fun i => ((x.getD i 0 : ℚ) : ℝ)) lam = ((f.eval x lam : ℚ) : ℝ) := by
  simp only [Lin.evalR, Lin.eval, termsR_cast]
  push_cast
  ring

/-! ### The cubic Bernstein bound -/

/-- `bern` over the reals. -/
noncomputable def bernR (q0 q1 q2 q3 s s' : ℝ) : ℝ :=
  let h := s' - s
  let p0 := q0 + q1 * s + q2 * s * s + q3 * s * s * s
  let d1 := (q1 + 2 * q2 * s + 3 * q3 * s * s) * h
  let d2 := (q2 + 3 * q3 * s) * h * h
  let d3 := q3 * h * h * h
  max (max |p0| |p0 + d1 / 3|) (max |p0 + 2 * d1 / 3 + d2 / 3| |p0 + d1 + d2 + d3|)

lemma bern_cast (q0 q1 q2 q3 s s' : ℚ) :
    ((bern q0 q1 q2 q3 s s' : ℚ) : ℝ) = bernR q0 q1 q2 q3 s s' := by
  simp only [bern, bernR, rmax_eq, rabs_eq]
  push_cast
  rfl

/-- On `[s, s']` a cubic is bounded in absolute value by its largest absolute Bernstein
coefficient: `s'−s)³ · q(t) = Σⱼ bⱼ C(3,j) vʲ (h−v)^(3−j)` with `v = t − s`, a convex
combination after dividing by `h³`. -/
lemma bern_bound {q0 q1 q2 q3 s s' t : ℝ} (h1 : s ≤ t) (h2 : t ≤ s') :
    |q0 + q1 * t + q2 * t ^ 2 + q3 * t ^ 3| ≤ bernR q0 q1 q2 q3 s s' := by
  obtain ⟨v, rfl⟩ : ∃ v, t = s + v := ⟨t - s, by ring⟩
  obtain ⟨h, rfl⟩ : ∃ h, s' = s + h := ⟨s' - s, by ring⟩
  have hv : 0 ≤ v := by linarith
  have hvh : v ≤ h := by linarith
  simp only [bernR, add_sub_cancel_left]
  set p0 := q0 + q1 * s + q2 * s * s + q3 * s * s * s
  set d1 := (q1 + 2 * q2 * s + 3 * q3 * s * s) * h
  set d2 := (q2 + 3 * q3 * s) * h * h
  set d3 := q3 * h * h * h
  set b0 := p0
  set b1 := p0 + d1 / 3
  set b2 := p0 + 2 * d1 / 3 + d2 / 3
  set b3 := p0 + d1 + d2 + d3
  set B := max (max |b0| |b1|) (max |b2| |b3|)
  have key : h ^ 3 * (q0 + q1 * (s + v) + q2 * (s + v) ^ 2 + q3 * (s + v) ^ 3) =
      b0 * (h - v) ^ 3 + b1 * (3 * v * (h - v) ^ 2) + b2 * (3 * v ^ 2 * (h - v)) + b3 * v ^ 3 := by
    simp only [b0, b1, b2, b3, p0, d1, d2, d3]
    ring
  have w0 : 0 ≤ (h - v) ^ 3 := pow_nonneg (by linarith) 3
  have w1 : 0 ≤ 3 * v * (h - v) ^ 2 := by positivity
  have w2 : 0 ≤ 3 * v ^ 2 * (h - v) := mul_nonneg (by positivity) (by linarith)
  have w3 : 0 ≤ v ^ 3 := pow_nonneg hv 3
  have hb0 : |b0| ≤ B := (le_max_left _ _).trans (le_max_left _ _)
  have hb1 : |b1| ≤ B := (le_max_right _ _).trans (le_max_left _ _)
  have hb2 : |b2| ≤ B := (le_max_left _ _).trans (le_max_right _ _)
  have hb3 : |b3| ≤ B := (le_max_right _ _).trans (le_max_right _ _)
  rcases hv.eq_or_lt with hv0 | hvpos
  · -- t = s: the value is `b0`
    subst hv0
    have : q0 + q1 * (s + 0) + q2 * (s + 0) ^ 2 + q3 * (s + 0) ^ 3 = b0 := by
      simp only [b0, p0]; ring
    rw [this]
    exact hb0
  · have hh : 0 < h ^ 3 := pow_pos (hvpos.trans_le hvh) 3
    have habs : |h ^ 3 * (q0 + q1 * (s + v) + q2 * (s + v) ^ 2 + q3 * (s + v) ^ 3)| ≤ B * h ^ 3 := by
      rw [key]
      have e : B * h ^ 3 = B * (h - v) ^ 3 + B * (3 * v * (h - v) ^ 2) + B * (3 * v ^ 2 * (h - v)) +
          B * v ^ 3 := by ring
      rw [e]
      refine (abs_add_le _ _).trans (add_le_add ((abs_add_le _ _).trans (add_le_add
        ((abs_add_le _ _).trans (add_le_add ?_ ?_)) ?_)) ?_) <;>
        rw [abs_mul] <;> [rw [abs_of_nonneg w0]; rw [abs_of_nonneg w1]; rw [abs_of_nonneg w2];
          rw [abs_of_nonneg w3]] <;> gcongr
    rw [abs_mul, abs_of_pos hh, mul_comm] at habs
    exact le_of_mul_le_mul_right habs hh

/-! ### Cover by segments -/

lemma coverOk_cover (ok : ℚ → ℚ → Bool) (b : ℚ) :
    ∀ (ps : List ℚ) (s : ℚ) (t : ℝ), coverOk ok b s ps = true → (s : ℝ) ≤ t → t ≤ b →
      ∃ u v : ℚ, ok u v = true ∧ (u : ℝ) ≤ t ∧ t ≤ v
  | [], s, t, h, h1, h2 => by
    simp only [coverOk, Bool.and_eq_true, decide_eq_true_eq] at h
    exact ⟨s, b, h.2, h1, h2⟩
  | p :: ps, s, t, h, h1, h2 => by
    simp only [coverOk, Bool.and_eq_true, decide_eq_true_eq] at h
    by_cases htp : t ≤ p
    · exact ⟨s, p, h.1.2, h1, htp⟩
    · exact coverOk_cover ok b ps p t h.2 (le_of_lt (not_le.mp htp)) h2

/-! ### Static theorem -/

lemma getD_mem {α : Type} [Inhabited α] {a : Array α} {i : ℕ} (hi : i < a.size) :
    a.getD i default ∈ a := by
  rw [Array.getD_eq_getD_getElem?, Array.getElem?_eq_getElem hi]
  exact Array.getElem_mem hi

lemma compOk_of (d : PBundle) (h : membersOk d = true) {m c : ℕ} (hm : m < d.members.size)
    (hc : c < (d.members.getD m default).comps.size) :
    0 < ((d.members.getD m default).comps.getD c default).n ∧
      0 < ((d.members.getD m default).comps.getD c default).mpLo ∧
      ((d.members.getD m default).comps.getD c default).mpLo ≤
        ((d.members.getD m default).comps.getD c default).mpHi := by
  rw [membersOk, Array.all_eq_true_iff_forall_mem] at h
  have := Array.all_eq_true_iff_forall_mem.mp (h _ (getD_mem hm)) _ (getD_mem hc)
  simpa [compOk, and_assoc] using this

/-- One term of the yield sum is at most the segment's Bernstein term. -/
lemma yield_term_le {C : Cubic} {K : Comp} {x : Array ℚ} {lam s s' : ℚ} {t mp : ℝ}
    (hs : (s : ℝ) ≤ t) (hs' : t ≤ s') (hn : 0 < K.n) (hlo : 0 < K.mpLo) (hmp : (K.mpLo : ℝ) ≤ mp) :
    C.evalR (fun i => ((x.getD i 0 : ℚ) : ℝ)) lam t ^ 2 / (K.n * mp ^ 2) ≤
      (((bern (C.c0.eval x lam) (C.c1.eval x lam) (C.c2.eval x lam) (C.c3.eval x lam) s s' *
        bern (C.c0.eval x lam) (C.c1.eval x lam) (C.c2.eval x lam) (C.c3.eval x lam) s s' /
        (K.n * K.mpLo * K.mpLo)) : ℚ) : ℝ) := by
  have hb := bern_bound (q0 := ((C.c0.eval x lam : ℚ) : ℝ)) (q1 := ((C.c1.eval x lam : ℚ) : ℝ))
    (q2 := ((C.c2.eval x lam : ℚ) : ℝ)) (q3 := ((C.c3.eval x lam : ℚ) : ℝ)) hs hs'
  rw [← bern_cast] at hb
  simp only [Cubic.evalR, evalR_cast]
  set B : ℝ := ((bern (C.c0.eval x lam) (C.c1.eval x lam) (C.c2.eval x lam) (C.c3.eval x lam) s s' : ℚ) : ℝ)
  set M := ((C.c0.eval x lam : ℚ) : ℝ) + ((C.c1.eval x lam : ℚ) : ℝ) * t +
    ((C.c2.eval x lam : ℚ) : ℝ) * t ^ 2 + ((C.c3.eval x lam : ℚ) : ℝ) * t ^ 3
  have hn' : (0 : ℝ) < K.n := by exact_mod_cast hn
  have hlo' : (0 : ℝ) < K.mpLo := by exact_mod_cast hlo
  have hM2 : M ^ 2 ≤ B * B := by
    have := abs_le.mp hb
    nlinarith [abs_nonneg M]
  push_cast
  calc M ^ 2 / (K.n * mp ^ 2) ≤ B * B / (K.n * mp ^ 2) := by gcongr
    _ ≤ B * B / (K.n * K.mpLo * K.mpLo) := by
      apply div_le_div_of_nonneg_left (mul_self_nonneg B) (by positivity)
      rw [mul_assoc]
      gcongr
      nlinarith

lemma list_range_sum_real (n : ℕ) (f : ℕ → ℝ) :
    ((List.range n).map f).sum = ∑ i ∈ range n, f i := by
  simp [Finset.sum_eq_multiset_sum, Finset.range_val, Multiset.range]

lemma list_range_sum_rat (n : ℕ) (f : ℕ → ℚ) :
    ((List.range n).map f).sum = ∑ i ∈ range n, f i := by
  simp [Finset.sum_eq_multiset_sum, Finset.range_val, Multiset.range]

theorem static_sound (d : PBundle) (h : check d = true) (mp : ℕ → ℕ → ℝ) (hmp : MpIn d mp) :
    Admissible d mp d.lamLo (xR d) := by
  have hm : membersOk d = true := by simp only [check, Bool.and_eq_true] at h; exact h.1.1
  have hs : staticOk d = true := by simp only [check, Bool.and_eq_true] at h; exact h.1.2
  simp only [staticOk, Bool.and_eq_true, Array.all_eq_true_iff_forall_mem] at hs
  obtain ⟨hrows, hmem⟩ := hs
  refine ⟨fun r hr => ?_, fun m hmsz P hP t ht1 ht2 => ?_⟩
  · have := hrows r hr
    simp only [rowOk, decide_eq_true_eq] at this
    unfold xR
    rw [termsR_cast, this]
    push_cast
    ring
  · rw [show xR d = fun i => ((d.x.getD i 0 : ℚ) : ℝ) from rfl]
    have hc := hmem _ (getD_mem hmsz) P hP
    obtain ⟨s, s', hseg, hs1, hs2⟩ := coverOk_cover _ P.b P.cuts P.a t hc ht1 ht2
    simp only [segOk, decide_eq_true_eq, compVals, List.map_map] at hseg
    rw [list_range_sum_rat] at hseg
    have hseg' : ((∑ c ∈ range (d.members.getD m default).comps.size, ((fun v : CompVal =>
        bern v.q0 v.q1 v.q2 v.q3 s s' * bern v.q0 v.q1 v.q2 v.q3 s s' /
          (v.comp.n * v.comp.mpLo * v.comp.mpLo)) ∘ fun c =>
        (⟨(P.polys.getD c default).c0.eval d.x d.lamLo, (P.polys.getD c default).c1.eval d.x d.lamLo,
          (P.polys.getD c default).c2.eval d.x d.lamLo, (P.polys.getD c default).c3.eval d.x d.lamLo,
          (d.members.getD m default).comps.getD c default⟩ : CompVal)) c : ℚ) : ℝ) ≤ 1 := by exact_mod_cast hseg
    push_cast at hseg'
    refine le_trans (Finset.sum_le_sum fun c hc => ?_) hseg'
    have hcs := Finset.mem_range.mp hc
    obtain ⟨hn, hlo, _⟩ := compOk_of d hm hmsz hcs
    have := yield_term_le (C := P.polys.getD c default) (x := d.x) (lam := d.lamLo) hs1 hs2 hn hlo
      (hmp m hmsz c hcs).1
    simpa [Function.comp] using this

/-! ### Accumulation of linear forms -/

lemma accum_aux {nv k : ℕ} (hk : k < nv) :
    ∀ (l : List (ℕ × ℚ)) (A : Array ℚ), A.size = nv →
      (l.foldl (fun A p => A.modify p.1 (· + p.2)) A).getD k 0 =
        A.getD k 0 + (l.map fun p => if p.1 = k then p.2 else 0).sum
  | [], A, _ => by simp
  | p :: l, A, hA => by
    rw [List.foldl_cons, accum_aux hk l _ (by simp [hA])]
    have hkA : k < A.size := hA ▸ hk
    simp only [Array.getD_eq_getD_getElem?, Array.getElem?_modify, Array.getElem?_eq_getElem hkA,
      List.map_cons, List.sum_cons]
    split_ifs <;> simp [add_assoc]

lemma accum_getD {nv k : ℕ} (hk : k < nv) (l : List (ℕ × ℚ)) :
    (accum nv l).getD k 0 = (l.map fun p => if p.1 = k then p.2 else 0).sum := by
  rw [accum, accum_aux hk l _ (by simp)]
  simp [hk]

lemma accum_size (nv : ℕ) : ∀ (l : List (ℕ × ℚ)) (A : Array ℚ),
    (l.foldl (fun A p => A.modify p.1 (· + p.2)) A).size = A.size
  | [], _ => rfl
  | p :: l, A => by rw [List.foldl_cons, accum_size nv l, Array.size_modify]

/-- A linear form whose accumulated coefficients all vanish is zero. -/
lemma termsR_eq_zero (nv : ℕ) (l : List (ℕ × ℚ)) (x : ℕ → ℝ) (hl : ∀ p ∈ l, p.1 < nv)
    (h0 : ∀ k < nv, (accum nv l).getD k 0 = 0) : termsR l x = 0 := by
  have key : ∀ l : List (ℕ × ℚ), (∀ p ∈ l, p.1 < nv) →
      termsR l x = ∑ k ∈ range nv, (((l.map fun p => if p.1 = k then p.2 else 0).sum : ℚ) : ℝ) * x k := by
    intro l
    induction l with
    | nil => intro; simp [termsR]
    | cons p l ih =>
      intro hl
      have hp := hl p (by simp)
      rw [termsR, List.map_cons, List.sum_cons, ← termsR, ih fun q hq => hl q (by simp [hq])]
      simp only [List.map_cons, List.sum_cons, Rat.cast_add, add_mul, Finset.sum_add_distrib]
      congr 1
      rw [Finset.sum_eq_single p.1]
      · simp
      · intro b _ hb; simp [Ne.symm hb]
      · intro hn; exact absurd (Finset.mem_range.mpr hp) hn
  rw [key l hl]
  refine Finset.sum_eq_zero fun k hk => ?_
  rw [← accum_getD (Finset.mem_range.mp hk), h0 k (Finset.mem_range.mp hk)]
  simp

/-! ### Kinematic theorem -/

lemma termsR_append (l₁ l₂ : List (ℕ × ℚ)) (x : ℕ → ℝ) :
    termsR (l₁ ++ l₂) x = termsR l₁ x + termsR l₂ x := by
  simp [termsR]

lemma termsR_flatMap {α : Type} (l : List α) (f : α → List (ℕ × ℚ)) (x : ℕ → ℝ) :
    termsR (l.flatMap f) x = (l.map fun a => termsR (f a) x).sum := by
  induction l with
  | nil => simp [termsR]
  | cons a l ih => simp only [List.flatMap_cons, termsR_append, ih, List.map_cons, List.sum_cons]

lemma termsR_scale (l : List (ℕ × ℚ)) (k : ℚ) (x : ℕ → ℝ) :
    termsR (l.map fun p => (p.1, k * p.2)) x = k * termsR l x := by
  induction l with
  | nil => simp [termsR]
  | cons p l ih =>
    simp only [termsR, List.map_cons, List.sum_cons] at ih ⊢
    rw [ih]
    push_cast
    ring

lemma termsR_neg_scale (l : List (ℕ × ℚ)) (k : ℚ) (x : ℕ → ℝ) :
    termsR (l.map fun p => (p.1, -(k * p.2))) x = -(k * termsR l x) := by
  have : (l.map fun p => (p.1, -(k * p.2))) = l.map fun p => (p.1, (-k) * p.2) := by
    congr 1; funext p; congr 1; ring
  rw [this, termsR_scale]
  push_cast
  ring

/-- The `x`-part of the hinge cubic `θ M(t)`: `Σ_c θ_c (M_c(t) − λ · λ-coefficient)`. -/
lemma termsR_hinge (d : PBundle) (h : Hinge) (x : ℕ → ℝ) (lam : ℝ) :
    termsR (hingeTerms d h) x =
      -(∑ c ∈ range (hingeMember d h).comps.size, ((h.theta.getD c 0 : ℚ) : ℝ) *
        ((hingePiece d h).polys.getD c default).evalR x lam h.t) + lam * hingeLam d h := by
  rw [hingeTerms, termsR_flatMap, list_range_sum_real, hingeLam, list_range_sum_rat]
  push_cast
  rw [Finset.mul_sum, ← Finset.sum_neg_distrib, ← Finset.sum_add_distrib]
  refine Finset.sum_congr rfl fun c _ => ?_
  simp only [termsR_flatMap, cubicTerms, List.map_cons, List.map_nil, List.sum_cons, List.sum_nil,
    termsR_neg_scale, Cubic.evalR, Lin.evalR]
  push_cast
  ring

lemma rows_mem (d : PBundle) {r : ℕ} (hr : r < d.rows.size) : d.rows.getD r default ∈ d.rows :=
  getD_mem hr

/-- Virtual work: for an equilibrium field, `Σ_h θ_h · M(t_h) = λ · W`. -/
lemma virtual_work (d : PBundle) (hk : kinematicOk d = true) (lam : ℝ) (x : ℕ → ℝ)
    (heq : ∀ r ∈ d.rows, termsR r.terms x = lam * r.p) :
    (d.hinges.map fun h => ∑ c ∈ range (hingeMember d h).comps.size, ((h.theta.getD c 0 : ℚ) : ℝ) *
        ((hingePiece d h).polys.getD c default).evalR x lam h.t).sum = lam * work d := by
  simp only [kinematicOk, Bool.and_eq_true, List.all_eq_true, Array.all_eq_true,
    decide_eq_true_eq] at hk
  obtain ⟨⟨⟨⟨hidx, hzero⟩, _⟩, _⟩, _⟩ := hk
  have hsz : (accum d.nv (allTerms d)).size = d.nv := by
    rw [accum, accum_size d.nv]; simp
  have h0 : termsR (allTerms d) x = 0 :=
    termsR_eq_zero d.nv _ x hidx fun k hk => by
      have hk' : k < (accum d.nv (allTerms d)).size := by rw [hsz]; exact hk
      rw [Array.getD_eq_getD_getElem?, Array.getElem?_eq_getElem hk']
      exact hzero k hk'
  rw [allTerms, termsR_append, rowTerms, termsR_flatMap, termsR_flatMap, list_range_sum_real] at h0
  simp only [termsR_scale] at h0
  have hrow : ∀ r ∈ range d.rows.size, ((d.mult.getD r 0 : ℚ) : ℝ) * termsR (d.rows.getD r default).terms x =
      lam * (((d.mult.getD r 0 * (d.rows.getD r default).p : ℚ)) : ℝ) := by
    intro r hr
    rw [heq _ (rows_mem d (Finset.mem_range.mp hr))]
    push_cast
    ring
  rw [Finset.sum_congr rfl hrow, ← Finset.mul_sum, ← Rat.cast_sum, ← list_range_sum_rat] at h0
  have hh : ∀ h, termsR (hingeTerms d h) x =
      -(∑ c ∈ range (hingeMember d h).comps.size, ((h.theta.getD c 0 : ℚ) : ℝ) *
        ((hingePiece d h).polys.getD c default).evalR x lam h.t) + lam * hingeLam d h :=
    fun h => termsR_hinge d h x lam
  simp only [hh] at h0
  have hl : ∀ l : List Hinge, (l.map fun h => -(∑ c ∈ range (hingeMember d h).comps.size,
      ((h.theta.getD c 0 : ℚ) : ℝ) * ((hingePiece d h).polys.getD c default).evalR x lam h.t) +
        lam * ((hingeLam d h : ℚ) : ℝ)).sum =
      -(l.map fun h => ∑ c ∈ range (hingeMember d h).comps.size, ((h.theta.getD c 0 : ℚ) : ℝ) *
        ((hingePiece d h).polys.getD c default).evalR x lam h.t).sum +
        lam * ((l.map (hingeLam d)).sum : ℝ) := by
    intro l
    induction l with
    | nil => simp
    | cons a l ih => simp only [List.map_cons, List.sum_cons, ih]; push_cast; ring
  rw [hl] at h0
  rw [work, Rat.cast_add]
  linarith

/-- Each hinge's virtual work is at most its dissipation bound (Cauchy–Schwarz on the yield
ellipse). -/
lemma hinge_le_diss (d : PBundle) (hm : membersOk d = true) (mp : ℕ → ℕ → ℝ) (hmp : MpIn d mp)
    (lam : ℝ) (x : ℕ → ℝ) (hadm : Admissible d mp lam x) (h : Hinge) (hh : hingeOk d h = true) :
    ∑ c ∈ range (hingeMember d h).comps.size, ((h.theta.getD c 0 : ℚ) : ℝ) *
        ((hingePiece d h).polys.getD c default).evalR x lam h.t ≤ h.diss := by
  simp only [hingeOk, Bool.and_eq_true, decide_eq_true_eq] at hh
  obtain ⟨⟨⟨⟨⟨hmsz, hpsz⟩, ha⟩, hb⟩, hd0⟩, hdiss⟩ := hh
  set M := hingeMember d h
  set P := hingePiece d h
  set k := M.comps.size
  have hP : P ∈ (d.members.getD h.member default).pieces := getD_mem hpsz
  have hy := hadm.2 h.member hmsz P hP h.t (by exact_mod_cast ha) (by exact_mod_cast hb)
  -- weights a_c = √n_c · Mp_c > 0
  have hpos : ∀ c ∈ range k, 0 < ((M.comps.getD c default).n : ℝ) ∧ 0 < mp h.member c ∧
      mp h.member c ≤ (M.comps.getD c default).mpHi := by
    intro c hc
    have hc' := Finset.mem_range.mp hc
    obtain ⟨hn, hlo, _⟩ := compOk_of d hm hmsz hc'
    obtain ⟨h1, h2⟩ := hmp h.member hmsz c hc'
    exact ⟨by exact_mod_cast hn, lt_of_lt_of_le (by exact_mod_cast hlo) h1, h2⟩
  set θ : ℕ → ℝ := fun c => ((h.theta.getD c 0 : ℚ) : ℝ)
  set Mc : ℕ → ℝ := fun c => (P.polys.getD c default).evalR x lam h.t
  set a : ℕ → ℝ := fun c => Real.sqrt ((M.comps.getD c default).n) * mp h.member c
  have ha2 : ∀ c ∈ range k, a c ^ 2 = (M.comps.getD c default).n * mp h.member c ^ 2 := by
    intro c hc
    simp only [a, mul_pow, Real.sq_sqrt (hpos c hc).1.le]
  have hapos : ∀ c ∈ range k, 0 < a c := fun c hc =>
    mul_pos (Real.sqrt_pos.mpr (hpos c hc).1) (hpos c hc).2.1
  have hcs := Finset.sum_mul_sq_le_sq_mul_sq (range k) (fun c => θ c * a c) (fun c => Mc c / a c)
  have e1 : ∑ c ∈ range k, θ c * a c * (Mc c / a c) = ∑ c ∈ range k, θ c * Mc c :=
    Finset.sum_congr rfl fun c hc => by field_simp [(hapos c hc).ne']
  have e2 : ∑ c ∈ range k, (Mc c / a c) ^ 2 = yieldSum M P (mp h.member) x lam h.t := by
    refine Finset.sum_congr rfl fun c hc => ?_
    rw [div_pow, ha2 c hc]
  rw [e1, e2] at hcs
  have hsq : ∑ c ∈ range k, (θ c * a c) ^ 2 ≤ ((h.diss * h.diss : ℚ) : ℝ) := by
    have hq : ((∑ c ∈ range k, ((h.theta.getD c 0 * h.theta.getD c 0 * (M.comps.getD c default).n *
        (M.comps.getD c default).mpHi * (M.comps.getD c default).mpHi : ℚ)) : ℚ) : ℝ) ≤
        ((h.diss * h.diss : ℚ) : ℝ) := by
      rw [← list_range_sum_rat]; exact_mod_cast hdiss
    refine le_trans (Finset.sum_le_sum fun c hc => ?_) (by push_cast at hq ⊢; exact hq)
    obtain ⟨hn, hm0, hhi⟩ := hpos c hc
    rw [mul_pow, ha2 c hc]
    have : mp h.member c ^ 2 ≤ ((M.comps.getD c default).mpHi : ℝ) ^ 2 := by
      gcongr
    have hθ : 0 ≤ θ c ^ 2 := sq_nonneg _
    nlinarith [mul_le_mul_of_nonneg_left this (mul_nonneg hθ hn.le)]
  have hy0 : 0 ≤ yieldSum M P (mp h.member) x lam h.t := by
    rw [← e2]; exact Finset.sum_nonneg fun c _ => sq_nonneg _
  have hfin : (∑ c ∈ range k, θ c * Mc c) ^ 2 ≤ (h.diss : ℝ) ^ 2 := by
    calc _ ≤ (∑ c ∈ range k, (θ c * a c) ^ 2) * yieldSum M P (mp h.member) x lam h.t := hcs
      _ ≤ (∑ c ∈ range k, (θ c * a c) ^ 2) * 1 :=
        mul_le_mul_of_nonneg_left hy (Finset.sum_nonneg fun c _ => sq_nonneg _)
      _ ≤ (h.diss : ℝ) ^ 2 := by rw [mul_one, sq]; push_cast at hsq; exact hsq
  exact le_of_abs_le (abs_le_of_sq_le_sq hfin (by exact_mod_cast hd0))

theorem kinematic_sound (d : PBundle) (h : check d = true) (mp : ℕ → ℕ → ℝ) (hmp : MpIn d mp)
    (lam : ℝ) (x : ℕ → ℝ) (hadm : Admissible d mp lam x) : lam ≤ d.lamUp := by
  have hm : membersOk d = true := by simp only [check, Bool.and_eq_true] at h; exact h.1.1
  have hk : kinematicOk d = true := by simp only [check, Bool.and_eq_true] at h; exact h.2
  have hvw := virtual_work d hk lam x hadm.1
  simp only [kinematicOk, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at hk
  obtain ⟨⟨⟨_, hhinge⟩, hW⟩, hup⟩ := hk
  have hle : (d.hinges.map fun h => ∑ c ∈ range (hingeMember d h).comps.size,
      ((h.theta.getD c 0 : ℚ) : ℝ) * ((hingePiece d h).polys.getD c default).evalR x lam h.t).sum ≤
      ((d.hinges.map (·.diss)).sum : ℚ) := by
    rw [Rat.cast_list_sum, List.map_map]
    exact List.sum_le_sum fun h hh => hinge_le_diss d hm mp hmp lam x hadm h (hhinge h hh)
  rw [hvw] at hle
  have hup' : (((d.hinges.map (·.diss)).sum : ℚ) : ℝ) ≤ (d.lamUp : ℝ) * work d := by
    exact_mod_cast hup
  have hW' : (0 : ℝ) < work d := by exact_mod_cast hW
  exact le_of_mul_le_mul_right (by linarith) hW'

/-- **Verified plastic-collapse checker.** If `check d = true` then, for every choice of
plastic moments within the bundle's enclosures, the static field is admissible at load factor
`lamLo` (static theorem), every admissible load factor is at most `lamUp` (kinematic
theorem), and so `lamLo ≤ λ_c ≤ lamUp` for the collapse load factor `λ_c` of the discretized
problem the bundle denotes. -/
theorem check_sound (d : PBundle) (h : check d = true) (mp : ℕ → ℕ → ℝ) (hmp : MpIn d mp) :
    Admissible d mp d.lamLo (xR d) ∧ (∀ lam x, Admissible d mp lam x → lam ≤ d.lamUp) ∧
      (d.lamLo : ℝ) ≤ collapseFactor d mp ∧ collapseFactor d mp ≤ d.lamUp := by
  have hs := static_sound d h mp hmp
  have hk := kinematic_sound d h mp hmp
  have hbdd : BddAbove {lam | ∃ x, Admissible d mp lam x} :=
    ⟨d.lamUp, fun lam ⟨x, hx⟩ => hk lam x hx⟩
  refine ⟨hs, hk, le_csSup hbdd ⟨xR d, hs⟩, csSup_le ⟨d.lamLo, xR d, hs⟩ fun lam ⟨x, hx⟩ => hk lam x hx⟩

end Certify.Plastic
