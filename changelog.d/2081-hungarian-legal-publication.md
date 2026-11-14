### Fixed

#### Publish the existing Hungarian legal pages (#2081)

Move the existing Hungarian terms, privacy and usage-data text unchanged into translation files so prerendering, language links and the publication manifest recognize them. Reject non-base blog translations without a matching file through the shared loader to prevent content and publication languages from diverging. Pages without a translation retain their English fallback. Engine results are unchanged.
