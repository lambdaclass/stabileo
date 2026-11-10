# Offshore riser on the seabed (Gay Neto, Martins & Pimenta 2014)

A. Gay Neto, C. A. Martins, P. M. Pimenta, "Static analysis of offshore risers with a
geometrically-exact 3D beam model subjected to unilateral contact", Computational Mechanics 53
(2014) 125–145. DOI: https://doi.org/10.1007/s00466-013-0897-9.

Reference code: [GIRAFFE](https://github.com/alfredogneto/GIRAFFE) at commit
`1b8241ed337e79d29e0b65262a4ec340e2f1f443`, BSD-3-Clause (`inputs/LICENSE-GIRAFFE`). The two input
files in `inputs/` are copied unchanged from its `inputs/` folder. No GIRAFFE source code is copied;
its sources were read to match the shear stiffness, the submerged weight, the friction update and
which point the element results come from.

## What is reproduced

- **Tutorial 1**: a 1 m cantilever (5 elements) with a dead 1000 N tip force across it, in ten
  increments. The tip ends at X = 0.8414 m, Z = 0.4056 m.
- **Tutorial 16, steps 1 to 3**: an 835.35 m line (134 elements) lying on a flat seabed under its
  submerged weight; a 1 MN horizontal pull at the free end; that end lifted 186 m. Step 4 (sea
  current) is not reproduced.

## Formulation

A geometrically exact rod: section strains are `Γ = Qᵀx′ − e₃` and the curvature `K` from `QᵀQ′`;
energy `½(Γ·CΓ + K·DK)` with `C = diag(GA, GA, EA)` and `D = diag(EI₁, EI₂, GJ)`. Three-node
elements with two Gauss points. Nodal rotations are unit quaternions updated by spatial rotation
increments; inside an element they are interpolated as rotation vectors relative to the middle
node. Residual and tangent are the gradient and Hessian of the element energy, by second-order
forward differentiation (`src/hd.rs`). The seabed is a rigid plane with node penalty contact
(`EPN`) and Coulomb friction through an elastic tangential gap (`EPT`, `MU`), off in the first
increment of each contact, as in the reference code.

## Reference results

`reference-results/MANIFEST.json` says where each file comes from; `extract_reference.py`
rebuilds them:

- `tutorial16_step3_resultants.csv`: the data cached inside the charts of Figures 16-12 and 16-13
  in the reference code's tutorial guide (docx): M(e1) and V(e2) of all 134 elements at the end of
  step 3.
- `tutorial01_tip_history.csv`: the vector polylines of Figure 1-6 in the guide's PDF.

## Validation

`cargo test --release` runs `tests/validation.rs` and writes `VALIDATION.json`.

| Check | Observed | Tolerance |
|---|---|---|
| T1 tip vs Figure 1-6, t = 0.1…1 | 3.1e-4 m | 1e-3 m |
| T1 tip vs Reissner rod solution, 5 elements | 1.6e-4 m | 1e-3 m |
| T1 tip vs Reissner rod solution, 40 elements | 4.5e-8 m | 1e-6 m |
| T16 M(e1), 134 elements vs reference | 0.015 N·m | 0.1 N·m |
| T16 V(e2), 134 elements vs reference | 0.013 N | 0.1 N |
| T16 touchdown (M at half plateau) vs reference | 1.1e-5 m | 0.05 m |
| T16 last node on the seabed vs elastic catenary | 0.75 m | 3.14 m |
| T16 suspended shape vs elastic catenary | 2.3e-4 m | 1.05 m |

The rationale for each tolerance is stored with the check. The moment plateau is −294.3244 N·m in
both runs, which is `EI·w/H` for the submerged weight `w` = 1065.67 N/m and `H` = 1 MN. Figure
16-10 is a rendering without coordinates, so the shape is compared with the elastic catenary
instead.

Agreement with the reference code is not experimental validation and not an engineering
certification.

## Page

`/research/mechanics/gay-neto-2014` (`web/src/components/research/gayNeto2014/`). The shared
Stabileo viewer draws the line at real scale, coloured by M(e1), with the seabed; the step slider
runs through the converged increments of steps 1 to 3 (`reference-results/replay.json`, from
`cargo run --release --bin replay`). Pull, lift and friction can be changed and recomputed live in
the browser (`build.sh` builds the WASM, about 9 s per run). Charts compare M(e1) and V(e2) with the
reference data; a second tab shows the cantilever against Figure 1-6.

## How to run

```sh
cargo test --release --manifest-path research/mechanics/gay-neto-2014/Cargo.toml
```

About 8 s on a laptop.

## Limitations

Statics only. No sea current, no hydrodynamic loads, no beam-to-beam contact. The seabed is
planar triangles held by a fixed pilot node. Only the input keywords used by tutorials 1 and 16
are read.
