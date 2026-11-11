### Fixed

#### Accept store snapshots as applicability inputs (2026-11-10)

Align feature snapshot types with the store snapshot: releases are objects whose
values are inspected, supports declare the spring and settlement fields that
feature detection reads, and shell entries can carry their stored identifiers.
Remove an unused registry type import and add a compile-time compatibility
regression check. This fixes Web Typecheck without casts or baseline changes.
Engine results and snapshot gate registration requirements are unchanged.
