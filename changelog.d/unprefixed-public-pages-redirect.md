### Fixed

#### /research, /tools and /changelog without a language answer with a redirect (2026-11-02)

An address without a language prefix (`/research`, `/tools`, `/changelog`, an old `/blog/<post>`
link) used to be answered with the landing's HTML, an English landing canonical and no content,
and was drawn only once the application had loaded. When the page has an English version the
server now answers 301 to it, keeping the query string, as it already does for a page missing in
one language. The page's language switcher leads to the other languages.
