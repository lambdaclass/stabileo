### Changed
#### The roadmap lists every open safety issue with its state, every workstream and every deferred follow-up (2026-11-03)

The product roadmap opens with the work order (wrong-result bugs, then other bugs, then features).
Each open safety issue has a row saying whether main can give the wrong result today, whether the
containment PR (#807) warns or refuses, and where its fix is. A table lists every pull request in
flight with its state and the decisions it waits on, and a new "Later: deferred follow-ups" section
lists what was decided for later. The CI table records the CI wave and wave A as landed. This
records plans, not fixes; no calculation or saved project changes.
