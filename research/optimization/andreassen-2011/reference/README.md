# Authors' reference

Source: [DTU TopOpt](https://www.topopt.mek.dtu.dk/apps-and-software/efficient-topology-optimization-in-matlab), linked `top88.m` (November 2010 header). Inspected 2026-10-29 against the appendix of the authors' [uncorrected manuscript](https://www.topopt.mek.dtu.dk/-/media/subsites/topopt/apps/dokumenter-og-filer-til-apps/topopt88.pdf), pp. 14–15. The numerical statements agree.

The site and footer permit educational use; the footer reserves all rights. No explicit redistribution licence was found. We do not distribute top88.m. `source.sha256` pins the inspected bytes, downloaded at run time. Credit: Erik Andreassen, Anders Clausen, Mattias Schevenels, Boyan S. Lazarov and Ole Sigmund. This independent Rust implementation expresses the published mathematics; it does not incorporate a licensed third-party source file.

From repository root:

```
nix shell --inputs-from . nixpkgs#octave --command python3 research/optimization/andreassen-2011/reference/run_reference.py
```

The runner checks the downloaded SHA before executing in a disposable directory. It shadows plotting functions only: `imagesc` observes the caller's full-precision `loop`, `c`, `mean(xPhys(:))`, `change`, and physical densities. Other graphics operations are no-ops. The authors' function is byte-for-byte unmodified; no numerical operations, OC logic, output rounding, or convergence conditions are replaced. An observation occurs at each original plotting call. JSON records retain column-major element order. The manifest records Octave version, settings and file hashes.

Both calls are `top88(60,20,0.5,3,2.4,ft)`, ft=1 and ft=2: section 3.4, manuscript p. 6 and Fig. 3(a), p. 7. These are not section 3's radius-1.5 reproduction of the earlier 99-line example. E0=1, Emin=1e-9, nu=0.3 come from appendix lines 4–6. OC move=0.2, multiplier bracket [0,1e9], relative bracket tolerance 1e-3 and design-change termination <=0.01 come directly from the code.

Compliance is evaluated **before** the OC update, whereas volume, change and densities describe the **updated** design. The Rust output follows this same timing. The final reported compliance is consequently not a new equilibrium solve of the final stored density.

The accessible manuscript gives optimized images and timing tables, not final compliance values or convergence iteration counts for these cases. No digitized image agreement or published numerical compliance claim is made. Section 5, p. 9 delegates alternative boundary conditions to Sigmund (2001), without specifying a cantilever here, so this experiment keeps the MBB case only.

If a Nix-shell downloader cannot reach DTU, download the URL with the host's `curl` into a scratch directory, then pass `--source /absolute/scratch/top88.m` to the runner. This applies the identical pinned SHA check before execution; it does not permit a modified reference. This fallback was used for the stored run after the in-shell download timed out.
