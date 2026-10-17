/-
`lake exe certcheck <bundle.json>...` — re-check certificate bundles with exact arithmetic.
The verdicts are `Certify.Bundle.check` (linear static, sound by `Certify.Bundle.check_sound`),
`Certify.Plastic.check` (plastic collapse, `Certify.Plastic.check_sound`) and
`Certify.Combo.check` (load combinations, `Certify.Combo.check_sound_disp`,
`check_sound_quantities`). The bundle's provenance (input hash, engine, certificate kinds) is
printed; matching the hash against the input file is `scripts/check-bundles.sh`'s job.
Exit status: 0 if every bundle is accepted, 1 if any is rejected, 2 on a read/parse error
(including an unknown format).
-/
import Certify.BundleParse

open Certify.Bundle
open Lean (Json)

def dyToFloat (x : Dy) : Float := Float.scaleB (Float.ofInt x.m) x.e

def ratToFloat (x : Rat) : Float := Float.ofInt x.num / Float.ofNat x.den

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

/-- `x` with 12 significant digits (display only). -/
def sig12 (x : Float) : String := Id.run do
  if x == 0 then return "0"
  let k := (Float.log10 x.abs).floor
  let d := (x.abs / Float.pow 10 (k - 11)).round
  let digits := toString d.toUInt64
  let sign := if x < 0 then "-" else ""
  return s!"{sign}{digits.take 1}.{digits.drop 1}e{k.toInt64}"

def provenanceLine (p : Option Provenance) : String :=
  match p with
  | none => "  provenance: none (format without provenance)"
  | some p => s!"  provenance: input {p.inputKind} sha256={p.inputSha256}, engine {p.engineVersion} ({p.engineCommit}), kinds [{String.intercalate ", " p.kinds}]"

def verdict (path : String) (ok : Bool) (why : Unit → String) (info : String) : IO UInt32 := do
  if ok then
    IO.println s!"ACCEPT {path}: {info}"
    return 0
  else
    IO.println s!"REJECT {path}: {why ()}; {info}"
    return 1

def checkLinear (path : String) (j : Json) : IO UInt32 := do
  let d ← match parseLinear j with
    | .ok d => pure d
    | .error e => do IO.eprintln s!"{path}: parse error: {e}"; return 2
  let t1 ← IO.monoMsNow
  let ok ← IO.lazyPure fun _ => check d
  let t2 ← IO.monoMsNow
  let lnnz := d.lCols.foldl (fun acc c => acc + c.length) 0
  let info := s!"linear static, n = {d.n}, nnz(K) = {d.kEnt.length}, nnz(L) = {lnnz}, μ ≈ {sci (dyToFloat d.mu)}, bound ≈ {sci (dyToFloat d.bound)}, check {t2 - t1} ms"
  verdict path ok (fun _ =>
    if !shapeOk d then "shape (sizes, indices, fLo ≤ fHi, μ > 0, bound ≥ 0)"
    else if !gershgorinOk d then "Gershgorin test on R = K − L Lᵀ fails for some row (μ too large)"
    else "residual: ρ² > (bound·μ)² (bound too small or ũ wrong)") info

open Certify.Plastic in
def checkPlastic (path : String) (j : Json) : IO UInt32 := do
  let d ← match parsePlastic j with
    | .ok d => pure d
    | .error e => do IO.eprintln s!"{path}: parse error: {e}"; return 2
  let t1 ← IO.monoMsNow
  let ok ← IO.lazyPure fun _ => check d
  let t2 ← IO.monoMsNow
  let info := s!"plastic collapse, {d.rows.size} equilibrium rows, {d.members.size} yield members, {d.hinges.length} hinges, λ_c ∈ [{sig12 (ratToFloat d.lamLo)}, {sig12 (ratToFloat d.lamUp)}], check {t2 - t1} ms"
  verdict path ok (fun _ =>
    if !membersOk d then "yield data (n > 0, 0 < mpLo ≤ mpHi)"
    else if !staticOk d then "static certificate: equilibrium or yield test fails (λ_lo too large)"
    else "kinematic certificate: virtual-work identity, hinge data or Σ D ≤ λ_up W fails (λ_up too small)") info

open Certify.Combo in
def checkCombo (path : String) (j : Json) : IO UInt32 := do
  let d ← match parseCombo j with
    | .ok d => pure d
    | .error e => do IO.eprintln s!"{path}: parse error: {e}"; return 2
  let t1 ← IO.monoMsNow
  let ok ← IO.lazyPure fun _ => check d
  let t2 ← IO.monoMsNow
  let info := s!"load combinations, n = {d.base.n}, {d.cases.size} cases, {d.combos.size} combinations, {d.nq} end-force quantities, envelope bound ≈ {sci (dyToFloat d.envBound)}, check {t2 - t1} ms"
  verdict path ok (fun _ =>
    if !casesOk d then "a load case's linear-static certificate fails"
    else if !d.combos.all (comboOk d) then "a combination bound is below Σ|cᵢ|bᵢ + ‖Σcᵢũᵢ − ũ‖"
    else if !envelopeOk d then "envelope: a value is not the max |ũ_j[k]| or the bound is below a combination bound"
    else "an end-force combination or envelope bound does not follow from the case bounds") info

def checkFile (path : String) : IO UInt32 := do
  let s ← try IO.FS.readFile path catch e => do
    IO.eprintln s!"{path}: cannot read: {e}"; return 2
  let parsed : Except String (Json × String × Option Provenance) := do
    let j ← Json.parse s
    let fmt ← bundleFormat j
    return (j, fmt, ← parseProvenance j)
  let (j, fmt, prov) ← match parsed with
    | .ok r => pure r
    | .error e => do IO.eprintln s!"{path}: {e}"; return 2
  let status ←
    if fmt == plasticFormat then checkPlastic path j
    else if fmt == comboFormat then checkCombo path j
    else checkLinear path j
  if status != 2 then IO.println (provenanceLine prov)
  return status

def main (args : List String) : IO UInt32 := do
  if args.isEmpty then
    IO.eprintln "usage: certcheck <bundle.json>..."
    return 2
  let mut status : UInt32 := 0
  for a in args do
    status := max status (← checkFile a)
  return status
