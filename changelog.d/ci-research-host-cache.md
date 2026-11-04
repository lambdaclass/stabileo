### Changed
#### Pull requests reuse research WASM bundles built on the same host (2026-11-04)

Research WASM is 28% of the self-hosted runners' time. Pull requests rebuilt every bundle because
none of their Actions caches were readable across pull requests, and main's had been evicted.
Self-hosted runners now keep each built bundle in a directory shared by the host, keyed like the
Actions cache. A pull request reuses a bundle that the merge queue, main or another pull request
built from the same inputs. Merge-queue and main runs only write to it, so a pull request never
supplies what the queue tests or deploys.
