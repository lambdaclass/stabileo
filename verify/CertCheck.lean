/-
`lake exe certcheck <bundle.json>...` — re-check linear-static certificate bundles with
exact rational arithmetic. The verdict is `Certify.Bundle.check`, proved sound in
`Certify.BundleSound` (`check_sound`). Exit status: 0 if every bundle is accepted, 1 if
any is rejected, 2 on a read/parse error.
-/
import Certify.BundleParse

open Certify.Bundle

def dyToFloat (x : Dy) : Float := Float.scaleB (Float.ofInt x.m) x.e

/-- `x` as `d.ddde±k` (display only). -/
def sci (x : Float) : String := Id.run do
  if x == 0 then return "0"
  if x.isNaN || x.isInf then return toString x
  let mut k := (Float.log10 x.abs).floor
  let mut d := (x.abs / Float.pow 10 k * 1000).round
  if d ≥ 10000 then
    k := k + 1
    d := (x.abs / Float.pow 10 k * 1000).round
  let digits := toString d.toUInt64
  let sign := if x < 0 then "-" else ""
  return s!"{sign}{digits.take 1}.{digits.drop 1}e{k.toInt64}"

def checkFile (path : String) : IO UInt32 := do
  let t0 ← IO.monoMsNow
  let s ← try IO.FS.readFile path catch e => do
    IO.eprintln s!"{path}: cannot read: {e}"; return 2
  let d ← match parseBundle s with
    | .ok d => pure d
    | .error e => do IO.eprintln s!"{path}: parse error: {e}"; return 2
  let t1 ← IO.monoMsNow
  let ok ← IO.lazyPure fun _ => check d
  let t2 ← IO.monoMsNow
  let lnnz := d.lCols.foldl (fun acc c => acc + c.length) 0
  let info := s!"n = {d.n}, nnz(K) = {d.kEnt.length}, nnz(L) = {lnnz}, μ ≈ {sci (dyToFloat d.mu)}, bound ≈ {sci (dyToFloat d.bound)}, parse {t1 - t0} ms, check {t2 - t1} ms"
  if ok then
    IO.println s!"ACCEPT {path}: {info}"
    return 0
  else
    let why := if !shapeOk d then "shape (sizes, indices, fLo ≤ fHi, μ > 0, bound ≥ 0)"
      else if !gershgorinOk d then "Gershgorin test on R = K − L Lᵀ fails for some row (μ too large)"
      else "residual: ρ² > (bound·μ)² (bound too small or ũ wrong)"
    IO.println s!"REJECT {path}: {why}; {info}"
    return 1

def main (args : List String) : IO UInt32 := do
  if args.isEmpty then
    IO.eprintln "usage: certcheck <bundle.json>..."
    return 2
  let mut status : UInt32 := 0
  for a in args do
    status := max status (← checkFile a)
  return status
