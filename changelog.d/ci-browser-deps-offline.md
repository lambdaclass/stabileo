### Fixed

#### Install browser system dependencies from cached packages before contacting apt mirrors

Key the existing browser .deb cache on Playwright's actual package list and the runner image and architecture. Try installation with cached .debs and downloads disabled before updating apt. If Azure's Ubuntu mirror cannot resolve, use temporary apt sources pointing to archive.ubuntu.com and security.ubuntu.com for this dependency step. Retry apt DNS and fetch failures as infrastructure failures. Preserve the tested browsers, test assertions and timeout budgets.
