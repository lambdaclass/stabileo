### BREAKING (results)

#### Generated structures receive their missing stability restraints (2026-11-10)

Standalone planar trusses and beams now emit lateral panel restraints and fork bearings; lattice columns default to fixed bases; sheds default to wall, roof and vertical truss bracing. Lattice-girder, Howe-roof and sawtooth generators inherit the corresponding support repairs. Geometry, loads and existing sections are retained. Saved models require regeneration to obtain these changes. All 32 original web failures have explicit physical null modes and remain refusal controls; no stability or accuracy limit changes. The XZ arch fixture uses local My for the intended global-Y pins and checks force balance, with an Mz mechanism control. See `docs/results-changes/2026-11-generated-structure-stability.md` for the per-test proof and generator changes.
