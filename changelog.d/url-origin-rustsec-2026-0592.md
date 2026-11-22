### Security
#### Update the AI backend's URL dependency to fix an origin stack overflow (2026-11-22)

Update the Rust `url` crate to 2.5.9, which fixes a process crash when computing the origin of nested `blob:` URLs. [RUSTSEC-2026-0592](https://rustsec.org/advisories/RUSTSEC-2026-0592)
