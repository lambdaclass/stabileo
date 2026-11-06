### Fixed

#### The changelog's area filters count changes, as its total does (2026-11-02)

The changelog page said "98 changes" while its area filters added up to 56: each filter counted
the weekly entries that touched the area, not the changes in it. Every filter now shows the number
of changes in its area, the same number the total shows once that filter is on, so the filters add
up to the total. Every change already has an area, so no "Other" filter is needed.
