/-
Cholesky soundness (CERTIFY.md, "Certifying S − σI ⪰ 0").

The algorithm is the classic column-by-column (Cholesky–Crout) factorization
`M = L Lᵀ`, written once over an abstract operation set `Ops α` and instantiated
both over `ℝ` (exact) and over `Interval` (outward rounded):

    for j in 0..n:
      d_j  = (((M_jj − L_j0²) − L_j1²) − … − L_j,j−1²)          -- pivot
      L_jj = √d_j
      for i ≠ j:
        L_ij = ((((M_ij − L_i0·L_j0) − L_i1·L_j1) − …) − L_i,j−1·L_j,j−1) / L_jj

Over `ℝ`: if `M` is symmetric and every pivot `d_j > 0`, then `M = L Lᵀ` with `L`
lower triangular with positive diagonal, hence `M` is positive definite.
Over intervals: if `M ∈ 𝕄` entrywise and every interval pivot has `lo > 0` (and its
square root interval has `lo > 0`, which Rust enforces via the division's zero check),
then every real quantity lies in its interval, so every real pivot is `> 0`.
-/
import Certify.Basic
import Certify.Interval

open Matrix Finset

namespace Certify

/-- The operations Cholesky uses. -/
structure Ops (α : Type) where
  sub : α → α → α
  mul : α → α → α
  div : α → α → α
  sqrt : α → α
  sq : α → α

/-- `(((a − f 0) − f 1) − …) − f (j−1)`, evaluated left to right. -/
def foldSub {α : Type} (o : Ops α) : (j : ℕ) → α → (Fin j → α) → α
  | 0, a, _ => a
  | j + 1, a, f => o.sub (foldSub o j a (fun k => f k.castSucc)) (f (Fin.last j))

/-- Cholesky factor entry `L i j` of the matrix `a` (only `i ≥ j` is meaningful;
for `i < j` it is computed by the same off-diagonal formula and never used). -/
def cl {α : Type} (o : Ops α) (a : ℕ → ℕ → α) (i j : ℕ) : α :=
  if i = j then o.sqrt (foldSub o j (a j j) (fun k => o.sq (cl o a j k)))
  else o.div (foldSub o j (a i j) (fun k => o.mul (cl o a i k) (cl o a j k)))
    (o.sqrt (foldSub o j (a j j) (fun k => o.sq (cl o a j k))))
termination_by j
decreasing_by all_goals exact k.2

/-- The `j`-th pivot `d_j` (before the square root). -/
def piv {α : Type} (o : Ops α) (a : ℕ → ℕ → α) (j : ℕ) : α :=
  foldSub o j (a j j) (fun k => o.sq (cl o a j k))

/-- The off-diagonal numerator. -/
def offNum {α : Type} (o : Ops α) (a : ℕ → ℕ → α) (i j : ℕ) : α :=
  foldSub o j (a i j) (fun k => o.mul (cl o a i k) (cl o a j k))

lemma cl_eq {α : Type} (o : Ops α) (a : ℕ → ℕ → α) (i j : ℕ) :
    cl o a i j = if i = j then o.sqrt (piv o a j) else o.div (offNum o a i j) (o.sqrt (piv o a j)) := by
  rw [cl]; rfl

/-- Exact real operations. -/
noncomputable def realOps : Ops ℝ := ⟨(· - ·), (· * ·), (· / ·), Real.sqrt, fun x => x * x⟩

open Certify.Interval in
/-- Outward-rounded interval operations. -/
noncomputable def intervalOps (r : Rounding) : Ops Interval :=
  ⟨Interval.sub r, Interval.mul r, Interval.div r, Interval.sqrt r, Interval.square r⟩

/-- Extend a matrix to `ℕ × ℕ` by a default value. -/
def extend {α : Type} {n : ℕ} (d : α) (M : Matrix (Fin n) (Fin n) α) : ℕ → ℕ → α :=
  fun i j => if h : i < n ∧ j < n then M ⟨i, h.1⟩ ⟨j, h.2⟩ else d

lemma extend_fin {α : Type} {n : ℕ} (d : α) (M : Matrix (Fin n) (Fin n) α) (i j : Fin n) :
    extend d M i j = M i j := by
  simp [extend]

/-! ### Exact real Cholesky -/

lemma foldSub_real (j : ℕ) (a : ℝ) (f : Fin j → ℝ) : foldSub realOps j a f = a - ∑ k, f k := by
  induction j with
  | zero => simp [foldSub]
  | succ j ih =>
    simp only [foldSub, ih, Fin.sum_univ_castSucc]
    simp [realOps]; ring

/-- The real pivots are all positive (up to `n`). -/
def PivotsPos (a : ℕ → ℕ → ℝ) (n : ℕ) : Prop := ∀ j < n, 0 < piv realOps a j

/-- Row identity: `∑_{k ≤ j} L_ik L_jk = a_ij` for every row `i` (the defining
equations of the algorithm). -/
lemma cl_row_sum (a : ℕ → ℕ → ℝ) (j : ℕ) (hj : 0 < piv realOps a j) (i : ℕ) :
    ∑ k : Fin (j + 1), cl realOps a i k * cl realOps a j k = a i j := by
  rw [Fin.sum_univ_castSucc]
  simp only [Fin.val_castSucc, Fin.val_last]
  have hjj : cl realOps a j j = Real.sqrt (piv realOps a j) := by
    rw [cl_eq]; simp [realOps]
  have hsq : cl realOps a j j * cl realOps a j j = piv realOps a j := by
    rw [hjj]; exact Real.mul_self_sqrt hj.le
  have hpos : 0 < cl realOps a j j := by rw [hjj]; exact Real.sqrt_pos.mpr hj
  by_cases hij : i = j
  · subst hij
    rw [hsq, piv, foldSub_real]; simp [realOps]
  · have hcl : cl realOps a i j = offNum realOps a i j / cl realOps a j j := by
      rw [cl_eq, ite_eq_right_of_eq_false _ _ (eq_false hij), hjj]; rfl
    rw [hcl, div_mul_cancel₀ _ hpos.ne', offNum, foldSub_real]
    simp [realOps]

lemma cl_diag_pos (a : ℕ → ℕ → ℝ) (j : ℕ) (hj : 0 < piv realOps a j) :
    0 < cl realOps a j j := by
  rw [cl_eq]; simpa [realOps] using hj

/-- The lower-triangular Cholesky factor as a matrix. -/
noncomputable def cholL {n : ℕ} (a : ℕ → ℕ → ℝ) : Matrix (Fin n) (Fin n) ℝ :=
  fun i j => if j ≤ i then cl realOps a i j else 0

lemma cholL_lower {n : ℕ} (a : ℕ → ℕ → ℝ) : (cholL (n := n) a).IsLowerTriangular := by
  intro i j h
  have : i < j := h
  simp [cholL, not_le.mpr this]

/-- For `j ≤ i`: `(L Lᵀ)_ij = a_ij`. -/
lemma cholL_mul_apply_le {n : ℕ} (a : ℕ → ℕ → ℝ) (hp : PivotsPos a n) (i j : Fin n)
    (hji : j ≤ i) : (cholL (n := n) a * (cholL (n := n) a)ᵀ) i j = a i j := by
  rw [Matrix.mul_apply]
  simp only [Matrix.transpose_apply, cholL]
  have : ∀ k : Fin n, (if k ≤ i then cl realOps a i k else 0) * (if k ≤ j then cl realOps a j k else 0)
      = if (k : ℕ) < j + 1 then cl realOps a i k * cl realOps a j k else 0 := by
    intro k
    by_cases hk : k ≤ j
    · have hk' : k ≤ i := hk.trans hji
      have : (k : ℕ) < j + 1 := Nat.lt_succ_of_le hk
      simp [hk, hk', this]
    · have : ¬ ((k : ℕ) < j + 1) := by
        intro h; exact hk (Fin.le_def.mpr (Nat.le_of_lt_succ h))
      simp [hk, this]
  rw [Finset.sum_congr rfl (fun k _ => this k)]
  rw [Fin.sum_univ_eq_sum_range (fun k => if k < (j : ℕ) + 1 then cl realOps a i k * cl realOps a j k else 0)]
  rw [← Finset.sum_filter]
  have hfilt : (Finset.range n).filter (fun k => k < (j : ℕ) + 1) = Finset.range ((j : ℕ) + 1) := by
    ext k; simp only [Finset.mem_filter, Finset.mem_range]; omega
  rw [hfilt, ← Fin.sum_univ_eq_sum_range (fun k => cl realOps a i k * cl realOps a j k)]
  exact cl_row_sum a j (hp j j.2) i

/-- `M = L Lᵀ` for a symmetric matrix with positive real pivots. -/
theorem cholesky_factor {n : ℕ} (M : Matrix (Fin n) (Fin n) ℝ) (hM : M.IsSymm)
    (hp : PivotsPos (extend 0 M) n) : cholL (n := n) (extend 0 M) * (cholL (n := n) (extend 0 M))ᵀ = M := by
  ext i j
  rcases le_total j i with h | h
  · rw [cholL_mul_apply_le _ hp i j h, extend_fin]
  · have hs : (cholL (n := n) (extend 0 M) * (cholL (n := n) (extend 0 M))ᵀ) i j
        = (cholL (n := n) (extend 0 M) * (cholL (n := n) (extend 0 M))ᵀ) j i := by
      simp only [Matrix.mul_apply, Matrix.transpose_apply, mul_comm]
    rw [hs, cholL_mul_apply_le _ hp j i h, extend_fin, hM.apply i j]

/-- **Cholesky soundness.** A symmetric real matrix whose exact Cholesky pivots are all
positive is positive definite. -/
theorem posDef_of_pivots_pos {n : ℕ} (M : Matrix (Fin n) (Fin n) ℝ) (hM : M.IsSymm)
    (hp : PivotsPos (extend 0 M) n) : M.PosDef := by
  set L := cholL (n := n) (extend 0 M)
  have hfac : L * Lᵀ = M := cholesky_factor M hM hp
  have hdet : Lᵀ.det ≠ 0 := by
    rw [Matrix.det_transpose, Matrix.det_of_isLowerTriangular L (cholL_lower _)]
    refine Finset.prod_ne_zero_iff.mpr fun i _ => ?_
    simp only [L, cholL, le_refl, ite_true]
    exact (cl_diag_pos _ i (hp i i.2)).ne'
  refine Matrix.PosDef.of_dotProduct_mulVec_pos ?_ fun x hx => ?_
  · exact Matrix.isHermitian_iff_isSymm.mpr hM
  · rw [← hfac, star_trivial, ← Matrix.mulVec_mulVec, Matrix.dotProduct_mulVec,
      ← Matrix.mulVec_transpose]
    have hne : Lᵀ *ᵥ x ≠ 0 := by
      intro h0
      exact hdet (Matrix.exists_mulVec_eq_zero_iff.mp ⟨x, hx, h0⟩)
    rw [dotProduct_self_eq]
    rw [← vnorm_sq]
    have : vnorm (Lᵀ *ᵥ x) ≠ 0 := fun h => hne (vnorm_eq_zero.mp h)
    positivity

/-- Hence also positive semidefinite (all that the error bound needs). -/
theorem posSemidef_of_pivots_pos {n : ℕ} (M : Matrix (Fin n) (Fin n) ℝ) (hM : M.IsSymm)
    (hp : PivotsPos (extend 0 M) n) : M.PosSemidef :=
  (posDef_of_pivots_pos M hM hp).posSemidef

/-! ### Interval Cholesky encloses real Cholesky -/

open Certify.Interval

lemma foldSub_mem (r : Rounding) (j : ℕ) {a : ℝ} {A : Interval} {f : Fin j → ℝ}
    {F : Fin j → Interval} (ha : a ∈ᵢ A) (hf : ∀ k, f k ∈ᵢ F k) :
    foldSub realOps j a f ∈ᵢ foldSub (intervalOps r) j A F := by
  induction j with
  | zero => exact ha
  | succ j ih =>
    exact mem_sub (ih (fun k => hf k.castSucc)) (hf (Fin.last j))

/-- The interval check: every pivot interval, and its square-root interval, has a
strictly positive lower bound. -/
def IntervalPivotsPos (r : Rounding) (A : ℕ → ℕ → Interval) (n : ℕ) : Prop :=
  ∀ j < n, 0 < (piv (intervalOps r) A j).lo ∧ 0 < (Interval.sqrt r (piv (intervalOps r) A j)).lo

/-- Inclusion propagates through the whole algorithm. -/
theorem cholesky_mem (r : Rounding) {n : ℕ} {a : ℕ → ℕ → ℝ} {A : ℕ → ℕ → Interval}
    (hmem : ∀ i j, a i j ∈ᵢ A i j) (hp : IntervalPivotsPos r A n) :
    ∀ j < n, piv realOps a j ∈ᵢ piv (intervalOps r) A j ∧
      ∀ i, cl realOps a i j ∈ᵢ cl (intervalOps r) A i j := by
  intro j
  induction j using Nat.strong_induction_on with
  | _ j ih =>
    intro hj
    have hpiv : piv realOps a j ∈ᵢ piv (intervalOps r) A j :=
      foldSub_mem r j (hmem j j) (fun k => mem_square ((ih k k.2 (k.2.trans hj)).2 j))
    refine ⟨hpiv, fun i => ?_⟩
    rw [cl_eq, cl_eq]
    have hs := mem_sqrt (r := r) hpiv
    split_ifs
    · exact hs
    · refine mem_div ?_ hs (Or.inl (hp j hj).2)
      exact foldSub_mem r j (hmem i j)
        (fun k => mem_mul ((ih k k.2 (k.2.trans hj)).2 i) ((ih k k.2 (k.2.trans hj)).2 j))

/-- **Interval Cholesky soundness.** Interval pivots with positive lower bounds imply
positive real pivots. -/
theorem pivotsPos_of_interval (r : Rounding) {n : ℕ} {a : ℕ → ℕ → ℝ} {A : ℕ → ℕ → Interval}
    (hmem : ∀ i j, a i j ∈ᵢ A i j) (hp : IntervalPivotsPos r A n) : PivotsPos a n :=
  fun j hj => lt_of_lt_of_le (hp j hj).1 (cholesky_mem r hmem hp j hj).1.1

/-- A symmetric real matrix entrywise contained in an interval matrix that passes the
interval Cholesky check is positive definite. -/
theorem posDef_of_interval_cholesky (r : Rounding) {n : ℕ} (M : Matrix (Fin n) (Fin n) ℝ)
    (IM : Matrix (Fin n) (Fin n) Interval) (hM : M.IsSymm) (hmem : ∀ i j, M i j ∈ᵢ IM i j)
    (hp : IntervalPivotsPos r (extend (Interval.point 0) IM) n) : M.PosDef := by
  refine posDef_of_pivots_pos M hM (pivotsPos_of_interval r ?_ hp)
  intro i j
  unfold extend
  split_ifs
  · exact hmem _ _
  · exact mem_point 0

end Certify
