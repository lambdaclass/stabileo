### BREAKING (results)

#### Distinguish physical P-Delta failure from displaced-geometry moment imbalance

P-Delta retains correct small-displacement answers when only the moment balance
on displaced geometry fails, with an explicit limitation warning. A failed
physical residual withholds reaction, member, constraint and stress quantities
while preserving record identities. Time history returns an empty
`peakReactions` collection instead of its unavailable elastic-only estimate.
Recheck saved P-Delta and time-history forces; see the
[results-change write-up](../docs/results-changes/2026-11-pdelta-physical-containment.md)
(#1952).
