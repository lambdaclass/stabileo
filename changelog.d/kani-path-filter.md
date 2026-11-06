### Performance
#### Kani runs on a pull request only when its inputs change (2026-11-06)

The Kani job took about 50 minutes on every pull request and merge-queue entry that touched any engine source. It now runs only when the change touches what the harnesses prove (the harnesses, the element, linear-algebra and type modules they call, the interval and sparse certificate arithmetic), the Cargo or Rust toolchain pins, the flake, the Kani scripts or the Verify workflow, and is skipped otherwise. When the changed files cannot be listed, it runs. Pushes to main and the nightly schedule always run it.
