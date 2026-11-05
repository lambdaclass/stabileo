### Fixed
#### Unknown addresses on stabileo.com answer 404 instead of the landing page (2026-10-31)

Any address that was not a page (`/en/research/nonexistent-paper/`) used to answer 200 with the
landing page and its canonical, so search engines saw a site-wide soft 404. Caddy now answers
those with a real 404 and a short, noindexed page in the address's language that links to the
home page, Research, Tools and the Blog. The application's addresses (`/app/…`, `/demo`), the
prerendered pages, the old unprefixed links (`/blog/<slug>`), assets and the slash redirects are
unchanged; `make test.infra.caddy` checks each of them.
