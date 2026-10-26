### BREAKING (results)
#### The solve path: one manual solve, design never on the unfactored loads, a re-check that says what it left out (2026-10-22)

- **Footings and joints no longer design over the unfactored solve** (W2-01, SA-2026-024).
  Live calc re-solves only "All loads" while the single view is on screen (deliberately, for a
  large model's sake), so after one edit the combinations were gone and a footing was designed
  for D + W at factor 1 where 1.2D + 1.6W acts. With combinations defined and none solved,
  `activeResultSet3D` is now null and the floor and connection panels say why
  (`combinationsUnsolved`). Re-check entry `design-on-unfactored-results`, results version 3.
- **Enter, the ribbon, ToolbarResults, the exports and the steel optimiser's re-verify solve
  through `runGlobalSolve`** (W5-01), Calcular's solve, and take its guard: an older Enter solve
  landed after a newer one was published. `runSolve3D` is gone; the base is still solved directly
  from these entry points. A view export right after PRO's solve failed no longer solves again
  (one solve, one error toast). The manual 3D solve now checks for NaN displacements and names the
  mechanism in PRO, as Enter did; Basic with load cases off solves no combination from any of
  them, as Enter already did.
- **The solve guard reads the solve settings, not only the model** (W5-03): a solve in flight
  when self-weight (or its case, the axis convention, the mode) changed published its answer
  under the new setting.
- **"Re-run analysis and design" fails when the combinations were refused or failed** (W5-02),
  and the project stays stale; it reported success over the single solve that stood in. A P-Δ
  run with no second-order equilibrium no longer stamps the project as solved, and a modal run
  alone no longer ends the stale state (and with it the "current" in an export's provenance).
  (#588)
