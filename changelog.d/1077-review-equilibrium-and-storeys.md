### Fixed

#### Equilibrium is never reported as verified over loads the check left out; similar storeys respect member types (2026-11-03)

- SA-2026-034: a case whose statics check could not add up every load (a surface load it cannot
  spread to nodes, a load type it does not read) was reported as "loads and reactions agree" in
  the report after the analysis, "balances" in the statics panel and with a tick in the project
  report when the residual over the rest was small. Such a case is now "not fully checked", with
  the loads left out named, and the cases that balance are listed even when another does not.
- The similar-storey scope no longer takes a truss for a frame member at the same place or the
  reverse; a member drawn on one storey is copied to the others with its releases, joints,
  offsets, local axes and the rest of its properties, and the storeys it could not reach are
  named. Narrowing the scope back to one storey returns to the selection made there.
