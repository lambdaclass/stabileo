### Fixed
#### Harmonic superposition and Craig–Bampton reduction check their modes (2026-11-27)

Modal analysis refuses a set of modes whose mass Gram matrix is not the identity within a
derived bound, but harmonic analysis by modal superposition and Craig–Bampton reduction
called the eigensolver directly and used whatever it returned. Both now run the same check on
the modes they keep. A harmonic analysis whose modes fail it is solved directly instead of by
superposition, and a reduction whose interior modes fail it is refused. No model in the test
suite or in the nightly metamorphic harmonic run changes method or answer. The warning of
known issue #759 stays: response-spectrum analysis takes its modes as input and does not
verify them yet.
