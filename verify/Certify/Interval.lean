/-
Interval arithmetic with abstract outward rounding (CERTIFY.md, "Rounding model").

`Rounding` packages `down, up : ℝ → ℝ` with `down x ≤ x ≤ up x`. Each operation
mirrors `engine/src/certify/interval.rs`: endpoints are the exact real endpoint
formula, then `down` on the lower and `up` on the upper endpoint. (In f64 the
endpoint is computed as `next_down (rn e)`; since `rn` is monotone,
`next_down (rn (min ...)) = next_down (min (rn ...))`, and `next_down ∘ rn ≤ id`.)
-/
import Mathlib

namespace Certify

/-- Abstract directed rounding. -/
structure Rounding where
  down : ℝ → ℝ
  up : ℝ → ℝ
  down_le : ∀ x, down x ≤ x
  le_up : ∀ x, x ≤ up x

/-- A closed real interval `[lo, hi]`. -/
structure Interval where
  lo : ℝ
  hi : ℝ
  le : lo ≤ hi

namespace Interval

/-- Membership `x ∈ [lo, hi]`. -/
def Mem (x : ℝ) (I : Interval) : Prop := I.lo ≤ x ∧ x ≤ I.hi

@[inherit_doc] scoped infix:50 " ∈ᵢ " => Mem

/-- Degenerate interval of an exactly representable value. -/
def point (x : ℝ) : Interval := ⟨x, x, le_rfl⟩

lemma mem_point (x : ℝ) : x ∈ᵢ point x := ⟨le_rfl, le_rfl⟩

/-- `max(|lo|, |hi|)`. -/
noncomputable def mag (I : Interval) : ℝ := max |I.lo| |I.hi|

lemma abs_le_mag {x : ℝ} {I : Interval} (h : x ∈ᵢ I) : |x| ≤ mag I := by
  unfold mag; rcases h with ⟨h1, h2⟩
  rcases le_total 0 x with hx | hx
  · rw [abs_of_nonneg hx]; exact le_max_of_le_right (h2.trans (le_abs_self _))
  · rw [abs_of_nonpos hx]; exact le_max_of_le_left (by rw [abs_eq_max_neg]; exact le_max_of_le_right (by linarith))

lemma sq_le_mag_sq {x : ℝ} {I : Interval} (h : x ∈ᵢ I) : x ^ 2 ≤ mag I ^ 2 := by
  have := abs_le_mag h
  rw [← sq_abs]; exact pow_le_pow_left₀ (abs_nonneg x) this 2

variable (r : Rounding)

noncomputable def add (I J : Interval) : Interval :=
  ⟨r.down (I.lo + J.lo), r.up (I.hi + J.hi),
    (r.down_le _).trans ((add_le_add I.le J.le).trans (r.le_up _))⟩

noncomputable def sub (I J : Interval) : Interval :=
  ⟨r.down (I.lo - J.hi), r.up (I.hi - J.lo),
    (r.down_le _).trans ((sub_le_sub I.le J.le).trans (r.le_up _))⟩

/-- Minimum and maximum of four corner values. -/
noncomputable def min4 (a b c d : ℝ) : ℝ := min (min (min a b) c) d
noncomputable def max4 (a b c d : ℝ) : ℝ := max (max (max a b) c) d

lemma min4_le_max4 (a b c d : ℝ) : min4 a b c d ≤ max4 a b c d := by
  unfold min4 max4
  exact (min_le_right _ _).trans (le_max_right _ _)

noncomputable def mul (I J : Interval) : Interval :=
  ⟨r.down (min4 (I.lo * J.lo) (I.lo * J.hi) (I.hi * J.lo) (I.hi * J.hi)),
   r.up (max4 (I.lo * J.lo) (I.lo * J.hi) (I.hi * J.lo) (I.hi * J.hi)),
   (r.down_le _).trans ((min4_le_max4 _ _ _ _).trans (r.le_up _))⟩

/-- Division by corner quotients (sound when `0 ∉ J`). -/
noncomputable def div (I J : Interval) : Interval :=
  ⟨r.down (min4 (I.lo / J.lo) (I.lo / J.hi) (I.hi / J.lo) (I.hi / J.hi)),
   r.up (max4 (I.lo / J.lo) (I.lo / J.hi) (I.hi / J.lo) (I.hi / J.hi)),
   (r.down_le _).trans ((min4_le_max4 _ _ _ _).trans (r.le_up _))⟩

