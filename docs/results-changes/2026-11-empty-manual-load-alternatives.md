# Preserve empty manual load alternatives

An empty manual load case can represent an intentional choice. With a plan-owned wind case and an empty manual No wind case, a `D + W` rule produces one combination with the wind load and another whose wind case has no load. The second combination is dead-only in its effects.

In the review branch, Preview showed only the loaded combination and Apply saved only that combination. Preview and Apply now retain the empty manual choice alongside the loaded case. Obsolete generated cases without surviving effects stay out of the generated combinations.

This corrects a regression in the unreleased review branch. Projects that applied Auto Loads using an affected build need to regenerate the combinations and rerun the analysis and envelopes.
