/-
Executable checker for load-combination certificate bundles (CERTIFY.md, "Independent
checking: certificate bundles", combinations). Core and `Std` only, like
`Certify.BundleCheck`, whose dyadic arithmetic and linear-static check it reuses;
`Certify.ComboSound` proves `check_sound_disp` and `check_sound_quantities` about the
`check` defined here.

Data (`n` free DOFs):
* `base` — the shared reduced stiffness `K`, the factor `L'` and `μ` (as in a
  linear-static bundle; its own `fLo`, `fHi`, `u`, `bound` are not used);
* `cases` — per load case `i`: the enclosure `[fLoᵢ, fHiᵢ]` of its right-hand side, its
  computed solution `ũᵢ` and bound `bᵢ` (each case is a full linear-static certificate
  sharing `K`, `L'`, `μ`: one Gershgorin test, one residual test per case);
* `combos` — per combination `j`: factors `(i, cᵢ)`, the computed combined solution `ũ_j`
  and its claimed bound `B_j`; checked: `B_j ≥ Σ |cᵢ| bᵢ + ‖Σ cᵢ ũᵢ − ũ_j‖₂` (the norm
  via its square, exactly);
* `envMaxAbs`, `envBound` — the envelope: `envMaxAbs[k] = max_j |ũ_j[k]|` exactly, and
  `envBound ≥ B_j` for every `j`;
* quantities — any other per-case scalar results (member end forces) with per-case
  bounds `b_{i,q}` that are *assumed* (they come from `forces.rs`), combination values and
  bounds `B_{j,q} ≥ Σ |cᵢ| b_{i,q} + |Σ cᵢ v_{i,q} − v_{j,q}|`, and envelope bounds
  `E_q ≥ B_{j,q}` (the interval linear-combination rule, checked exactly).
-/
import Certify.BundleCheck

namespace Certify.Combo

open Certify.Bundle

structure Case where
  fLo : Array Dy
  fHi : Array Dy
  u : Array Dy
  bound : Dy
  deriving Inhabited

structure Combo where
  factors : List (Nat × Dy)
  u : Array Dy
  bound : Dy
  deriving Inhabited

structure CBundle where
  base : Bundle
  cases : Array Case
  combos : Array Combo
  envMaxAbs : Array Dy
  envBound : Dy
  nq : Nat
  caseVals : Array (Array Dy)
  caseBounds : Array (Array Dy)
  comboVals : Array (Array Dy)
  comboBounds : Array (Array Dy)
  envQBounds : Array Dy

/-- Case `c` as a linear-static bundle over the shared `K`, `L'`, `μ`. -/
def caseBundle (cb : CBundle) (c : Case) : Bundle :=
  { cb.base with fLo := c.fLo, fHi := c.fHi, u := c.u, bound := c.bound }

def dsum (l : List Dy) : Dy := l.foldr (· + ·) 0

/-! ### Displacements -/

def caseAt (cb : CBundle) (i : Nat) : Case := cb.cases.getD i default
def comboAt (cb : CBundle) (j : Nat) : Combo := cb.combos.getD j default

/-- `Σ |cᵢ| bᵢ` -/
def linBound (cb : CBundle) (co : Combo) : Dy :=
  dsum (co.factors.map fun p => p.2.abs * (caseAt cb p.1).bound)

/-- `(Σ cᵢ ũᵢ[k] − ũ_j[k])²` -/
def devTerm (cb : CBundle) (co : Combo) (k : Nat) : Dy :=
  let r := dsum (co.factors.map fun p => p.2 * (caseAt cb p.1).u.getD k 0) - co.u.getD k 0
  r * r

def dev2 (cb : CBundle) (co : Combo) : Dy := dsum ((List.range cb.base.n).map (devTerm cb co))

def comboOk (cb : CBundle) (co : Combo) : Bool :=
  co.factors.all (fun p => decide (p.1 < cb.cases.size)) &&
  (co.bound - linBound cb co).nonneg &&
  Dy.le (dev2 cb co) ((co.bound - linBound cb co) * (co.bound - linBound cb co))

def casesOk (cb : CBundle) : Bool :=
  gershgorinOk cb.base &&
  cb.cases.all fun c => shapeOk (caseBundle cb c) && residualOk (caseBundle cb c)

/-- `envMaxAbs[k] = max_j |ũ_j[k]|` for every DOF, and `envBound ≥ B_j` for every `j`. -/
def envelopeOk (cb : CBundle) : Bool :=
  decide (0 < cb.combos.size) &&
  cb.combos.all (fun co => Dy.le co.bound cb.envBound) &&
  (List.range cb.base.n).all fun k =>
    cb.combos.all (fun co => Dy.le (co.u.getD k 0).abs (cb.envMaxAbs.getD k 0)) &&
    cb.combos.any (fun co => Dy.le (cb.envMaxAbs.getD k 0) (co.u.getD k 0).abs)

/-! ### Other quantities (assumed per-case bounds) -/

def qAt (A : Array (Array Dy)) (i q : Nat) : Dy := (A.getD i #[]).getD q 0

/-- `Σ |cᵢ| b_{i,q} + |Σ cᵢ v_{i,q} − v_{j,q}| ≤ B_{j,q} ≤ E_q` -/
def quantityOk (cb : CBundle) (j q : Nat) : Bool :=
  let co := comboAt cb j
  let lin := dsum (co.factors.map fun p => p.2.abs * qAt cb.caseBounds p.1 q)
  let dev := (dsum (co.factors.map fun p => p.2 * qAt cb.caseVals p.1 q) - qAt cb.comboVals j q).abs
  Dy.le (lin + dev) (qAt cb.comboBounds j q) && Dy.le (qAt cb.comboBounds j q) (cb.envQBounds.getD q 0)

def quantitiesOk (cb : CBundle) : Bool :=
  (List.range cb.combos.size).all fun j => (List.range cb.nq).all (quantityOk cb j)

/-- The verified checker (`Certify.Combo.check_sound_disp`,
`Certify.Combo.check_sound_quantities`). -/
def check (cb : CBundle) : Bool :=
  casesOk cb && cb.combos.all (comboOk cb) && envelopeOk cb && quantitiesOk cb

end Certify.Combo
