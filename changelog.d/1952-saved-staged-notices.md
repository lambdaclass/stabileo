### Fixed

#### Recheck saved shell-only staged forces (#1952)

Extract staged path context from saved construction phases through the same
check as staged construction, so shell-only histories receive the existing
physical-stiffness and unavailable-force notices. Spring histories also receive
their correction notice; absent or empty phases do not match staged notices.
Correct all six time-history notice translations to state that `peakReactions`
is empty even for spring-only supports. Displacement histories and peaks remain
available. Engine results and shipped notice conditions are unchanged.
