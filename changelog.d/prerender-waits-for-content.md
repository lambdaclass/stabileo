### Fixed
#### The prerender waits for each page to render before capturing it (2026-11-04)

The prerender captured a page as soon as the network had been quiet for half a second. A page
whose code chunk is requested only after a long main-thread task looked quiet in between, so on a
loaded CI host it was captured before rendering and the build failed with "came back nearly
empty (14 chars)". Capture now also waits until the page holds the 500 characters the existing
check requires.
