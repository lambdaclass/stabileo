### Performance
#### The 3-D reinforcement view opens without the second-long stalls (2026-11-07)

Opening the 3-D reinforcement view on the 7-storey example spent most of its time on work that
did not need to happen (#1667). Every read of the per-case and per-combination results searched
the whole solve again for refused results, and the member verdicts read them once per member, so
one open repeated that search thousands of times. The issued document was wrapped in a reactive
proxy, so building the 3-D scene from it created a tracked value for every field it read. The tube
geometry was built through growing JavaScript arrays and half a million temporary vectors. The
garbage collector then caused stalls of about a second, landing in a different place on each run.
Results are now checked for refusals once each, the document is stored as built, and the tubes are
written into buffers sized up front. The geometry is bit-identical to before, and a refused result
is still withheld. On CI, reopening went from 2.2–3.2 s to about 1.2–1.6 s, and the
global-design-only open went from 1.4–2.8 s to about 1 s.
