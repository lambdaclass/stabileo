### Fixed

#### Restore staged diagnostic lint and WASM history checks

Assert on the structured diagnostic code, severity, phase and member identity for uncertified staged removal, and run the shared history-containment assertions from both staged WASM CI consumers (#1952). Solver results are unchanged.
