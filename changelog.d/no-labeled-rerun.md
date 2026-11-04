### Changed
#### Adding a label no longer restarts CI (2026-11-03)

Pull request CI ran again from scratch whenever any label was added. Now only opening, pushing and
reopening start a run. The `run-e2e` label is read when a run starts, so after adding it, push or
re-run CI to get the full pipeline.
