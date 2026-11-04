### Fixed
#### A page served by the fallback no longer states the landing's structured data (2026-11-04)

A blog post, standing page, tool or research page reached through the fallback page used to keep
the landing's Schema.org data (an application at the English home page) until its own code had
loaded, and for good if that code failed to load. It now drops data written for another address
on arrival, so the page states only its own. Prerendered pages keep theirs.
