### BREAKING (results)
#### Static seismic generation checks story geometry and loads supported rafters along their spans

Static seismic generation refuses brace and roof joints whose geometry does not establish a story. It accounts for coordinate rounding when identifying straight subdivisions and refuses when the available precision is insufficient. When an elevated inclined member has floor evidence at both ends, the generator applies inertia along its participating span. Regenerate affected static seismic cases before repeating analyses or design checks, and review base shear, story forces and member actions. See [the results change](../docs/results-changes/2026-11-seismic-story-resolution.md). (#2330, #2331, #2332, #2404)
