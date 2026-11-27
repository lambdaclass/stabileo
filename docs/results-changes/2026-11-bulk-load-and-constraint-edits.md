# Loads and constraints after a batched model edit

## Review loads and constraints after batched edits

Removing a load, deleting its case, or clearing or remapping a constraint within a batched edit could appear to succeed. The batch then restored an older list. A saved file or subsequent analysis could still contain the deleted assignment. Updating a load just added in the same edit could also leave the original value.

For projects edited with a batched command, compare the saved loads, their case and target, and the constraint endpoints with the intended model. Correct any stale entries and rerun the affected analyses. A saved file cannot distinguish a reinstated load from one deliberately kept.

Every editor and solver input now reads the same working list. Saving or undoing a completed edit preserves that list. Multiple imported loads now receive the same planar force and moment checks as an individual load. Conflicting entries refuse the entire insertion before accepting any load or assigning an ID.
