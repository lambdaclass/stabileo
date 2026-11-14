### Fixed
#### The seven-storey PRO example no longer has a balcony on the roof (2026-11-14)

The cantilevered balcony slabs repeated on every level, including the roof. The two roof panels, their surface loads and the three edge nodes are gone, and the nodes are renumbered so they stay contiguous (the rigid links and the floor diaphragm refer to node ids). The example now has 138 nodes and 75 shells.
