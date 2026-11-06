### Added
#### Files saved by every release open, migrate and give the same results, and a newer file is refused by name (2026-11-03)

Every bundled example, saved and solved by v0.2.0, v0.3.0 and v0.4.0 with that release's own code,
is now opened, migrated and solved on every change, and its results must match what that release
showed unless the app's own re-check lists a registered result change that applies (#718, #770).
v0.3.0 and v0.4.0 files give exactly today's results. A project file saved by a newer Stabileo
used to be refused only as "invalid format", and a newer session file was not checked at all, so
its tabs opened anyway; both are now refused with a message saying a newer version saved them.
No calculation changes.
