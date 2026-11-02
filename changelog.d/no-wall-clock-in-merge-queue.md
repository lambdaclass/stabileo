### Fixed
#### Wall-clock budgets no longer fail the merge queue on loaded runners (2026-11-02)

In the merge queue, where the runners are shared and the host was at a load of 90 to 110 on 30
CPUs, the slow E2E suite now leaves out its three wall-clock specs (the 3-D rebar workspace
opening, model fluidity and the tab-return latency), and the scale-budget unit test keeps its
functional checks but skips its time budgets. Pull requests and labelled runs still enforce
every budget unchanged.
