### Performance
#### Public pages prerender in parallel (2026-10-30)

The site build renders public routes through a pool of browser pages instead of one at a time
(#857). It defaults to at most six workers, bounded by the available CPUs; PRERENDER_CONCURRENCY
sets another positive count. Feeds and the sitemap retain their input order, and a render failure
names the route, stops assigning new work and closes the workers. This shortens the growing
multilingual site's build without changing its published content. Re-check generated pages,
feed order and the sitemap when changing the pool or route list.