/-- Square root: `[max(down √lo, 0), up √hi]` (as in Rust). -/
noncomputable def sqrt (I : Interval) : Interval :=
  ⟨max (r.down (Real.sqrt I.lo)) 0, r.up (Real.sqrt I.hi),
   max_le (((r.down_le _).trans (Real.sqrt_le_sqrt I.le)).trans (r.le_up _))
     ((Real.sqrt_nonneg _).trans (r.le_up _))⟩

/-- Tight square: `0` lower bound when the interval straddles zero (as in Rust). -/
noncomputable def square (I : Interval) : Interval :=
  ⟨if I.lo ≤ 0 ∧ 0 ≤ I.hi then 0
     else max (r.down (min |I.lo| |I.hi| * min |I.lo| |I.hi|)) 0,
   r.up (max |I.lo| |I.hi| * max |I.lo| |I.hi|),
   by
     have h0 : 0 ≤ max |I.lo| |I.hi| * max |I.lo| |I.hi| := mul_self_nonneg _
     have hm : min |I.lo| |I.hi| * min |I.lo| |I.hi| ≤ max |I.lo| |I.hi| * max |I.lo| |I.hi| :=
       mul_self_le_mul_self (le_min (abs_nonneg _) (abs_nonneg _)) (min_le_max)
     split_ifs
     · exact h0.trans (r.le_up _)
     · exact max_le (((r.down_le _).trans hm).trans (r.le_up _)) (h0.trans (r.le_up _))⟩

/-! ### Inclusion theorems -/

variable {r}

theorem mem_add {x y : ℝ} {I J : Interval} (hx : x ∈ᵢ I) (hy : y ∈ᵢ J) :
    x + y ∈ᵢ add r I J :=
  ⟨(r.down_le _).trans (add_le_add hx.1 hy.1), (add_le_add hx.2 hy.2).trans (r.le_up _)⟩

theorem mem_sub {x y : ℝ} {I J : Interval} (hx : x ∈ᵢ I) (hy : y ∈ᵢ J) :
    x - y ∈ᵢ sub r I J :=
  ⟨(r.down_le _).trans (sub_le_sub hx.1 hy.2), (sub_le_sub hx.2 hy.1).trans (r.le_up _)⟩

/-- Corner lemma: a product of reals in two intervals lies between the min and max of
the four corner products. -/
lemma mul_mem_corners {x y a b c d : ℝ} (hx : a ≤ x ∧ x ≤ b) (hy : c ≤ y ∧ y ≤ d) :
    min4 (a * c) (a * d) (b * c) (b * d) ≤ x * y ∧
      x * y ≤ max4 (a * c) (a * d) (b * c) (b * d) := by
  obtain ⟨hax, hxb⟩ := hx; obtain ⟨hcy, hyd⟩ := hy
  unfold min4 max4
  -- x*y lies between a*y and b*y; each of those lies between corner values
  have h1 : min (a * y) (b * y) ≤ x * y ∧ x * y ≤ max (a * y) (b * y) := by
    rcases le_total 0 y with h | h
    · exact ⟨(min_le_left _ _).trans (by nlinarith), le_max_of_le_right (by nlinarith)⟩
    · exact ⟨(min_le_right _ _).trans (by nlinarith), le_max_of_le_left (by nlinarith)⟩
  have ha : min (a * c) (a * d) ≤ a * y ∧ a * y ≤ max (a * c) (a * d) := by
    rcases le_total 0 a with h | h
    · exact ⟨(min_le_left _ _).trans (by nlinarith), le_max_of_le_right (by nlinarith)⟩
    · exact ⟨(min_le_right _ _).trans (by nlinarith), le_max_of_le_left (by nlinarith)⟩
  have hb : min (b * c) (b * d) ≤ b * y ∧ b * y ≤ max (b * c) (b * d) := by
    rcases le_total 0 b with h | h
    · exact ⟨(min_le_left _ _).trans (by nlinarith), le_max_of_le_right (by nlinarith)⟩
    · exact ⟨(min_le_right _ _).trans (by nlinarith), le_max_of_le_left (by nlinarith)⟩
  constructor
  · refine le_trans ?_ h1.1
    refine le_min ?_ ?_
    · exact ((min_le_left _ _).trans (min_le_left _ _)).trans ha.1
    · refine le_trans ?_ hb.1
      exact le_min ((min_le_left _ _).trans (min_le_right _ _)) (min_le_right _ _)
  · refine h1.2.trans ?_
    refine max_le ?_ ?_
    · refine ha.2.trans (max_le ?_ ?_)
      · exact le_max_of_le_left (le_max_of_le_left (le_max_left _ _))
      · exact le_max_of_le_left (le_max_of_le_left (le_max_right _ _))
    · refine hb.2.trans (max_le ?_ ?_)
      · exact le_max_of_le_left (le_max_right _ _)
      · exact le_max_right _ _

