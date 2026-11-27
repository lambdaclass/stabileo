# Keep automatic gravity on separate decks joined by ties

Panel-mode automatic gravity checks separation across the overlap before sharing a load carrier. Two tied stations establish an attachment candidate. Shells on a beam bay's plane and compatible eccentric attachments can still share one load. Pitched roofs can still carry the load over their verified eave ring. A shell that is shadowed can relinquish its load only to final owners within the existing attached-deck separation bound.

In the review model, a 60 m² shell at 6 m and a 60 m² beam bay at 3 m have two aligned vertical ties. With 1 kN/m² of superimposed dead pressure, the shell and the bay now each receive 60 kN. Branch revision `38c8ecc37b` returned 60 kN in total, all on the shell. A separate rafter connected to a roof shell through a storey-height rigid offset also retains its tributary-width gravity. The earlier 2.8 m shell beneath the 3 m framing is a separate deck under the same check. Its bay draws its own gravity, and the higher framing can now cover the shell for roof live load.

Nearly level one-way beam bays now convert projected stations and line intensities to member metres before the area check. This preserves the projected resultant on inclined receiving members, including loads over a complete span.

Regenerate panel gravity loads in affected projects before relying on their analysis results.
