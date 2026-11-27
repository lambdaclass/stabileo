### Fixed
#### Plate edits preserve attached point masses and authored geometry

Clearing a plate mesh or deleting a plate preserves nodes used by the model’s mass source. Changing a plate side or closing a hole also keeps geometry nodes supplied by the user. The shape editor removes a detached construction point only when it created the point and the model no longer uses it.
