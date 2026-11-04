### Changed
#### The landing and the editor load the blog only when it is shown (2026-11-03)

The blog page and its posts load on demand: on a blog address, when the editor opens the blog,
and for the latest-post card at the foot of the landing. The landing entry is about 724 KB
smaller (uncompressed) and every `/app/*` mode about 215 KB smaller. The card appears once the
posts arrive, without moving the link to the index.
