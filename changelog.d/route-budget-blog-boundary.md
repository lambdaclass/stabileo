### Changed
#### The app route budget treats the blog page as its own route (2026-11-03)

"Landing and app route byte budgets" leaves the lazily loaded blog page out of `/app/*`, as it
already does for research and tools, so loading the blog on demand is not counted as app
growth. Modules the blog shares with the app still count. The budgets are unchanged.
