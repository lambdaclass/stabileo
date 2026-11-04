### Changed
#### Pull requests build the Docker image from source only when its recipe changes (2026-11-04)

The Docker check built the whole image from source on every pull request: the backend, the engine
and research WASM, and the site. That took 18–27 min and was the PR's longest check. A pull request
now builds the image around its already-tested site. It builds from source only when the Dockerfile,
`.dockerignore`, or a toolchain or dependency pin the build reads changes. Pushes to main still
build both.
