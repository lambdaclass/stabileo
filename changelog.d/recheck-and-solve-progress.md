### Changed
#### The re-check notice is read once per browser, its re-run is no longer superseded, and a solve shows its progress (2026-11-14)

Available when the unified PRO plates build switch is enabled. The production build keeps it off.

The notice about results computed with an older version came back at every reload, could not be closed without ticking a box, and its "Re-run" stayed disabled until then. It is now remembered per project solve in the browser, so a reload or a restart does not ask again for what was read; both buttons work at once and either one counts as read. The re-run meshed the plates before solving, and the edits that made started a live calc that superseded it, so it reported that "the model changed while it was being solved" and the live calc finished on its own seconds later; a live calc now waits for a manual solve and runs after it only if the model changed meanwhile. Pressing Solve now opens a card at the foot of the viewer that follows the solve step by step (preparing, meshing the plates, the load cases one by one with the time left, combinations and envelope), and once it ends says how it went, how many notices it left with a link to the diagnostics, and closes with Done; a clean solve closes it by itself after a few seconds.

With unified plates disabled, the viewport keeps model refusals visible until the model changes. Standalone results retain their reported warnings, and a notice preference saved in the enabled editor cannot hide them.

The published PRO gallery opens its existing models directly. Generated building examples, their progress messages and their plate counts are available with unified plates enabled.

The published results table shows the full known-issue warning above the numeric tabs in both planar and spatial models. The original diagnostic identifiers remain visible to readers of the published table and PRO diagnostics.
