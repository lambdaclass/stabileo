### Fixed
#### Preserve audit evidence and release snapshots after the testing documentation move (2026-11-15)

Recognize moved Markdown and JSON documents in the results snapshot build classifier. Preserve release snapshots from pending dashboard branches that still use the old directory. Restore recorded audit bytes changed by the move, check their integrity, and reject documentation links whose anchors appear only in code blocks. Align documentation index labels with their new destinations.
