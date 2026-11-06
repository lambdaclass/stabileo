### Fixed
#### A public page opens at its top (2026-11-05)

- Opening a paper from the Research gallery, or going back to the gallery, kept the scroll position
  of the page before it: the gallery and every paper share one scrolling container, so the paper
  opened scrolled down, by as much as the gallery had been. Every navigation between public pages
  now starts at the top (or at the section its link names), in the browser's back and forward too.
