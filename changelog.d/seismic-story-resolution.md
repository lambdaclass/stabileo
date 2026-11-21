### BREAKING (results)
#### Static seismic generation checks story geometry and loads supported rafters along their spans

Static seismic generation refuses brace and roof joints whose geometry does not establish a story. It accounts for coordinate rounding when identifying straight subdivisions and refuses when the available precision is insufficient. When an elevated inclined member has floor evidence at both ends, the generator applies inertia along its participating span. Review affected generated seismic cases before repeating analyses or design checks. (#2330, #2331, #2332)
