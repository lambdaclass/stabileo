/-
Executable checker for plastic-collapse certificate bundles (CERTIFY.md, "Independent
checking: certificate bundles", plastic collapse).

The bundle states a discretized rigid–perfectly-plastic limit-analysis problem and two
certificates for it, all in exact rationals (`Rat`, Lean core: this module needs no
Mathlib, so `lake exe certcheck` compiles natively). `Certify.PlasticSound` proves
`check_sound` about the `check` defined here.

The problem, with unknown generalized stresses `x ∈ ℝ^nv` (member end forces) and load
factor `λ`:
* **equilibrium** — rows `Σ aᵢ xᵢ = λ p` (every free nodal DOF, every release);
* **yield** — for every yield member, every piece `[a, b]` of it and every `t ∈ [a, b]`,
  `Σ_c M_c(t)² / (n_c · Mp_c²) ≤ 1`, where each bending component `M_c(t)` is a cubic in
  `t` whose four coefficients are affine functionals of `(x, λ)` (`Lin`), `n_c > 0` is a
  metric weight (`|u_c|²` for a non-unit local axis `u_c`; `1` in 2D) and `Mp_c` is the
  plastic moment, known to lie in `[mpLo_c, mpHi_c]`. In 2D (one component) this is
  `|M(t)| ≤ Mp`; in 3D (two) the biaxial ellipse `(M_y/Mp_y)² + (M_z/Mp_z)² ≤ 1`.

The certificates:
* **static** (lower bound) — `(λ_lo, x)`: every equilibrium row holds exactly, and on every
  piece the cut points `a < cuts… < b` split `[a, b]` into segments on which
  `Σ_c B_c² / (n_c · mpLo_c²) ≤ 1`, `B_c` the largest absolute Bernstein coefficient of
  `M_c` on the segment (so `B_c ≥ max |M_c|` there);
* **kinematic** (upper bound) — multipliers `u` (one per row) and hinges (member, piece,
  `t ∈ [a, b]`, rotations `θ_c`, dissipation bound `D_h`) such that, as linear forms in
  `x`, `Σ_r u_r · row_r(x) = Σ_h Σ_c θ_{h,c} · (M_c(t_h) − λ-part)` (all coefficients equal,
  checked exactly), the work `W = Σ_r u_r p_r + Σ_h Σ_c θ_{h,c} · (λ-coefficient of
  M_c(t_h))` is positive, `D_h ≥ 0`, `D_h² ≥ Σ_c θ_{h,c}² n_c mpHi_c²`, and
  `Σ_h D_h ≤ λ_up · W`. (For a compatible mechanism this identity is the virtual-work
  equation; `u` are the nodal virtual displacements and release rotations.)
-/

namespace Certify.Plastic

/-- The affine functional `(x, λ) ↦ Σ c · x_i + lam · λ` (`terms` are `(i, c)`). -/
structure Lin where
  terms : List (Nat × Rat)
  lam : Rat
  deriving Inhabited

/-- A cubic `c0 + c1 t + c2 t² + c3 t³` whose coefficients are functionals of `(x, λ)`. -/
structure Cubic where
  c0 : Lin
  c1 : Lin
  c2 : Lin
  c3 : Lin
  deriving Inhabited

/-- One bending component of a member's yield condition. -/
structure Comp where
  n : Rat
  mpLo : Rat
  mpHi : Rat
  deriving Inhabited

/-- A piece `[a, b]` of a member: one cubic per component, and the static certificate's
cut points inside `[a, b]`. -/
structure Piece where
  a : Rat
  b : Rat
  polys : Array Cubic
  cuts : List Rat
  deriving Inhabited

structure Member where
  comps : Array Comp
  pieces : Array Piece
  deriving Inhabited

/-- The equilibrium row `Σ aᵢ xᵢ = λ p`. -/
structure Row where
  terms : List (Nat × Rat)
  p : Rat
  deriving Inhabited

structure Hinge where
  member : Nat
  piece : Nat
  t : Rat
  theta : Array Rat
  diss : Rat
  deriving Inhabited

structure PBundle where
  nv : Nat
  rows : Array Row
  members : Array Member
  /-- static certificate -/
  lamLo : Rat
  x : Array Rat
  /-- kinematic certificate -/
  mult : Array Rat
  hinges : List Hinge
  lamUp : Rat

def rabs (a : Rat) : Rat := if a < 0 then -a else a
def rmax (a b : Rat) : Rat := if a ≤ b then b else a

/-- `Σ c · xᵢ` -/
def termsEval (l : List (Nat × Rat)) (x : Array Rat) : Rat := (l.map fun p => p.2 * x.getD p.1 0).sum

def Lin.eval (f : Lin) (x : Array Rat) (lam : Rat) : Rat := termsEval f.terms x + f.lam * lam

/-- The largest absolute Bernstein coefficient of `q0 + q1 t + q2 t² + q3 t³` on `[s, s']`
(Taylor shift to `s`, scale by `h = s' − s`). -/
def bern (q0 q1 q2 q3 s s' : Rat) : Rat :=
  let h := s' - s
  let p0 := q0 + q1 * s + q2 * s * s + q3 * s * s * s
  let d1 := (q1 + 2 * q2 * s + 3 * q3 * s * s) * h
  let d2 := (q2 + 3 * q3 * s) * h * h
  let d3 := q3 * h * h * h
  rmax (rmax (rabs p0) (rabs (p0 + d1 / 3))) (rmax (rabs (p0 + 2 * d1 / 3 + d2 / 3)) (rabs (p0 + d1 + d2 + d3)))

/-- One component on one piece, evaluated at the static field: the four rational
coefficients and the component's data. -/
structure CompVal where
  q0 : Rat
  q1 : Rat
  q2 : Rat
  q3 : Rat
  comp : Comp

def compVals (M : Member) (P : Piece) (x : Array Rat) (lam : Rat) : List CompVal :=
  (List.range M.comps.size).map fun c =>
    let C := P.polys.getD c default
    ⟨C.c0.eval x lam, C.c1.eval x lam, C.c2.eval x lam, C.c3.eval x lam, M.comps.getD c default⟩

/-- `Σ_c B_c² / (n_c · mpLo_c²) ≤ 1` on the segment `[s, s']`. -/
def segOk (vs : List CompVal) (s s' : Rat) : Bool :=
  decide ((vs.map fun v =>
    let B := bern v.q0 v.q1 v.q2 v.q3 s s'
    B * B / (v.comp.n * v.comp.mpLo * v.comp.mpLo)).sum ≤ 1)

/-- The chain `s ≤ p₁ ≤ … ≤ b` and `ok` on each consecutive segment. -/
def coverOk (ok : Rat → Rat → Bool) (b : Rat) : Rat → List Rat → Bool
  | s, [] => decide (s ≤ b) && ok s b
  | s, p :: ps => decide (s ≤ p) && ok s p && coverOk ok b p ps

def compOk (K : Comp) : Bool := decide (0 < K.n) && decide (0 < K.mpLo) && decide (K.mpLo ≤ K.mpHi)

def membersOk (d : PBundle) : Bool := d.members.all fun M => M.comps.all compOk

/-! ### Static certificate -/

def rowOk (x : Array Rat) (lam : Rat) (r : Row) : Bool := decide (termsEval r.terms x = lam * r.p)

def staticOk (d : PBundle) : Bool :=
  d.rows.all (rowOk d.x d.lamLo) &&
  d.members.all fun M => M.pieces.all fun P =>
    coverOk (segOk (compVals M P d.x d.lamLo)) P.b P.a P.cuts

/-! ### Kinematic certificate -/

/-- `t^j`-weighted coefficient list `[(c0, 1), (c1, t), (c2, t²), (c3, t³)]`. -/
def cubicTerms (C : Cubic) (t : Rat) : List (Lin × Rat) := [(C.c0, 1), (C.c1, t), (C.c2, t * t), (C.c3, t * t * t)]

def hingeMember (d : PBundle) (h : Hinge) : Member := d.members.getD h.member default
def hingePiece (d : PBundle) (h : Hinge) : Piece := (hingeMember d h).pieces.getD h.piece default

/-- The `x`-coefficients of `θ · M(t)` for hinge `h`, negated: `(i, −θ_c tʲ a)`. -/
def hingeTerms (d : PBundle) (h : Hinge) : List (Nat × Rat) :=
  (List.range (hingeMember d h).comps.size).flatMap fun c =>
    (cubicTerms ((hingePiece d h).polys.getD c default) h.t).flatMap fun lw =>
      lw.1.terms.map fun p => (p.1, -(h.theta.getD c 0 * lw.2 * p.2))

/-- The `λ`-coefficient of `θ · M(t)` for hinge `h`. -/
def hingeLam (d : PBundle) (h : Hinge) : Rat :=
  ((List.range (hingeMember d h).comps.size).map fun c =>
    h.theta.getD c 0 * ((cubicTerms ((hingePiece d h).polys.getD c default) h.t).map
      fun lw => lw.2 * lw.1.lam).sum).sum

/-- The multiplier-weighted rows: `(i, u_r aᵢ)`. -/
def rowTerms (d : PBundle) : List (Nat × Rat) :=
  (List.range d.rows.size).flatMap fun r =>
    (d.rows.getD r default).terms.map fun p => (p.1, d.mult.getD r 0 * p.2)

/-- All coefficients of `Σ u_r row_r − Σ θ·M` on `x`. -/
def allTerms (d : PBundle) : List (Nat × Rat) := rowTerms d ++ d.hinges.flatMap (hingeTerms d)

/-- Accumulate `(i, c)` pairs into a dense array of `nv` coefficients. -/
def accum (nv : Nat) (l : List (Nat × Rat)) : Array Rat :=
  l.foldl (fun A p => A.modify p.1 (· + p.2)) (Array.replicate nv 0)

/-- External work of the mechanism at unit load factor. -/
def work (d : PBundle) : Rat :=
  ((List.range d.rows.size).map fun r => d.mult.getD r 0 * (d.rows.getD r default).p).sum +
    (d.hinges.map (hingeLam d)).sum

def hingeOk (d : PBundle) (h : Hinge) : Bool :=
  let M := hingeMember d h
  let P := hingePiece d h
  decide (h.member < d.members.size) && decide (h.piece < M.pieces.size) &&
  decide (P.a ≤ h.t) && decide (h.t ≤ P.b) && decide (0 ≤ h.diss) &&
  decide (((List.range M.comps.size).map fun c =>
    let K := M.comps.getD c default
    let θ := h.theta.getD c 0
    θ * θ * K.n * K.mpHi * K.mpHi).sum ≤ h.diss * h.diss)

def kinematicOk (d : PBundle) : Bool :=
  let A := allTerms d
  A.all (fun p => decide (p.1 < d.nv)) &&
  (accum d.nv A).all (fun v => decide (v = 0)) &&
  d.hinges.all (hingeOk d) &&
  decide (0 < work d) &&
  decide ((d.hinges.map (·.diss)).sum ≤ d.lamUp * work d)

/-- The verified checker. `Certify.Plastic.check_sound`: `check d = true` implies
`lamLo ≤ λ_c ≤ lamUp` for the collapse factor `λ_c` of the problem the data denotes, for
every choice of plastic moments `Mp_c ∈ [mpLo_c, mpHi_c]`. -/
def check (d : PBundle) : Bool := membersOk d && staticOk d && kinematicOk d

end Certify.Plastic
