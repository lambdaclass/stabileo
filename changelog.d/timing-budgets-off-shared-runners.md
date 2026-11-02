### Fixed
#### Wall-clock budget tests no longer fail the merge queue under runner load (2026-11-02)

The project-scale budgets (`scale-budget.test.ts`) ran inside Web Build on the shared runners,
where a host saturated by concurrent browser tests pushed a 105 ms report past its 2,000 ms
budget and knocked merge-queue batches out. They now run in their own serial Vitest pass
(`make test.web.timing`) and their own CI job, Web Timing Budgets, on the timing runners for
main and on hosted runners for pull requests, and not in the merge queue. The fixture and
the budgets are unchanged.
