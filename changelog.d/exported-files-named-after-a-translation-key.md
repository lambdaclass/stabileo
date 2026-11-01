### Fixed
#### A project saved under the name `tabBar.newStructure` takes its language's name (2026-10-28)

Projects saved while a new project was named with the raw key (see the tab-name fix) kept that
name, and their exports came out as `tabBarnewStructure.xlsx` and the like. The raw key is now
recognised as the default name, so it gives way to «Nueva estructura» / «New structure» when the
language is changed, as the default name of any language does.
