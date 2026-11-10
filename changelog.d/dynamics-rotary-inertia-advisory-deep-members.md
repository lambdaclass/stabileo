### BREAKING (results)
#### The rotary-inertia warning names only deep members, and the unconverged-increment warning is on nonlinear analyses only (2026-11-10)

`NL-DYNAMIC-GAPS` (#370) was on every material nonlinear analysis and every dynamic analysis of a model with a frame member. Its nonlinear half is now `NL-UNCONVERGED-INCREMENT`, on material nonlinear analyses only; `NL-DYNAMIC-GAPS` is on modal, spectral, time-history and harmonic analyses only when a frame member or curved beam has r/L > 0.045, where omitting rotary inertia raises its first bending frequency by more than 1 %, and it names those members. Diagnostic codes change; no number does. See [the results change](../docs/results-changes/2026-11-basic-advisories-and-plastic.md).
