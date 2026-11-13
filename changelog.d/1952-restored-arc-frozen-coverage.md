### Fixed

#### Restore corrected arc-length frozen coverage after the main merge (#1952)

Restore the two exact arch inputs and regenerate their frozen outputs with
recovered support reactions. Remove their named #1949 exclusions, retain the
remaining excluded case, and preserve the path-analysis feature for registry
coverage. Fix the applicability test's implicit callback type without changing
the typecheck baseline. Independent force and moment checks validate the live
reactions at the final load factor against the restored frozen outputs.
