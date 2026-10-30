### Added
#### Every batch-two Tool is render-tested in all six languages (2026-10-30)

The continuous beam, portal, truss, influence-line and beam-frequency pages now have server-render
tests in English, Spanish, Portuguese, German, French and Turkish (#877): 30 cases check the
translated title, viewer container, input form, localized gallery link and absence of raw Tools
keys. This catches missing page content or translations before publication; it does not replace
browser interaction or numerical tests. Re-check these cases when changing a Tool's page or
locale. Calculator results are unchanged.
