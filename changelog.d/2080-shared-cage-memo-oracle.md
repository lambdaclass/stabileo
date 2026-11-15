### Fixed

#### Check shared-cage memo capacity at the provided bars' depth

- Correct the shared-cage memo test oracle to use `providedDepth`, derived independently from the section, cover, stirrups and selected bar diameter. The old oracle used the sizing depth after the round-15 depth split; the memo already reports the correct capacity of the provided cage. Engine results are unchanged (#2080).
