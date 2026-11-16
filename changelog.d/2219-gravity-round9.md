### Changed
#### Track deferred complete-fixture gravity failures (#2219)

Retain the six force-invariance witnesses as known wrong results for #2254 and the suspension-bridge first-moment witness for #2255. They remain runnable with `RUN_KNOWN_WRONG=2254` or `RUN_KNOWN_WRONG=2255`; their assertions and tolerances are unchanged. This changes test selection only; generated loads and engine results are unchanged.
