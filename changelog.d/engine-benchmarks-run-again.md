### Fixed
#### Engine benchmarks run to the end again (2026-11-19)

Nine benchmark groups in four of the five engine bench files stopped at a
model the engine now refuses, and took the rest of their file with them. The
benchmark plates were pinned at one corner only and so free to turn in their
plane; the cable model was a chain of links with nothing to hold its shape; the
2,000-element beam is past the conditioning limit; the staged model added a
support in its second stage; and every 2D plastic result is withheld while
known issue #758 is open. The models are now ones the engine solves, the
plastic benchmark is skipped with a message until the issue is closed, and
`make test.engine.benches` runs every benchmark once each night.
