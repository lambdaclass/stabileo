### Changed
#### The nightly verification runs at night (2026-11-04)

The nightly verification run takes about seven hours on the self-hosted runners. It started at
05:00 UTC, so it competed with pull requests and the merge queue until about noon. A dispatch at 14:01
held the nightly pool all afternoon: dispatched nightly runs took 23% of all self-hosted runner time
between 06:00 and 18:15. The scheduled run now starts at 00:00 UTC. A dispatch takes the nightly
pool only between 00:00 and 07:00 UTC; the rest of the day it runs on GitHub-hosted runners and
says so in a notice.
