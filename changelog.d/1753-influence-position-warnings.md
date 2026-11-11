### Fixed

#### Preserve influence position warnings through the shared solve entry point (#1753)

Route every JavaScript influence position through the ordinary solve entry point while reusing its prepared load session. Collect all position diagnostics, including distinct warnings from later positions, before displaying the line and its containment banner. Use an independent solve when the candidate model differs from the session model. Keep the existing containment tests, numerical results, tolerances and refusal cleanup unchanged.
