### Changed
#### Normative design is optional in PRO and off by default; the design chain enters main (2026-10-26)

The design stages (#462–#475: concrete design, detailing, other materials and codes, documents,
the design workspace, polish and reliability on a real building) enter main in one merge with the
switch of #624, so no intermediate state was deployed. PRO starts without the Design stage;
modelling, buildings and levels, loads and combinations, the analysis and its results, the
calculation exports and IFC need none of it. Settings → PRO → «Turn on normative design (in
development)» adds it, with the module's open limitations listed there. A project that already
holds design (bars, detailing, decisions) opened with design off keeps all of it and offers to turn
design on; a link that names a place of design asks first and turns it on for that visit only.
With design off, nothing of design runs: no sizing, no code check, no verification on a re-run.
Concrete, other-material and footing verdicts that move with the chain are told to the projects
they concern (results version 4, `docs/results-changes/2026-10-design-chain.md`).
