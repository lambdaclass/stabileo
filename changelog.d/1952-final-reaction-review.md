### BREAKING (results)
#### Preserve settlement-only and fully restrained equilibrium states

Normalize P-Delta residuals by the effective prescribed-motion RHS, retain
constraint motion from settled masters, and recover valid fully restrained
stages without artificial support forces. Scope the reaction-change registry
to explicitly identified path results and verify final scaled member shears
and moments independently for distributed and point loads (#1952). See the
[results-change write-up](../docs/results-changes/2026-11-arc-length-reactions.md).