theorem mem_mul {x y : ℝ} {I J : Interval} (hx : x ∈ᵢ I) (hy : y ∈ᵢ J) :
    x * y ∈ᵢ mul r I J := by
  have := mul_mem_corners hx hy
  exact ⟨(r.down_le _).trans this.1, this.2.trans (r.le_up _)⟩

/-- `0 ∉ J`, in the form checked by the Rust code. -/
def NoZero (J : Interval) : Prop := 0 < J.lo ∨ J.hi < 0

lemma inv_mem {y : ℝ} {J : Interval} (hy : y ∈ᵢ J) (hJ : NoZero J) :
    J.hi⁻¹ ≤ y⁻¹ ∧ y⁻¹ ≤ J.lo⁻¹ := by
  obtain ⟨h1, h2⟩ := hy
  rcases hJ with h | h
  · exact ⟨inv_anti₀ (by linarith) h2, inv_anti₀ h h1⟩
  · constructor
    · exact (inv_le_inv_of_neg (by linarith) (by linarith)).mpr h2
    · exact (inv_le_inv_of_neg (by linarith) (by linarith)).mpr h1

theorem mem_div {x y : ℝ} {I J : Interval} (hx : x ∈ᵢ I) (hy : y ∈ᵢ J) (hJ : NoZero J) :
    x / y ∈ᵢ div r I J := by
  have hinv := inv_mem hy hJ
  have := mul_mem_corners (x := x) (y := y⁻¹) (a := I.lo) (b := I.hi) (c := J.hi⁻¹) (d := J.lo⁻¹)
    hx hinv
  simp only [← div_eq_mul_inv] at this
  have e1 : min4 (I.lo / J.hi) (I.lo / J.lo) (I.hi / J.hi) (I.hi / J.lo) =
      min4 (I.lo / J.lo) (I.lo / J.hi) (I.hi / J.lo) (I.hi / J.hi) := by
    unfold min4
    simp only [min_def]; split_ifs <;> linarith
  have e2 : max4 (I.lo / J.hi) (I.lo / J.lo) (I.hi / J.hi) (I.hi / J.lo) =
      max4 (I.lo / J.lo) (I.lo / J.hi) (I.hi / J.lo) (I.hi / J.hi) := by
    unfold max4
    simp only [max_def]; split_ifs <;> linarith
  rw [e1, e2] at this
  exact ⟨(r.down_le _).trans this.1, this.2.trans (r.le_up _)⟩

theorem mem_sqrt {x : ℝ} {I : Interval} (hx : x ∈ᵢ I) : Real.sqrt x ∈ᵢ sqrt r I :=
  ⟨max_le ((r.down_le _).trans (Real.sqrt_le_sqrt hx.1)) (Real.sqrt_nonneg _),
   (Real.sqrt_le_sqrt hx.2).trans (r.le_up _)⟩

theorem mem_square {x : ℝ} {I : Interval} (hx : x ∈ᵢ I) : x * x ∈ᵢ square r I := by
  obtain ⟨h1, h2⟩ := hx
  have habs : |x| ≤ max |I.lo| |I.hi| := abs_le_mag ⟨h1, h2⟩
  refine ⟨?_, ?_⟩
  · show (if I.lo ≤ 0 ∧ 0 ≤ I.hi then 0 else _) ≤ x * x
    split_ifs with h
    · exact mul_self_nonneg x
    · refine max_le ((r.down_le _).trans ?_) (mul_self_nonneg x)
      have hmn : min |I.lo| |I.hi| ≤ |x| := by
        rcases not_and_or.mp h with h | h
        · push Not at h
          exact (min_le_left _ _).trans (by rw [abs_of_pos h, abs_of_pos (by linarith)]; exact h1)
        · push Not at h
          exact (min_le_right _ _).trans
            (by rw [abs_of_neg h, abs_of_neg (by linarith)]; linarith)
      rw [← abs_mul_abs_self x]
      exact mul_self_le_mul_self (le_min (abs_nonneg _) (abs_nonneg _)) hmn
  · refine le_trans ?_ (r.le_up _)
    rw [← abs_mul_abs_self x]
    exact mul_self_le_mul_self (abs_nonneg _) habs

end Interval

end Certify
