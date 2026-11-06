### Fixed

#### The landing shows every section without scrolling to it (2026-11-02)

Every section below the hero started transparent and was painted only once it scrolled into view,
so a reader, a crawler that renders the page, or a capture of it saw blank space under the hero.
The fade-in is gone: the sections are painted from the first frame, with or without JavaScript,
and the prerendered HTML no longer needs a scroll to carry them visible.
