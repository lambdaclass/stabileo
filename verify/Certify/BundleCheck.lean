/-
Executable checker for linear-static certificate bundles (CERTIFY.md, "Independent
checking: certificate bundles").

Everything is exact dyadic arithmetic (`Dy`: `m · 2^e` with `Int` mantissa, GMP-backed when
compiled): every f64 in the bundle is a dyadic rational, sums and products of dyadics are
dyadic, so nothing is rounded and no rounding model is needed. (Dyadics instead of `Rat`
avoid a gcd per operation: about 4× faster.) This module depends only on Lean core and
`Std`, so `lake exe certcheck` compiles natively without Mathlib; `Certify.BundleSound`
proves `check_sound` about the `check` defined here.

Data, with `n` the number of unknowns:
* `kEnt` — entries `(a, b, v)` of the symmetric matrix `K`: each adds `v` at `(a, b)` and,
  if `a ≠ b`, also at `(b, a)` (the engine exports the lower triangle);
* `fLo`, `fHi` — endpoints of an enclosure of the right-hand side `f`;
* `u` — the computed solution `ũ`;
* `perm`, `lCols` — the factor: column `c` of `L` is the list `lCols[c]` of `(a, v)` in
  permuted numbering, i.e. `L'[perm[a], c] += v` in the original numbering. Nothing about
  `L` is checked or needed (`L' L'ᵀ ⪰ 0` for every real `L'`);
* `mu`, `bound` — the claimed `μ ≤ λ_min(K)` and `‖u* − ũ‖₂ ≤ bound`.

The check: the lower triangle of `R = K − L' L'ᵀ` exactly, one dense column at a time in
fixed point; Gershgorin `μ ≤ Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|` for every row;
`r = f − K ũ` as the exact interval `[fLo − Kũ, fHi − Kũ]`,
`ρ² = Σ max(|loᵢ|, |hiᵢ|)²`, and `ρ² ≤ (bound·μ)²`.
-/
import Std.Data.HashMap

namespace Certify.Bundle

/-- The dyadic rational `m · 2^e`. Representations are not unique (no normalization). -/
structure Dy where
  m : Int
  e : Int
  deriving Inhabited, Repr

namespace Dy

instance : OfNat Dy 0 := ⟨⟨0, 0⟩⟩

/-- `m · 2^k`. -/
@[inline] def shift (m : Int) (k : Nat) : Int := m * ((2 ^ k : Nat) : Int)

/-- Exact sum: align to the smaller exponent (fast paths: a zero operand, equal
exponents). -/
@[inline] protected def add (a b : Dy) : Dy :=
  if a.m = 0 then b
  else if b.m = 0 then a
  else if a.e = b.e then ⟨a.m + b.m, a.e⟩
  else if a.e ≤ b.e then ⟨a.m + shift b.m (b.e - a.e).toNat, a.e⟩
  else ⟨shift a.m (a.e - b.e).toNat + b.m, b.e⟩

@[inline] protected def neg (a : Dy) : Dy := ⟨-a.m, a.e⟩
@[inline] protected def sub (a b : Dy) : Dy := Dy.add a (Dy.neg b)
@[inline] protected def mul (a b : Dy) : Dy := ⟨a.m * b.m, a.e + b.e⟩
@[inline] protected def abs (a : Dy) : Dy := ⟨if a.m < 0 then -a.m else a.m, a.e⟩

instance : Add Dy := ⟨Dy.add⟩
instance : Neg Dy := ⟨Dy.neg⟩
instance : Sub Dy := ⟨Dy.sub⟩
instance : Mul Dy := ⟨Dy.mul⟩

/-- `0 ≤ a` (the sign of `m · 2^e` is the sign of `m`). -/
def nonneg (a : Dy) : Bool := decide (0 ≤ a.m)
def pos (a : Dy) : Bool := decide (0 < a.m)
/-- `a ≤ b`. -/
def le (a b : Dy) : Bool := nonneg (b - a)
def max (a b : Dy) : Dy := if le a b then b else a

end Dy

structure Bundle where
  n : Nat
  kEnt : List (Nat × Nat × Dy)
  fLo : Array Dy
  fHi : Array Dy
  u : Array Dy
  perm : Array Nat
  lCols : Array (List (Nat × Dy))
  mu : Dy
  bound : Dy

/-- Add `v` to the entry at key `k`. -/
@[inline] def addTo {κ : Type} [BEq κ] [Hashable κ] (m : Std.HashMap κ Dy) (k : κ) (v : Dy) :
    Std.HashMap κ Dy :=
  m.alter k fun o => some (o.getD 0 + v)

/-! ### Gershgorin on the exact residual (dense column workspace)

All of `R` is computed in fixed point: entries of `L` as integers at scale `2^E`
(`E` = the smallest exponent in `L`), entries of `R` as integers at scale `2^E2`,
`E2 = min(2E, smallest exponent in K)`. Column `j` of the lower triangle of `R` is
accumulated in a dense array (`resCol`); its Gershgorin contributions go to one array
`g` with `gᵢ · 2^E2 = Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|`. -/

/-- `x · 2^-E` as an integer (exact when `E ≤ x.e`). -/
@[inline] def intAt (E : Int) (x : Dy) : Int := Dy.shift x.m (x.e - E).toNat

/-- The smallest exponent among the entries of `L` (or `0`). -/
def minExpL (d : Bundle) : Int :=
  d.lCols.toList.flatten.foldl (fun acc p => min acc p.2.e) 0

/-- The smallest exponent among the entries of `K` (or `0`). -/
def minExpK (d : Bundle) : Int := d.kEnt.foldl (fun acc e => min acc e.2.2.e) 0

/-- Add `v` at index `i` (no-op out of range). -/
@[inline] def addAt (w : Array Int) (i : Nat) (v : Int) : Array Int := w.modify i (· + v)

/-- Bucket `(key, value)` pairs into `n` lists. -/
def buckets {β : Type} (n : Nat) (l : List (Nat × β)) : Array (List β) :=
  l.foldl (fun A p => A.modify p.1 (List.cons p.2)) (Array.replicate n [])

/-- Fixed-point data for the residual. -/
structure Prep where
  /-- scale of `L` -/
  E : Int
  /-- scale of `R` -/
  E2 : Int
  /-- column `j`: `(i, Kᵢⱼ · 2^-E2)` for the stored entries with `min = j`, `i = max` -/
  kLow : Array (List (Nat × Int))
  /-- column `c` of `L'`: `(perm a, L · 2^-E)` -/
  lc : Array (List (Nat × Int))
  /-- row `i` of `L'`: `(c, −L'ᵢ꜀ · 2^-E · 2^(2E−E2))` -/
  lr : Array (List (Nat × Int))

def prep (d : Bundle) : Prep :=
  let E := minExpL d
  let E2 := min (2 * E) (minExpK d)
  let s := (2 * E - E2).toNat
  let lc := d.lCols.map fun col => col.map fun p => (d.perm.getD p.1 0, intAt E p.2)
  { E, E2
    kLow := buckets d.n (d.kEnt.map fun e => (min e.1 e.2.1, (max e.1 e.2.1, intAt E2 e.2.2)))
    lc
    lr := buckets d.n ((List.range lc.size).flatMap fun c =>
      (lc.getD c []).map fun q => (q.1, (c, -Dy.shift q.2 s))) }

/-- Column `j` of the lower triangle of `R = K − L' L'ᵀ`, scaled by `2^-E2` (rows `i ≥ j`). -/
def resCol (n : Nat) (P : Prep) (j : Nat) : Array Int :=
  let w := (P.kLow.getD j []).foldl (fun w p => addAt w p.1 p.2) (Array.replicate n 0)
  (P.lr.getD j []).foldl (fun w r => (P.lc.getD r.1 []).foldl
    (fun w q => if j ≤ q.1 then addAt w q.1 (q.2 * r.2) else w) w) w

/-- Column `j`'s Gershgorin contributions: `+Rⱼⱼ` to row `j`, and `−|Rᵢⱼ|` to rows `i`
and `j` for each `i > j`. -/
def gershCol (n : Nat) (P : Prep) (g : Array Int) (j : Nat) : Array Int :=
  let w := resCol n P j
  (List.range' (j + 1) (n - (j + 1))).foldl (fun g i =>
    let v := w.getD i 0
    if v = 0 then g else addAt (addAt g i (-(v.natAbs : Int))) j (-(v.natAbs : Int)))
    (addAt g j (w.getD j 0))

/-- `gᵢ · 2^E2 = Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|` for every row `i`. -/
def gershSums (d : Bundle) (P : Prep) : Array Int :=
  (List.range d.n).foldl (gershCol d.n P) (Array.replicate d.n 0)

/-- Gershgorin row test for row `i`: `μ ≤ Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|`. -/
def rowOk (mu : Dy) (E2 : Int) (g : Array Int) (i : Nat) : Bool :=
  Dy.le mu ⟨g.getD i 0, E2⟩

/-- Contribution of one `K` entry to `K ũ`. -/
@[inline] def addKu (u : Array Dy) (m : Std.HashMap Nat Dy) (e : Nat × Nat × Dy) :
    Std.HashMap Nat Dy :=
  let m := addTo m e.1 (e.2.2 * u.getD e.2.1 0)
  if e.1 = e.2.1 then m else addTo m e.2.1 (e.2.2 * u.getD e.1 0)

/-- `K ũ`, exactly. -/
def kuMap (d : Bundle) : Std.HashMap Nat Dy := d.kEnt.foldl (addKu d.u) ∅

/-- `max(|loᵢ|, |hiᵢ|)²` for the residual interval `[fLoᵢ − (Kũ)ᵢ, fHiᵢ − (Kũ)ᵢ]`. -/
def resTerm (d : Bundle) (ku : Std.HashMap Nat Dy) (i : Nat) : Dy :=
  let k := ku.getD i 0
  let m := Dy.max (d.fLo.getD i 0 - k).abs (d.fHi.getD i 0 - k).abs
  m * m

/-- `ρ² = Σᵢ max(|loᵢ|, |hiᵢ|)²`. -/
def rho2 (d : Bundle) : Dy :=
  let ku := kuMap d
  ((List.range d.n).map (resTerm d ku)).foldr (· + ·) 0

/-- Shape checks (sizes, `K` indices in range, `fLo ≤ fHi`, `μ > 0`, `bound ≥ 0`). -/
def shapeOk (d : Bundle) : Bool :=
  d.fLo.size == d.n && d.fHi.size == d.n && d.u.size == d.n && d.perm.size == d.n &&
  d.lCols.size == d.n &&
  d.kEnt.all (fun e => decide (e.1 < d.n) && decide (e.2.1 < d.n)) &&
  (List.range d.n).all (fun i => Dy.le (d.fLo.getD i 0) (d.fHi.getD i 0)) &&
  d.mu.pos && d.bound.nonneg

/-- Gershgorin on the exact `R` for every row. -/
def gershgorinOk (d : Bundle) : Bool :=
  let P := prep d
  let g := gershSums d P
  (List.range d.n).all (rowOk d.mu P.E2 g)

/-- `ρ² ≤ (bound·μ)²`, i.e. `ρ/μ ≤ bound` without square roots. -/
def residualOk (d : Bundle) : Bool :=
  Dy.le (rho2 d) ((d.bound * d.mu) * (d.bound * d.mu))

/-- The verified checker. `Certify.Bundle.check_sound`: `check d = true` implies the
conclusion of `certified_error_bound_gram` for the matrices the data denotes. -/
def check (d : Bundle) : Bool :=
  shapeOk d && gershgorinOk d && residualOk d

end Certify.Bundle
