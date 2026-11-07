### Fixed
#### The 30 s workspace save no longer freezes a designed project after a few edits (2026-11-06)

Every 30 s the open tabs are saved to the browser for the next visit, without their undo history.
The save still copied that history before dropping it: on a designed and detailed building every
undo step holds the detailing, and after a handful of edits the copy took the page's main thread
for minutes until the tab ran out of memory. The history is now left out before anything is
copied. On the 7-storey example after 16 edits the save takes 0.34 s instead of 1.9 s in Node,
and in the browser it no longer freezes the page (#1618).
