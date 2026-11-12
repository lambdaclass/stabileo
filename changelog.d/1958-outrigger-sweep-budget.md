### Fixed

#### Keep the seeded slider sweep within each test's budget (2026-11-12)

Run the same 300 seeded slider samples per example in twelve tests of 25,
retaining every sample check and the strict overall refusal limit (#1958).
Skip exact identity rotations in the shared stability eigensolver to avoid
redundant matrix and eigenvector updates, without changing its convergence
criteria, iteration limit or numerical answers.
