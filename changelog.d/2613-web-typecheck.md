### Fixed
#### Web typechecking with large translation dictionaries

The web typecheck now checks the locale dictionaries in a separate TypeScript project and uses their generated declarations to check the app and tests. The gate also reports a compiler interruption or project-wide error even after an allowed diagnostic.
