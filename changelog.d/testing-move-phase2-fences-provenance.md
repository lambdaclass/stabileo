### Fixed
#### Reject links satisfied only inside indented fences and retain historical provenance (2026-11-15)

Follow CommonMark fence indentation, matching marker lengths, closing whitespace and end-of-file rules when checking documentation links and anchors. Restore the original read-only source archive paths in staged-rotation replay provenance, add a separate link to the current audit record, and align remaining verification link labels with their testing destinations. Pinned historical audit commands remain unchanged.
