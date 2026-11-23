### Fixed

#### Bound slow E2E spec discovery

CI reads each shared TypeScript dependency once per discovery pass. Specs still inherit slow tags through transitive and cyclic imports.
