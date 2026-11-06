### Changed
#### Page size is watched weekly instead of gated per change (2026-11-04)

A pull request no longer fails because the landing or the app grew: CI reports each route's
growth against main on the PR. A weekly check measures main against the ceilings in
`web/scripts/route-size-ceilings.json` and opens or updates a `route-size` issue when a route is
over. Research isolation still blocks: a change to research code shipped to the browser may grow
a route by 128 bytes at most, and research modules in a product chunk always fail.
