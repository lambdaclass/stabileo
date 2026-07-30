# Capability → clause index

Every implemented rule, default, warning and drawing requirement in the app maps to a row
here. A capability with no row is **not implemented**. A row marked *unsupported* is
deliberately surfaced to the user as unsupported rather than silently approximated.

Provenance identifiers used in code are `<code> <edition> §<clause>`, e.g.
`CIRSOC 201 2025 §25.2.1`.

## CIRSOC 101 (2025) — permanent and imposed loads

| Capability | Clause | Status | Notes |
|---|---|---|---|
| Strength load combinations (7 basic) | §2.3.2 | implemented | Combinations 1–7 verbatim |
| L reduced to 0.5 in combos 3/4/5 | §2.3.2 Exc. 1 | implemented | Only where Lo ≤ 5 kN/m² and not garage/public assembly |
| S taken as flat-roof snow in combos 2/4/5 | §2.3.2 Exc. 2 | implemented | |
| Fluid load F with the D factor | §2.3.2 | implemented | Combos 1–5 and 7 |
| Soil/earth pressure H | §2.3.2 | implemented | 1.6 additive · 0.9 permanent opposing · 0 otherwise |
| Definition of permanent loads | §3.1.1 | implemented | |
| Material self-weight | §3.1.2 | implemented | Existing `rho` path, unchanged |
| Partition allowance | §3.1.4, §4.3.2 | implemented | Editable, defaults to the code minimum |
| Minimum uniform imposed loads (Table 4.1) | §4.3.1 Table 4.1 | implemented | Digitised subset; each entry carries its table row |
| Concentrated imposed loads | §4.4, Table 4.1 | implemented | Recorded, not auto-applied to the frame model |
| Live-load reduction | §4.7.2 Eq. (4.1) | implemented | `L = Lo (0.25 + 4.57/√(K_LL·A_t))` |
| K_LL element factor | §4.7.2 Table 4.2 | implemented | |
| Reduction floors: 0.5Lo (1 floor) / 0.4Lo (2+) | §4.7.2 | implemented | |
| Heavy imposed loads > 5 kN/m² not reduced | §4.7.3 | implemented | 20 % allowed for 2+ floors |
| Passenger-garage reduction | §4.7.4 | implemented | |
| Public-assembly areas not reduced | §4.7.5 | implemented | |
| One-way slab reduction limit | §4.7.6 | implemented | Tributary width ≤ 1.5 × span |
| Roof minimum imposed loads | §4.8 | implemented | |
| Rain loads | Ch. 5 | *unsupported* | Needs drainage/scupper geometry the model does not carry |
| Snow loads | — | *unsupported* | CIRSOC 104 was not supplied |
| Risk / importance category | §1.5 | implemented | Drives wind and seismic importance |

## CIRSOC 102 (2025) — wind

| Capability | Clause | Status | Notes |
|---|---|---|---|
| Basic wind speed V | §1.5.1 | implemented | Per-locality table; user-overridable |
| Wind directionality K_d | §1.6 Table 1.6-1 | implemented | 0.85 for buildings (MWFRS and C&C) |
| Surface roughness / exposure B, C, D | §1.7.2, §1.7.3 | implemented | |
| Terrain exposure constants α, z_g | §1.9 Table 1.9-1 | implemented | B 7.5/1000 · C 9.8/750 · D 11.5/590 |
| Velocity-pressure exposure coefficient K_z | §1.13.1 Table 1.13-1 note 1 | implemented | `K_z = 2.41 (z/z_g)^(2/α)`, floored at z = 5 m |
| Topographic factor K_zt | §1.8 | implemented | K₁K₂K₃; defaults to 1.0 with recorded provenance |
| Ground-elevation factor K_e | §1.12 | implemented | `K_e = e^(−0.000119·z_g)`, conservative 1.0 permitted |
| Velocity pressure q_z | §1.13 Eq. (1.13-1) | implemented | `q_z = 0.613 K_z K_zt K_d K_e V²` (N/m², V in m/s) |
| Gust-effect factor G, rigid buildings | §1.9.1, §1.9.4 | implemented | G = 0.85 for rigid; flexible → unsupported |
| Flexible / dynamically sensitive buildings | §1.9.5 | *unsupported* | Requires n₁, damping and the full G_f expression |
| Enclosure classification | §1.10 | implemented | Open / partially open / partially enclosed / enclosed |
| Internal pressure coefficient (GC_pi) | §1.11 Table 1.11-1 | implemented | ±0.18 enclosed & partially open · ±0.55 partially enclosed · 0 open |
| Large-volume reduction factor on (GC_pi) | §1.11.1 | *unsupported* | Needs unpartitioned internal volume |
| Wall external pressure coefficients C_p | §2.4 Fig. 2.4-1 | implemented | Windward 0.8 · leeward −0.5/−0.3/−0.2 by L/B · side −0.7 |
| Roof external pressure coefficients C_p | §2.4 Fig. 2.4-1 | implemented | Normal-to-ridge and parallel-to-ridge tables, interpolated |
| MWFRS design pressure | §2.4.1 Eq. (2.4-1) | implemented | `p = q·G·C_p − q_i·(GC_pi)` |
| Minimum design wind load | §2.1.5 | implemented | 0.75 kN/m² walls + 0.4 kN/m² roof, applied simultaneously |
| Four design load cases (torsional) | §2.4.6 | *partially* | Cases 1 and 3 generated; torsional cases 2 and 4 unsupported |
| Domes and vaulted roofs | §2.4 Fig. 2.4-2/2.4-3 | *unsupported* | |
| Parapets / roof overhangs | §2.4.4, §2.4.5 | *unsupported* | Model carries no parapet geometry |
| Components & cladding | Ch. 5 | *unsupported* | Out of scope for a frame model |
| Wind-tunnel procedure | Ch. 6 | *unsupported* | |

