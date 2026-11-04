### Fixed

#### Two prerenders of the same build are byte-identical (2026-11-04)

Research charts took a random clip-path id on every render, every prerendered page asked GitHub
for the star count (in parallel some were rate-limited and printed "GitHub" instead), and animated
research pages were captured mid-animation. Chart ids now come from the component, the prerender
fetches the star count once per build and hands it to every page (`PRERENDER_GITHUB_STARS` pins
it), and pages are captured under reduced motion, which shows each animation's final frame. A build
test prerenders twice and compares every file (#875).
