### Performance

#### Reuse identical concurrent flexural sizing

- Reuse byte-identical CIRSOC 201 flexural sizing queries across concurrent stations and members. The bounded engine-local cache preserves every checked demand and result, copies answer storage, and resets when the engine is registered again (#2080).

- Verify certified shared beam-span demands once per run when all verification parameters match, while preserving each mesh piece's independent results and diagnostic IDs (#2080).
