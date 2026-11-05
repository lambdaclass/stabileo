### Fixed
#### Research papers are published only in the languages they are written in, and every other-language URL redirects to the English page (2026-11-01)

Search engines saw research pages under six languages while the sitemap listed three, 51
mixed-language de/fr/tr copies, Spanish and Portuguese pages with English titles, no structured
data and a build-day lastmod everywhere. Each research page, /paper, post and standing page is now
built, listed and linked only in the languages it is written in; the sitemap and every page's
hreflang agree; titles name the original work; pages carry ScholarlyArticle and breadcrumb data
citing the paper's DOI; lastmod is the latest review. A URL in a language a page lacks answers 301
to its English page (Caddy). The build now fails when a non-English page repeats the English page's
text, title or description, or when the sitemap, hreflang and built files disagree; the Spanish and
Portuguese validation check names, catalogue summaries and gallery cards that were still English
are translated. After deploy: resubmit the sitemap in Search Console.
