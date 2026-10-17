/-
JSON reader for certificate bundles (formats `stabileo.linear-certificate.v1`/`v2`,
`stabileo.plastic-certificate.v1`, `stabileo.combination-certificate.v1`, documented in
CERTIFY.md, "Independent checking: certificate bundles").

This reader is trusted (it is not verified): it maps the JSON to `Bundle`, `PBundle` or
`CBundle` without any arithmetic: each number `[m, e]` becomes the dyadic `m · 2^e`, the
exact value of the f64 the engine wrote, and each rational `"n/d"` becomes `n / d`. The
soundness theorems are statements about the decoded data.
-/
import Lean.Data.Json
import Certify.BundleCheck
import Certify.PlasticCheck
import Certify.ComboCheck

namespace Certify.Bundle

open Lean (Json)

/-- `[m, e]` ↦ the dyadic `m · 2^e`. -/
def decodeDyadic (j : Json) : Except String Dy := do
  let a ← j.getArr?
  unless a.size == 2 do throw s!"expected [mantissa, exponent], got {j.compress}"
  return ⟨← a[0]!.getInt?, ← a[1]!.getInt?⟩

def getField (j : Json) (k : String) : Except String Json :=
  match j.getObjVal? k with
  | .ok v => .ok v
  | .error _ => .error s!"missing field \"{k}\""

def natArray (j : Json) (k : String) : Except String (Array Nat) := do
  (← (← getField j k).getArr?).mapM (·.getNat?)

def dyArray (j : Json) (k : String) : Except String (Array Dy) := do
  (← (← getField j k).getArr?).mapM decodeDyadic

/-- A CSC matrix `{colPtr, rowIdx, values}` with `n` columns, as columns of `(row, value)`. -/
def cscColumns (j : Json) (n : Nat) : Except String (Array (List (Nat × Dy))) := do
  let cp ← natArray j "colPtr"
  let ri ← natArray j "rowIdx"
  let vs ← dyArray j "values"
  unless cp.size == n + 1 do throw s!"colPtr has length {cp.size}, expected {n + 1}"
  unless ri.size == vs.size do throw "rowIdx and values differ in length"
  unless cp[0]! == 0 && cp[n]! == ri.size do throw "colPtr does not span rowIdx"
  let mut cols : Array (List (Nat × Dy)) := Array.mkEmpty n
  for c in [0:n] do
    let (s, t) := (cp[c]!, cp[c + 1]!)
    unless s ≤ t && t ≤ ri.size do throw s!"colPtr not monotone at column {c}"
    let mut col : List (Nat × Dy) := []
    for p in [s:t] do
      col := (ri[p]!, vs[p]!) :: col
    cols := cols.push col.reverse
  return cols

/-! ### Provenance -/

/-- What was solved and by which engine (bundles from `v2` / plastic / combination on). -/
structure Provenance where
  inputSha256 : String
  inputKind : String
  engineVersion : String
  engineCommit : String
  kinds : List String

def strField (j : Json) (k : String) : Except String String := do (← getField j k).getStr?

/-- The `provenance` object, if the bundle has one. -/
def parseProvenance (j : Json) : Except String (Option Provenance) := do
  match j.getObjVal? "provenance" with
  | .error _ => return none
  | .ok p =>
    return some {
      inputSha256 := ← strField p "inputSha256"
      inputKind := ← strField p "inputKind"
      engineVersion := ← strField p "engineVersion"
      engineCommit := ← strField p "engineCommit"
      kinds := (← (← getField p "kinds").getArr?).toList.filterMap fun k => k.getStr?.toOption
    }

/-! ### Linear-static bundles -/

def linearFormats : List String := ["stabileo.linear-certificate.v1", "stabileo.linear-certificate.v2"]
def plasticFormat : String := "stabileo.plastic-certificate.v1"
def comboFormat : String := "stabileo.combination-certificate.v1"
def knownFormats : List String := linearFormats ++ [plasticFormat, comboFormat]

/-- The shared linear part (`n`, `k`, `perm`, `l`, `mu`). -/
def linearCore (j : Json) : Except String Bundle := do
  let n ← (← getField j "n").getNat?
  let kCols ← cscColumns (← getField j "k") n
  let kEnt := (List.range n).flatMap fun c => (kCols[c]!).map fun (a, v) => (a, c, v)
  return {
    n
    kEnt
    fLo := #[]
    fHi := #[]
    u := #[]
    perm := ← natArray j "perm"
    lCols := ← cscColumns (← getField j "l") n
    mu := ← decodeDyadic (← getField j "mu")
    bound := 0
  }

def parseLinear (j : Json) : Except String Bundle := do
  let b ← linearCore j
  return { b with
    fLo := ← dyArray j "fLo"
    fHi := ← dyArray j "fHi"
    u := ← dyArray j "u"
    bound := ← decodeDyadic (← getField j "bound") }

/-- The format string of a bundle, with a clear error for unknown formats. -/
def bundleFormat (j : Json) : Except String String := do
  let fmt ← strField j "format"
  unless knownFormats.contains fmt do
    throw s!"unsupported bundle format \"{fmt}\" (this checker reads {String.intercalate ", " knownFormats}); update the checker or re-export the bundle"
  if fmt == "stabileo.linear-certificate.v2" && (j.getObjVal? "provenance").toOption.isNone then
    throw "format v2 requires a provenance object"
  return fmt

