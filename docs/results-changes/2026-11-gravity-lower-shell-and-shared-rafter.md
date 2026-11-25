# Require explicit gravity ownership for lower shells and offset rafters

Panel gravity blocks when a horizontal shell and an overlapping beam bay are rigidly attached at matching plan stations and their vertical separation exceeds the deck tolerance within one storey's headroom. The planner applies the same check whether the shell is above or below the bay.

A rafter can share a shell node at one station and have a vertical rigid offset at another. When the member overlaps the shell in plan and existing coverage checks cannot establish ownership, panel gravity blocks before assigning a tributary width to the rafter.

Regenerate automatic panel gravity in affected models. When the planner blocks, correct the attachment geometry or assign the area load once by hand.