## CIRSOC 201 (2025) — reinforced concrete

| Capability | Clause | Status | Notes |
|---|---|---|---|
| Minimum clear spacing, bars in a layer | §25.2.1 | implemented | `max(25 mm, d_b, (4/3)d_agg)` |
| Minimum clear distance between layers | §25.2.2 | implemented | 25 mm |
| Minimum clear spacing, column longitudinal bars | §25.2.3 | implemented | `max(40 mm, 1.5 d_b, (4/3)d_agg)` |
| Maximum nominal coarse-aggregate size limits | §26.4.2.1(a)(5) | implemented | `≤ min(⅕ least form dim, ⅓ slab thickness, ¾ min clear spacing)` |
| Shotcrete aggregate limit | §26.4.2.1(a)(13) | implemented | d_agg ≤ 13 mm |
| Strength-reduction factors φ | Ch. 21 | implemented | Via the existing verifier |
| Section strength (flexure, shear, axial) | Ch. 22 | implemented | Via the existing verifier |
| Beams — required strength, limits, detailing | Ch. 9 | implemented (verify) | Generation of curtailment is PR17 |
| Columns — required strength, limits, detailing | Ch. 10 | implemented (verify) | |
| Walls | Ch. 11 | *unsupported* | PR18 |
| Diaphragms | Ch. 12 | *unsupported* | PR19 |
| Foundations | Ch. 13 | *unsupported* | PR18 |
| Beam-column and slab-column joints | Ch. 15 | *unsupported* | PR17 (D8c gate) |
| One-way slabs | Ch. 7 | *unsupported* | PR18 |
| Two-way slabs | Ch. 8 | *unsupported* | PR18 |
| Strut-and-tie | Ch. 23 | *unsupported* | |
| Serviceability | Ch. 24 | *unsupported* | |
| Construction documents | Ch. 26 | *partially* | Drawing content requirements land in PR17 |

## INPRES-CIRSOC 103 (Parte I 2018 · Parte II 2005) — seismic

Every row is *unsupported* at PR16. They are listed so the capability model can name them
and so the UI can explain precisely what is missing. PR19 implements them.

| Capability | Clause | Status |
|---|---|---|
| Seismic zoning | I §2.2, Anexo A | *unsupported* |
| Design spectra | I Ch. 3 | *unsupported* |
| Behaviour factors | I Ch. 5 | *unsupported* |
| Static method | I Ch. 6 | *unsupported* |
| Dynamic methods | I Ch. 7 | *unsupported* |
| Structural analysis / drift | I Ch. 8 | *unsupported* |
| RC seismic frames | II Ch. 2 | *unsupported* |
| RC seismic walls | II Ch. 3 | *unsupported* |
| Frame-wall systems | II Ch. 4 | *unsupported* |
| Diaphragms | II Ch. 5 | *unsupported* |
| Foundations | II Ch. 6 | *unsupported* |
| Limited-ductility structures | II Ch. 7 | *unsupported* |
