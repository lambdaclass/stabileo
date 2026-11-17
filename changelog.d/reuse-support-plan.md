### Performance
#### Reuse support anchorage plans within candidate verification (2026-11-16)

Concrete candidate verification computes its support plan once and shares it
with bottom-bar reach, anchorage checks, and joint-threading checks. Each new
candidate still gets a fresh plan; verification rules and verdicts are unchanged.
