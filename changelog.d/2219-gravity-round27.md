### BREAKING (results)

#### Gravity generation refuses unsupported geometry and spans

- Block gravity generation for nonplanar shells, partial member shell coverage, ambiguous area-load slope eligibility and geometry outside the first-moment precision budget. Validate every generated distributed span against its actual member length and the native minimum. Regenerate floor and area loads and rerun dependent analyses and checks; unsupported models now receive an explicit refusal (#2219, #2254, #2255).
