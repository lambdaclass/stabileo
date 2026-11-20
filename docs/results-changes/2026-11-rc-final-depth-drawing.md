# Final-depth verification of replacement beam drawings

A final-depth check now uses the replacement drawing's reinforcement evidence when supplied. A replacement that specifies only regional reinforcement inherits the saved drawing. Both paths use the existing checks at the adjusted layer depths.

In the reported case, a saved top bar ran the full beam length and the replacement top bar ended before an active torsion cut. The recheck returned a pass using the saved extent. With the replacement extent it returns the existing blocking torsion cutoff diagnostic. In a flexural witness the recheck likewise refuses credit beyond the shortened drawing and passes when the replacement restores the full extent.
