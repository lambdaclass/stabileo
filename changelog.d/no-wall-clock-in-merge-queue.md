### Fixed
#### Wall-clock budgets no longer fail the merge queue on loaded runners (2026-11-02)

In the merge queue, where the runners are shared and the host was at a load of 90 to 110 on 30
CPUs, the wall-clock assertions of the slow E2E suite (the 3-D rebar workspace opening and the
model fluidity edit) and of the scale-budget unit test are skipped; every functional assertion
of those tests still runs there. Pull requests run every budget unchanged.
