### Fixed
#### A new project's tab is named in the reader's language, not `tabBar.newStructure` (2026-10-28)

The stores name the first project before the application registers its full dictionaries, so a
fresh Basic or PRO session showed the translation key `tabBar.newStructure` as the project's name in
its tab, in every language. The tab bar's entries now ship with the dictionary subset loaded first,
and the end-to-end check of raw keys reads the tab's name field (#719).
