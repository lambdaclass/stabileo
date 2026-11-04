### Changed
#### CI retries an artifact download that GitHub's storage refuses with a 5xx (2026-11-03)

`gh run download` failing with HTTP 500, 502, 503 or 504 from GitHub's artifact storage (for
example "503 Egress is over the account limit") is now retried as an infrastructure failure
instead of failing the job. A 404 or any other error still fails at once.
