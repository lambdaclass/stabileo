# Review staged load regulations before applying mixed code changes

A staged seismic code followed by a concrete code selection could be marked applied without regenerating the loads. A single office template selecting both codes reproduced this on main. The transaction ran the design-only revision update, which preserves generated loads, combinations and analysis. The project could therefore describe a newer load code than its accepted analysis. Changing codes on a project reopened with a pending load role had the same effect.

Single-role and family selections now stage their bindings through one transaction. When any load role is pending, design selection keeps the full transaction pending. Successful application of a reviewed load plan advances the configuration revision and invalidates the affected analysis. A design-only change on its own still applies immediately.

If a saved load role is stamped as applied beyond the saved regulation configuration revision, review the load code and its settings, regenerate and verify the loads and combinations, and rerun analysis and design. A later valid change can erase that stamp discrepancy. Users of earlier versions who selected load and material codes together should also verify the generated actions.
