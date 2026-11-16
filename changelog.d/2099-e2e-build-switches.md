### Fixed
#### Match E2E smoke coverage to the built public features (2026-11-15)

- Restore main's landing navigation expectations with switches off and test the switched navigation separately (#2099).
- Detect enabled features from the prebuilt E2E artifact using the same flag resolver as publication tests; skip unavailable game, Mohr, model-tool, account, revised tool UI and Hungarian pricing coverage with explicit reasons.
- Keep the default CI E2E build switches off and restore coverage of main's example pages and calculator UI alongside the enabled Tools redirects.
