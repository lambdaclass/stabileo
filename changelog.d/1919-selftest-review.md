### Fixed

#### Self-tests catch missing modal results and preserve nightly findings (#1919)

Require matching nonempty modal result and certificate mode lists, enforce strict relative certificate bounds, and verify the specific assertions reached by buckling, relative-bound, empty-field and absolute-frequency seeds. Reconcile nightly failure objects with failed analysis/invariant rows independently of diagnostic detail counts, and retain refusal-only comparisons in coverage records. Add failing reproducers and passing controls; production engine results and numerical baselines are unchanged.
