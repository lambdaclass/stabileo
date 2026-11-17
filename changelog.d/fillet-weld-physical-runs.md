### BREAKING (results)
#### Fillet weld effective length follows the physical run (2026-11-16)

Fix #2243 and #2244: splitting a continuous end-loaded fillet no longer removes its effective-length reduction, and a short fillet uses a leg no larger than one quarter of its run length. Native and WASM weld-group checks normalize connected uniform fillets before calculating area, centroid, inertia and stress. Separate parallel or disconnected fillets remain separate; ambiguous branching runs are explicitly unevaluated. Previously passing weld groups can fail. Re-run saved weld-group checks. See [the results-change record](../docs/results-changes/2026-11-fillet-weld-physical-runs.md). Advisory numbers remain for the coordinator to assign.
