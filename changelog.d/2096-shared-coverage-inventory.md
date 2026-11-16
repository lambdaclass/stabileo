### Fixed
#### Keep the complete coverage inventory with every demand (2026-11-16)

Member demands now share a frozen inventory of members, combinations and their individual station grids. Removing tuples, stations, combinations or members cannot redefine completeness, including through cached verification. Raw tuple APIs require declared coverage. Explicit member views and validated beam-span coordinate transformations retain complete-input verdicts and shared demand reuse. No numerical rule or tolerance changes (PR #2173, #2096).
