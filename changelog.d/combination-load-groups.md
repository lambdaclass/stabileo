### BREAKING (results)

#### Respect load groups when generating combinations

Saved combination rules apply grouped factors only to cases with the matching load symbol and group. An unresolved group blocks generation and Apply. Each set of alternatives contributes one case, including sets shared across load symbols. Auto Loads retains the matching cases for both named groups and the remainder of their symbol. It preserves the group of a valid target selected by ID and creates an ordinary case when the proposed target is a composite. Rule-template import rejects malformed terms and preserves the flat-roof snow basis. See [the results change](../docs/results-changes/2026-11-combination-load-groups.md). (#2535)
