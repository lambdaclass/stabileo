### Performance
#### Published 3D results are frozen, and the known-issue refusal check runs once per result (2026-11-07)

Every read of the 3D results, cases and combinations ran the known-issue refusal check over the
whole solve again, and the member verdicts read them once per member: about 550 ms per open of a
large 3D workspace. Published 3D results, cases, combinations and envelopes are now frozen, so
editing one in place throws (typed arrays inside stay writable, and a Map or Set inside is locked
but can still be reached through `Map.prototype`). The check keeps its verdict only for a result
whose scanned part is frozen plain data; anything else is checked on every read, as before. A new
result is always a new object and is checked again. Nothing that was withheld is shown (#1686).
