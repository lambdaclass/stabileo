### Security
#### Update rustix to fix RUSTSEC-2026-0486 (2026-11-11)

Update the root lockfile from rustix 1.1.4 to 1.1.6, the first patched version for
unsound zero-length buffers in extended-attribute functions. This dependency is
pulled in through tempfile by the engine's proptest development dependency. No
other crate versions change, and no audit exceptions are added.
