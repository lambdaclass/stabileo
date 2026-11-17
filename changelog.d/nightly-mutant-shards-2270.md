### Fixed
#### Finish nightly mutation shards within their existing time budget

- Split the full mutation set into 2560 shards and run 160 per night, targeting about 60 minutes on slow runners while preserving the 16-night rotation and the existing 120-minute budget (#2270).