def parseBundle (s : String) : Except String Bundle := do
  let j ← Json.parse s
  let fmt ← bundleFormat j
  unless linearFormats.contains fmt do throw s!"not a linear-static bundle: {fmt}"
  parseLinear j

/-! ### Exact rationals -/

/-- `"n"` or `"n/d"` ↦ the rational `n / d`. -/
def decodeRat (j : Json) : Except String Rat := do
  let s ← j.getStr?
  match s.splitOn "/" with
  | [a] => match a.toInt? with
    | some v => return Rat.ofInt v
    | none => throw s!"bad rational {s}"
  | [a, b] => match a.toInt?, b.toNat? with
    | some v, some d => if d = 0 then throw s!"zero denominator in {s}" else return mkRat v d
    | _, _ => throw s!"bad rational {s}"
  | _ => throw s!"bad rational {s}"

def ratArray (j : Json) (k : String) : Except String (Array Rat) := do
  (← (← getField j k).getArr?).mapM decodeRat

def objArray (j : Json) (k : String) : Except String (Array Json) := do (← getField j k).getArr?

/-- `[[i, "q"], …]` -/
def decodeTerms (j : Json) : Except String (List (Nat × Rat)) := do
  (← j.getArr?).toList.mapM fun t => do
    let a ← t.getArr?
    unless a.size == 2 do throw s!"expected [index, rational], got {t.compress}"
    return (← a[0]!.getNat?, ← decodeRat a[1]!)

/-! ### Plastic-collapse bundles -/

open Certify.Plastic in
def decodeLin (j : Json) : Except String Lin := do
  return ⟨← decodeTerms (← getField j "terms"), ← decodeRat (← getField j "lam")⟩

open Certify.Plastic in
def decodeCubic (j : Json) : Except String Cubic := do
  let a ← j.getArr?
  unless a.size == 4 do throw "expected four coefficient functionals"
  return ⟨← decodeLin a[0]!, ← decodeLin a[1]!, ← decodeLin a[2]!, ← decodeLin a[3]!⟩

open Certify.Plastic in
def decodeMember (j : Json) : Except String Member := do
  let comps ← (← objArray j "comps").mapM fun c => do
    return (⟨← decodeRat (← getField c "n"), ← decodeRat (← getField c "mpLo"),
      ← decodeRat (← getField c "mpHi")⟩ : Comp)
  let pieces ← (← objArray j "pieces").mapM fun p => do
    return (⟨← decodeRat (← getField p "a"), ← decodeRat (← getField p "b"),
      ← (← objArray p "polys").mapM decodeCubic, (← ratArray p "cuts").toList⟩ : Piece)
  return ⟨comps, pieces⟩

open Certify.Plastic in
def parsePlastic (j : Json) : Except String PBundle := do
  let st ← getField j "static"
  let kin ← getField j "kinematic"
  let hinges ← (← objArray kin "hinges").mapM fun h => do
    return (⟨← (← getField h "member").getNat?, ← (← getField h "piece").getNat?,
      ← decodeRat (← getField h "t"), ← ratArray h "theta", ← decodeRat (← getField h "diss")⟩ : Hinge)
  return {
    nv := ← (← getField j "nv").getNat?
    rows := ← (← objArray j "rows").mapM fun r => do
      return (⟨← decodeTerms (← getField r "terms"), ← decodeRat (← getField r "p")⟩ : Row)
    members := ← (← objArray j "members").mapM decodeMember
    lamLo := ← decodeRat (← getField st "lambda")
    x := ← ratArray st "x"
    mult := ← ratArray kin "multipliers"
    hinges := hinges.toList
    lamUp := ← decodeRat (← getField kin "lambda")
  }

/-! ### Load-combination bundles -/

def dyMatrix (j : Json) (k : String) : Except String (Array (Array Dy)) := do
  (← (← getField j k).getArr?).mapM fun r => do (← r.getArr?).mapM decodeDyadic

open Certify.Combo in
def parseCombo (j : Json) : Except String CBundle := do
  let base ← linearCore j
  let cases ← (← objArray j "cases").mapM fun c => do
    return (⟨← dyArray c "fLo", ← dyArray c "fHi", ← dyArray c "u", ← decodeDyadic (← getField c "bound")⟩ : Case)
  let combos ← (← objArray j "combos").mapM fun c => do
    let factors ← (← objArray c "factors").toList.mapM fun f => do
      let a ← f.getArr?
      unless a.size == 2 do throw s!"expected [case, factor], got {f.compress}"
      return (← a[0]!.getNat?, ← decodeDyadic a[1]!)
    return (⟨factors, ← dyArray c "u", ← decodeDyadic (← getField c "bound")⟩ : Combo)
  let env ← getField j "envelope"
  let qn ← getField j "quantities"
  let envQ ← dyArray qn "envelopeBounds"
  return {
    base, cases, combos
    envMaxAbs := ← dyArray env "maxAbs"
    envBound := ← decodeDyadic (← getField env "bound")
    nq := envQ.size
    caseVals := ← dyMatrix qn "caseValues"
    caseBounds := ← dyMatrix qn "caseBounds"
    comboVals := ← dyMatrix qn "comboValues"
    comboBounds := ← dyMatrix qn "comboBounds"
    envQBounds := envQ
  }

end Certify.Bundle
