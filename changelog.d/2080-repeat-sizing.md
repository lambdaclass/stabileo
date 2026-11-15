### Performance

#### Reuse identical concurrent flexural sizing

- Reuse byte-identical CIRSOC 201 flexural sizing queries across concurrent stations and members. The bounded engine-local cache preserves every checked demand and result, copies answer storage, and resets when the engine is registered again (#2080).
