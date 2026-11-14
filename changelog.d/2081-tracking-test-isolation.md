### Fixed

#### Keep registration tracking tests isolated (#2081)

Wait for registration hashing before a tracking test replaces its browser globals, preventing an earlier conversion from appearing in the next test’s event queue.
