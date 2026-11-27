### Fixed

#### Require fresh measurements for research validation (2026-11-27)

Research CI now detects missing CQC, Newmark and Koiter exports. Its evidence comparison checks declared references and tolerances exactly and rejects nonfinite measurements.

Paper comparisons now require complete scalar or curve evidence. The cut-strip study withholds unsupported zero-load measurements and snap loads. Plate and shell checks cover the signed response and full mesh. Arch results distinguish a confirmed inversion from a failed solve. Interrupted browser experiments keep their results paired with the inputs that produced them, and a failed solver download can be retried.
