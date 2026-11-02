### Fixed

#### /research, /tools and /changelog without a language answer with a redirect (2026-11-02)

An address without a language prefix (`/research`, `/tools`, `/changelog`, an old `/blog/<post>`
link) used to be answered with the landing's HTML, an English landing canonical and no content,
and was drawn only once the application had loaded. The server now answers it with a 302 to the
same page in the reader's language (the first of the browser's languages the page is published
in, English otherwise, `Vary: Accept-Language`), keeping the query string. Search engines, which
send no language, land on the English page.
