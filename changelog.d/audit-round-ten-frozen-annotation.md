### Fixed

#### Keep the loaded arc frozen snapshot in its serialized shape

Remove audit-only defect metadata from the loaded arc snapshot so its exact comparison passes. Audit #1946 retains the known wrong main result #1949, affected reaction path and PR #1952 replacement note in its reports; the disclosure test checks that location. Engine results and frozen numerical values are unchanged.
