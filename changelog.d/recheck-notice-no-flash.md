### Fixed
#### The re-check notice no longer flashes open and shut on opening an older project (2026-11-05)

Opening a project saved with an older results version, from a file, a tab, an autosave restore or
a link, showed the notice headed "Results have changed since this project was last solved" while
the list of changes was still loading. When none of the changes since concerned the model, it then
closed on its own before it could be read. Nothing was hidden: every notice that lists changes
still holds until it is acknowledged. Now nothing is shown for the first 800 ms of the check. If
the check takes longer, the notice opens saying the project is being checked, and it only says
results have changed once the changes that apply are on screen (#1418).
