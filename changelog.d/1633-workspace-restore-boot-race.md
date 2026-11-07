### Fixed
#### Work started while the saved workspace loads is kept (2026-11-07)

At start-up the saved workspace's bars are read from the browser's database, which can take a
moment on a detailed building. Anything started in that moment, such as a node drawn or an example
opened from a link, used to be replaced by the saved tabs when the read finished. The saved tabs
now open beside it, with a notice. Bars that could not be read keep their place in the workspace
across tab switches until the detailing changes, and restored bars are checked field by field, so
a damaged record is reported as lost bars instead of loaded (#1633).
