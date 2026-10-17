/-
JSON reader for certificate bundles (format `stabileo.linear-certificate.v1`, documented in
CERTIFY.md, "Independent checking: certificate bundles").

This reader is trusted (it is not verified): it maps the JSON to `Bundle` without any
arithmetic: each number `[m, e]` becomes the dyadic `m · 2^e`, the exact value of the f64
the engine wrote. `check_sound` is a statement about the decoded
`Bundle`.
-/
import Lean.Data.Json
import Certify.BundleCheck

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

def parseBundle (s : String) : Except String Bundle := do
  let j ← Json.parse s
  let fmt ← (← getField j "format").getStr?
  unless fmt == "stabileo.linear-certificate.v1" do throw s!"unsupported format {fmt}"
  let n ← (← getField j "n").getNat?
  let kCols ← cscColumns (← getField j "k") n
  let kEnt := (List.range n).flatMap fun c => (kCols[c]!).map fun (a, v) => (a, c, v)
  return {
    n
    kEnt
    fLo := ← dyArray j "fLo"
    fHi := ← dyArray j "fHi"
    u := ← dyArray j "u"
    perm := ← natArray j "perm"
    lCols := ← cscColumns (← getField j "l") n
    mu := ← decodeDyadic (← getField j "mu")
    bound := ← decodeDyadic (← getField j "bound")
  }

end Certify.Bundle
