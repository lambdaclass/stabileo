### Fixed

#### Keep Web Unit workers responsive inside long hooks and tests

Yield between mesh solves and member checks, share the autodesign fixture solve, resume long design runs between members and settling checks, yield outside each rebar timing sample, split frame and floor preparation for the drawing tests, and reuse the slab reference readings for its indicator assertions. Clear completed analysis-validity results before yielding so deferred certification cannot overrun the existing teardown hook limit. Preserve every test, numerical assertion and timeout.
