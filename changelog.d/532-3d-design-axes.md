### BREAKING (results)

#### Design checks read 3D forces about the section's own axes (2026-11-02)

- Fix #532 (SA-2026-029): the CIRSOC 201 column check took Mz as a column's moment and checked it
  over depth h, though Mz bends the section over its width b. It now takes the larger of My and Mz
  over its own depth, turns the section when Mz governs, reads slenderness end moments from that
  axis and checks the other shear too. Rectangular columns bent mainly about Mz may need more bars:
  re-run the design.
- Engine/WASM: 3D design demands go through one mapping (`AxisDemand`: strong axis My with Vz, weak
  axis Mz with Vy). `certify_steel_multi_case_3d` checked web shear with the lateral Vy (zero under
  gravity) and now uses Vz; weak-axis shear is checked against the new `awWeak` or left not
  evaluated. `extract_rc_demands_3d` used Mz as Mu; it now uses My and refuses members with
  weak-axis demand. The extraction functions take the peak shear, not the shear at the station of
  the largest moment. The single-plane certified converters return `Result` and refuse demands
  with a weak-axis component.
