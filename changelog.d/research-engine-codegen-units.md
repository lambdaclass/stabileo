### Changed
#### Research bundles build faster from scratch, with their checked outputs pinned bit for bit (2026-11-05)

The phase-field, spring-network and four-cable research bundles now compile the engine in parallel
pieces, and keep whole-program optimisation for the final bundle. A cold build of those bundles takes
about 20 to 30% less time, and each shipped bundle is 1.1 to 1.5% larger. Every value those bundles
return in their reference checks is bit-identical to before. CI now checks that bit for bit: it
hashes every value the phase-field, spring-network, four-cable and gridshell bundles return in their
reference checks and compares the hash with research/tools/wasm-output-hashes.json, so a later build
change that moves one of those results by one bit fails CI.
