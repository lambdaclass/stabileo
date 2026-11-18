### Performance
#### Lay out a beam's slots against its joints once per row and cages (2026-11-17)

The design's joint threading check generated every legal layout of a beam's
row of slots for each candidate, though most candidates of a member share
their top row and meet the same column cages. The layouts are now kept per
exact row, section and keep-outs.
