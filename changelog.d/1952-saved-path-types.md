### Fixed

#### Build complete design data in saved staged notice tests (#1952)

Use the project design defaults when constructing saved staged snapshots and
empty-phase controls, so the fixtures satisfy `ProjectDesignData` and the web
typecheck passes without a baseline change. Engine results and notice conditions
are unchanged.
