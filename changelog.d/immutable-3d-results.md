### Performance
#### Published 3D results are frozen, and the known-issue refusal check runs once per result (2026-11-07)

Every read of the 3D results, cases and combinations ran the known-issue refusal check over the
whole solve again, and the member verdicts read them once per member: about 550 ms per open of a
large 3D workspace. Published 3D results, cases, combinations and envelopes are now deep-frozen, so
editing one in place throws, and the check keeps its verdict per published result. A new result
is always a new object and is checked again. Nothing that was withheld is shown (#1686).
