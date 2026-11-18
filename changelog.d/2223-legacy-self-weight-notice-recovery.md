### Fixed
#### Preserve legacy PRO self-weight notice features during recovery (2026-11-17)

Opening a PRO project without a stated self-weight rule now records its legacy self-weight applicability before the rule is migrated. Saving and reloading after an unavailable notice chunk preserves the pending notice and workspace snapshot. Session and autosave restoration assess the notice after restoring the saved mode and toggle. Explicit empty and active PRO rules retain their existing applicability; engine results are unchanged (#2223).
