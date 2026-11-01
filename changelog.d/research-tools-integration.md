### Performance
#### Research and Tools load only when opened (2026-10-29)

Research pages load through their own loader (#840); the integration wave (#857) keeps both
Research and Tools behind the public-page boundary. Adding an experiment no longer brings its
catalogue, calculator translations or analysis into the landing page or editor's initial load.
Route-size checks guard that boundary. Re-check direct links to experiments and calculators as
well as navigation from the galleries when adding a route.
