### Fixed
#### Pull requests no longer flood the shared CI cache (2026-11-04)

Every pull request saved about 1,850 Nix store paths (2.9 GB) to the repository's 10 GB Actions
cache, so the cache stayed full and evicted, within an hour, the compiled research bundles and
toolchains that other runs reuse. Pull requests now skip that Nix cache. Their Nix setup was no
slower without it (6.4 min summed over the hosted jobs, against 8.6 min with it); main and the
merge queue keep writing it.
