### Fixed
#### Saved-project notice expectations follow the registry landing order (2026-11-10)

Keep the exact eight notices for the connector-only project in the shell-edit regression, ordered by their registry versions, dates and IDs. A main-first CI merge places the connector notice before the pending linear-stability notice; the branch history places them in the opposite order. Add a regression for the main-first order while retaining acknowledgement, save/reopen and stale-result assertions. This corrects test expectations after empty models were excluded from linear re-checks; application behavior and engine results are unchanged.
