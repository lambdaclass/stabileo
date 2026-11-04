### Changed
#### Pull requests reuse research WASM bundles that the merge queue and main built (2026-11-04)

Research WASM takes 28% of the self-hosted runners' time. Pull requests rebuilt every bundle,
because main's Actions caches had been evicted and a pull request can't read another pull
request's cache. Now the queue-only runners, which never take a pull request, keep each bundle they
build in a directory on the host, keyed like the Actions cache and checked against a SHA-256
manifest. A pull request whose research inputs match reuses that bundle. Only those runners can
write the directory, and merge-queue and main runs never read it.
