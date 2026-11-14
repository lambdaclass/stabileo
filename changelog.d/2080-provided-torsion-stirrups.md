### BREAKING (results)

#### Check torsion against every returned stirrup cage

- Check transverse torsion capacity and spacing for fixed or designed stirrups even when longitudinal torsion steel is not fixed. Insufficient cages fail verification (#2080).
- Restore flexural sizing depth alongside required-steel quantities and expose the checked bars' depth as `providedDepth`. Keep strength and ductility checks at the actual bars. The original INTI example passes at its unchanged tolerance.
