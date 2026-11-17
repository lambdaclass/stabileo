### BREAKING (results)

- Panel-mode gravity subtracts shell footprints before assigning member loads. Supported uncovered strips apply line reactions at their physical stations. Unsupported partial coverage and nonplanar shell geometry block the plan. (#2199, #2200)
- Width-mode level area and seismic mass use the tributary areas of loaded carriers. Regenerate width-based plans and seismic actions. (#2210, #2269)
- Floor-load zones that require eccentric member loading are refused. Centred zones that admit an exact line load remain supported. (#2201)
- ABS and SRSS 3D member diagrams include piecewise extrema and both sides of jumps. (#2273)
