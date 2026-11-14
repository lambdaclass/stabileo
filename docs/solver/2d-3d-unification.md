# Unifying the 2D and 3D Solvers

Status: design spike (analysis only; no engine behaviour changes).
Addresses roadmap cause D (global-axis or X–Z plane assumptions) and cause E (duplicate 2D/3D,
prepared/regular or Rust/TS paths that diverge) in `docs/roadmap/PRODUCT_ROADMAP.md:123-124, 165-172, 183-184`,
and the open support-rule divergence (`#1636`–`#1646`).

---

## 1. Inventory of 2D/3D Pairs

The engine maintains parallel 2D and 3D representations in `engine/src/types/input.rs`,
parallel element kernels in `engine/src/element/`, and 78 function/type pairs across 26 files
in `engine/src/solver/` (57 top-level `_2d`/`_3d`-named pairs plus 21 un-suffixed 2D / `_3d`
companion pairs), along with 2D-only modules (`arc_length.rs`, `plastic_limit.rs`) and 3D-only
surface/continuum element types.

Each pair is classified into one of three categories:

- **Truly duplicate**: identical algorithm and control flow after erasing the input/output struct names.
- **Differ only in DOF count**: identical mathematical formulation parameterized by `dofs_per_node` ($2$ or $3$ in 2D vs $3$, $6$, or $7$ in 3D), element DOF vector length ($4$/$6$ vs $6$/$12$/$14$), or spatial coordinate count ($2$ vs $3$).
- **Genuinely differ**: different boundary-condition rules, element sets, sign conventions, solver fallbacks, feature coverage, or numerical guards.

### 1.1 Input and Result Types (`engine/src/types/input.rs`)

> [!NOTE]
> **No 2D plane-stress or plane-strain continuum elements exist in the engine.**
> `SolverInput` (`engine/src/types/input.rs:227-245`) contains only line elements (`"frame"`, `"truss"`, `"cable"`) and `ConnectorElement`. All continuum and surface elements (`PlateElement` at `input.rs:733-746`, `QuadElement` at `751-764`, `Quad9Element` at `769-782`, `SolidShellElement` at `788-804`, `CurvedShellElement` at `809-826`, and `CurvedBeamElement` at `896-925`) exist exclusively on `SolverInput3D` (`input.rs:990-1033`).

| 2D Type (`file:line`) | 3D Type (`file:line`) | Classification | What Differs |
|---|---|---|---|
| `SolverNode` (`types/input.rs:8-15`) | `SolverNode3D` (`types/input.rs:517-524`) | Differ only in DOF count | 2D has `(x, z)` with `#[serde(rename = "z", alias = "y")]`; 3D has `(x, y, z)`. |
| `SolverSection` (`types/input.rs:34-43`) | `SolverSection3D` (`types/input.rs:532-558`) | Genuinely differ | 2D has `(a, iz, as_y)` where `as_y` pairs with `iz`; 3D has `(a, iy, iz, j, cw, as_y, as_z, shear_center_y, shear_center_z)` where `as_y` pairs with `iy` and `as_z` pairs with `iz` (`docs/solver/frames.md:35-42, 494`). |
| `SolverElement` (`types/input.rs:47-63`) | `SolverElement3D` (`types/input.rs:562-596`) | Genuinely differ | 2D has boolean `hinge_start`, `hinge_end`; 3D has per-axis `release_my_start/end`, `release_mz_start/end`, `release_t_start/end`, `local_yx/yy/yz`, `roll_angle`. |
| `SolverSupport` (`types/input.rs:67-93`) | `SolverSupport3D` (`types/input.rs:600-653`) | Genuinely differ | 2D uses string `support_type` (`"fixed"`, `"pinned"`, `"rollerX"`, `"rollerY"`, `"rollerZ"`, `"guidedX"`, `"guidedY"`, `"guidedZ"`, `"inclinedRoller"`, `"spring"`), spring triplet `(kx, ky, kz)` where `ky` is vertical ($Z$) and `kz` is rotational ($\theta$), settlements `(dx, dz, dry)`, and `angle` (used both for `"inclinedRoller"` normal and for rotated `"spring"` axes). 3D uses boolean flags `(rx, ry, rz, rrx, rry, rrz, rw)`, 7 springs `(kx..krz, kw)`, 6 settlements `(dx..drz)`, and `is_inclined` + `(normal_x, normal_y, normal_z)`. |
| `SolverNodalLoad` (`types/input.rs:97-105`) | `SolverNodalLoad3D` (`types/input.rs:657-671`) | Genuinely differ | 2D has `(fx, fz, my)` where `my` acts on $\theta_{2D} = -\theta_Y^{3D}$; 3D has `(fx, fy, fz, mx, my, mz, bw)`. |
| `SolverDistributedLoad` (`types/input.rs:109-121`) + `SolverAxialDistributedLoad` (`152-164`) | `SolverDistributedLoad3D` (`types/input.rs:675-692`) | Genuinely differ | 2D splits transverse `(q_i, q_j)` and axial `(q_i, q_j)` into two enum variants (`SolverLoad::Distributed` and `SolverLoad::AxialDistributed`); 3D combines `(q_xi, q_xj, q_yi, q_yj, q_zi, q_zj)` in one struct. |
| `SolverPointLoad` (`types/input.rs:125-137`) | `SolverPointLoad3D` (`types/input.rs:696-705`) | Genuinely differ | 2D has transverse `p`, optional axial `px`, and optional concentrated couple `my` at `a`; 3D has only transverse `(py, pz)` at `a` (no axial point load `px` or couple on a 3D member; `metamorphic/planes.rs:203-205`). |
| `SolverThermalLoad` (`types/input.rs:141-148`) | `SolverThermalLoad3D` (`types/input.rs:709-721`) | Genuinely differ | 2D has `(dt_uniform, dt_gradient, alpha, depth)`; 3D has `(dt_uniform, dt_gradient_y, dt_gradient_z, alpha, depth_y, depth_z)` with opposite hot-face sign conventions on $y$ and $z$ (`element/fef.rs:288-307, 464-489`). |
| `SolverLoad` (`types/input.rs:200-207`) | `SolverLoad3D` (`types/input.rs:943-969`) | Genuinely differ | 2D has 5 variants; 3D has 5 line/nodal variants (`Nodal`, `Distributed`, `PointOnElement`, `Thermal`, `Bimoment`) plus 14 plate/quad/shell surface, edge, thermal, and self-weight variants. |
| `SolverInput` (`types/input.rs:227-245`) | `SolverInput3D` (`types/input.rs:990-1033`) | Genuinely differ | 3D adds `left_hand`, `plates`, `quads`, `quad9s`, `solid_shells`, `curved_shells`, `curved_beams`. Both share `Constraint` (`169-196`), `ConnectorElement` (`832-890`), `SolverOptions` (`974-986`), and `Material` (`24-30`). |
| `AnalysisResults`, `Displacement`, `Reaction`, `ElementForces` (`types/input.rs:249-326`) | `AnalysisResults3D`, `Displacement3D`, `Reaction3D`, `ElementForces3D` (`types/input.rs:1037-1161`) | Genuinely differ | 2D displacements `(ux, uz, ry)`, reactions `(rx, rz, my)`, element forces `(n, v, m)` at start/end; 3D displacements `(ux, uy, uz, rx, ry, rz)`, reactions `(fx, fy, fz, mx, my, mz)`, element forces `(n, vy, vz, mx, my, mz, bimoment)` plus plate/quad/shell/curved-beam stresses. |

### 1.2 Element Kernels (`engine/src/element/`)

| 2D Function (`file:line`) | 3D Function (`file:line`) | Classification | What Differs |
|---|---|---|---|
| `truss_local_stiffness_2d` (`element/truss.rs:9-19`) | `truss_local_stiffness_3d` (`element/truss.rs:51-62`) | Differ only in DOF count | $4\times 4$ vs $6\times 6$ with $EA/L$ at axial slots $(0, 2)$ vs $(0, 3)$. |
| `truss_global_stiffness_2d` (`element/truss.rs:24-44`) | `truss_global_stiffness_3d` (`element/truss.rs:68-89`) | Differ only in DOF count | $k\,d\,d^{\mathsf T}$ outer product for $d \in \mathbb{R}^2$ vs $d \in \mathbb{R}^3$. |
| `frame_local_stiffness_2d` (`element/frame.rs:13-84`) | `frame_local_stiffness_3d` (`element/frame.rs:163-260`) & `frame_local_stiffness_3d_warping` (`405-445`) | Differ only in DOF count | 2D builds $6\times 6$ axial + single Timoshenko bending block ($s = +1$); 3D calls shared `add_bending_block` (`frame.rs:268-334`) for $x$–$y$ ($s = +1$, DOFs `[1,5,7,11]`) and $x$–$z$ ($s = -1$, DOFs `[2,4,8,10]`) plus axial and St.-Venant/Vlasov torsion (`torsion_warping_block`, `348-395`). See §3. |
| `frame_transform_2d` (`element/transform.rs:9-29`), `truss_transform_2d` (`32-45`) | `frame_transform_3d` (`element/transform.rs:90-104`), `frame_transform_3d_warping` (`112-135`), `compute_local_axes_3d` (`144-196`) | Genuinely differ | 2D uses planar rotation $R(\alpha)$ with identity on $\theta$ (`T[2][2] = T[5][5] = 1`); 3D builds a $3\times 3$ triad $\Lambda = [e_x; e_y; e_z]$ via `default_ey_ref` (`transform.rs:198-208`, switching reference from $+Z$ to $+X$ when $|e_x \cdot Z| > 0.999$), optional `local_y`, and `roll_angle`. |
| `fef_distributed_2d` (`element/fef.rs:62-97`), `fef_partial_distributed_2d` (`109-174`), `fef_point_load_2d` (`182-227`), `fef_moment_load_2d` (`234-261`), `fef_point_load_general_2d` (`265-282`), `fef_thermal_2d` (`288-307`), `adjust_fef_for_hinges` (`323-397`) | `fef_distributed_3d` (`element/fef.rs:403-420`), `fef_partial_distributed_3d` (`424-446`), `fef_point_load_3d` (`450-460`), `fef_thermal_3d` (`464-489`), `fef_distributed_torsion_warping` (`503-521`), `adjust_fef_for_hinges_3d` (`564-652`) | Genuinely differ | 3D calls the 2D FEF kernels per plane via `place_bending_planes_3d` (`fef.rs:536-561`, negating $x$–$z$ moments because $\theta_y = -w'$), except `fef_thermal_3d` (`464-489`) does **not** negate the $z$-gradient moments (`[0, +m_y, 0, -m_y]` vs `[0, -m_z, 0, +m_z]`), reversing the hot-face convention between $y$ and $z$, and `fef_point_load_3d` (`450-460`) omits axial `px` and point moment `my`. |
| `connector_stiffness_2d` (`element/connector.rs:73-138`) | `connector_stiffness_3d` (`element/connector.rs:146-214`) | Genuinely differ | 2D rotates the spring matrix by `orientation_2d` (`connector.rs:28-51`); 3D rotates by `orientation_3d` (`53-71`), which uses a non-smooth reference switch at $|e_{x,z}| > 0.99` and accepts no user local-axis override (`#419`). |

### 1.3 Solver Functions (`engine/src/solver/`)

| # | Module | 2D Function / Type (`file:line`) | 3D Function / Type (`file:line`) | Classification | What Differs |
|---|---|---|---|---|---|
| 1 | `dof.rs` | `dofs_per_node_2d` (`dof.rs:28-31`) | `dofs_per_node_3d` (`dof.rs:35-40`) | Differ only in DOF count | Returns `2` (truss/cable only) or `3` in 2D; `3` (truss/cable only), `6`, or `7` (any section with `cw > 0`) in 3D. |
| 2 | `dof.rs` | `DofNumbering::build_2d` (`dof.rs:43-94`) + `is_dof_restrained_2d` (`244-259`) | `DofNumbering::build_3d` (`dof.rs:97-171`) + `inclined_restrained_3d` (`266-282`) | **Genuinely differ** | **Root cause of `#1636`–`#1646`**: In 2D (`dof.rs:244-259`), `is_dof_restrained_2d` checks only `sup.support_type`; a rigid support (`"fixed"`, `"pinned"`, `"rollerX"`, `"rollerY"`, `"rollerZ"`, `"guidedX"`, `"guidedY"`, `"guidedZ"`, `"inclinedRoller"`) keeps its DOFs restrained even when positive spring stiffnesses `kx, ky, kz > 0` are present on those DOFs. In 3D (`dof.rs:134-143`), `let has_spring = k[local_dof].unwrap_or(0.0) > 0.0; !has_spring && flags[local_dof]` **frees** any flagged DOF that also has a positive spring (except at inclined 3D supports, where `inclined_restrained_3d` at `dof.rs:266-282` returns `Some(...)` before checking `has_spring`, so rotational springs `krx..krz, kw` do not free flagged rotations there). Also, in 2D `"inclinedRoller"` restrains local slot `1` (normal), whereas in 3D `inclined_restrained_3d` restrains local slot `0` (normal). |
| 3 | `stability.rs` | `of_2d` (`stability.rs:530-539`) | `of_3d` (`stability.rs:541-551`) | Truly duplicate | Thin wrappers calling `without_artificial_stiffness` (`assembly.rs:53-68`), `assemble_sparse_2d`/`3d`, `FreeConstraintSystem::build_2d`/`3d`, and shared `reduced` (`stability.rs:509-528`) $\to$ `analyze_constrained` (`164-247`) $\to$ `analyze` (`255-434`). `tags(dof_num, two_d)` (`79-90`) maps local DOF index to `Kind::{Translation, Rotation, Warping}`. |
| 4 | `assembly.rs` | `orphan_rotation_dofs` (`assembly.rs:95-106`) + `connector_rotation_nodes_2d` (`117-131`) + `rotation_tied_nodes_2d` (`138-142`) + `constraint_rotation_nodes_2d` (`144-164`) | `orphan_rotation_dofs_3d` (`assembly.rs:74-89`) | **Genuinely differ** | 2D exempts nodes whose rotation is stiffened by a `ConnectorElement` (including translational `kx`/`ky` with a non-zero offset arm, `122-127`) or referenced by a constraint with non-zero rotational weight (`144-164`). 3D (`74-89`) checks only constraints (ignoring `r == 0.0` in `MasterSlave`) and does **not** check 3D `connectors`. Also, 2D also adds $k_\text{art}$ to all-hinged frame nodes (`assembly.rs:688-705`, `sparse_assembly.rs:572-589`). |
| 5 | `assembly.rs` | `refuse_connector_arm_mechanism_2d` (`assembly.rs:307-399`) | `refuse_connector_arm_mechanism_3d` (`assembly.rs:180-296`) | Differ only in DOF count | Checks whether a node with only rigid-arm translational connectors has an unrestrained rotational mechanism ($1\times 1$ scalar rotation check in 2D vs $3\times 3$ SVD/rank check in 3D). |
| 6 | `assembly.rs` | `InclinedTransformData2D` (`assembly.rs:407-412`), `inclined_rotation_matrix_2d` (`424-428`), `rotate_inclined_k_2d` (`431-460`), `rotate_inclined_f_2d` (`463-475`), `apply_inclined_transform_2d` (`483-487`), `reverse_inclined_transform_2d` (`490-502`), `apply_inclined_transform_triplets_2d` (`2486-2546`) | `InclinedTransformData` (`assembly.rs:415-421`), `inclined_rotation_matrix` (`505-525`), `rotate_inclined_k_3d` (`528-557`), `rotate_inclined_f_3d` (`560-572`), `apply_inclined_transform` (`578-582`), `reverse_inclined_transform` (`585-597`), `apply_inclined_transform_triplets_k` (`2549-2609`), `apply_inclined_transform_triplets` (`2612-2620`) | Genuinely differ | 2D builds $R = \begin{bmatrix}-\cos\theta & \sin\theta \\ \sin\theta & \cos\theta\end{bmatrix}$ ($\det R = -1$, normal in row 1); 3D builds a proper $3\times 3$ rotation ($\det R = +1$, normal in row 0). Sparse triplet rotation is already unified over `InclinedFrame<const D: usize>` (`assembly.rs:2396-2484`). |
| 7 | `assembly.rs` | `support_spring_entries_2d` (`assembly.rs:3465-3502`) | `support_spring_entries_3d` (`assembly.rs:3508-3524`) | **Genuinely differ** | 2D supports rotated springs via `sup.angle` on any non-`"inclinedRoller"` support, generating off-diagonal $(u_X, u_Z)$ coupling `(kx - ky) * sin * cos` (`3480-3497`); 3D only emits diagonal entries for `(kx..krz, kw)` in global axes (`3510-3521`). |
| 8 | `assembly.rs` | `assemble_stiffness_2d` (`assembly.rs:609-612`), `assemble_stiffness_2d_typed` (`614-855`) | `assemble_stiffness_3d` (`assembly.rs:1148-1582`) | Genuinely differ | 2D assembles frames, trusses, cables, connectors, rotated/diagonal springs, and 2D artificial stiffness. 3D also assembles 14-DOF warping frames (`DOF_MAP_12_TO_14`), `plates`, `quads`, `quad9s`, `solid_shells`, `curved_shells`, `curved_beams`, and warping artificial stiffness (`< 1e-20`, `1556-1565`). |
| 9 | `assembly.rs` | `truss_member_load_2d` (`assembly.rs:885-941`), `assemble_truss_loads_2d` (`865-883`) | `truss_member_load_3d` (`assembly.rs:1591-1672`) | Genuinely differ | 2D handles `PointOnElement` with axial `px` and couple `my` ($\mp M/L$) and `AxialDistributed`; 3D handles 3D distributed `(q_xi..q_zj)` and transverse `PointOnElement` `(py, pz)`. |
| 10 | `assembly.rs` | `assemble_load_vector_2d` (`assembly.rs:946-1036`), `assemble_element_loads_2d` (`1053-1135`), `assemble_2d` (`1039-1051`) | `assemble_load_vector_3d_dense` (`assembly.rs:1767-2115`), `assemble_load_vector_3d_sparse` (`3051-3318`), `assemble_frame_loads_3d` (`1677-1762`), `assemble_element_loads_3d` (`2132-2192`), `assemble_element_loads_3d_warping` (`2195-2257`), `assemble_element_loads_3d_mapped` (`2260-2319`), `assemble_3d` (`2118-2130`) | Genuinely differ | 3D adds `Bimoment` nodal loads and 14 shell/plate/quad/curved-beam load variants; 2D handles `AxialDistributed` and point-load `px`/`my`. |
| 11 | `assembly.rs` & `sparse_assembly.rs` | `assemble_sparse_2d` (`assembly.rs:2346-2348`), `assemble_sparse_2d_ex` (`2360-2371`), `assemble_2d_sparse` (`sparse_assembly.rs:127-289`), `assemble_stiffness_sparse_2d` (`307-310`), `assemble_stiffness_sparse_2d_typed` (`312-625`), `assemble_elements_parallel_2d` (`644-897`) | `assemble_sparse_3d` (`assembly.rs:3323-3335`), `assemble_stiffness_sparse_3d` (`2624-3046`), `assemble_stiffness_sparse_3d_parallel` (`sparse_assembly.rs:994-1424`), `assemble_sparse_3d_parallel` (`1428-1443`), `assemble_load_vector_3d_sparse_parallel` (`1451-1885`), `assemble_load_vector_sparse_3d` (`1891-1909`) | Genuinely differ | Sparse triplet counterparts of #8–#10. 3D has a parallel sparse load assembler (`1451-1885`); 2D assembles load vectors sequentially. |
| 12 | `linear.rs` | `solve_2d` (`linear.rs:413-417`), `solve_2d_typed` (`420-430`), `solve_2d_inner` (`432-444`), `PreparedStatic2D` (`464-478`), `prepare_static_2d` (`641-643`), `prepare_static_2d_impl` (`728-989`), `PreparedStatic2D::solve_loads` (`1014-1041`), `solve_loads_by_path` (`1089-2001`) | `solve_3d` (`linear.rs:2022-2025`), `solve_3d_inner` (`2041-2060`), `PreparedStatic3D` (`2067-2083`), `prepare_static_3d` (`2268-2270`), `prepare_static_3d_for_analysis` (`2272-2641`), `PreparedStatic3D::solve_loads` (`2647-2675`), `solve_loads_by_path` (`2727-2735`) | **Genuinely differ** | **Solver fallback divergence (`docs/solver/stability.md:18-20`)**: 2D sparse (`linear.rs:830-947`) tries unshifted sparse Cholesky, then dense LU with `StiffnessNotPositiveDefinite`; 3D sparse (`linear.rs:2430-2530`) runs a diagonal shift ladder (`alpha * max_d`) on sparse Cholesky before falling back to dense LU or PCG. Also, 2D checks artificial-DOF rotation $> 100\text{ rad}$ after solve (`linear.rs:1129-1138`), whereas 3D refuses loads on orphan DOFs before solve (`refuse_loads_on_orphan_dofs_3d`, `5283-5310`, `#1445`). |
| 13 | `linear.rs` | `sparse_conditioning_2d` (`linear.rs:578-636`) | `sparse_diagonal_conditioning` (`linear.rs:3924-3945`) | Genuinely differ | 2D partitions DOFs by translation vs rotation to compute per-kind diagonal ratios (`578-636`); 3D computes the raw diagonal ratio across all DOFs (`3924-3945`). |
| 14 | `linear.rs` | `prescribed_displacements_2d` (`linear.rs:656-726`) | `prescribed_displacements_3d` (`linear.rs:2213-2266`) | Differ only in DOF count | Projects settlements onto inclined support normal ($\sin\theta\,d_x + \cos\theta\,d_z$ in 2D vs $\hat{n}\cdot d$ in 3D) and maps axial/rotational settlements to restrained DOF indices. |
| 15 | `linear.rs` | `build_displacements_2d` (`linear.rs:3947-3958`) | `build_displacements_3d` (`linear.rs:3960-3977`) | Differ only in DOF count | Unpacks `u` into `Displacement` vs `Displacement3D`. |
| 16 | `linear.rs` | `build_reactions_2d` (`linear.rs:3979-4063`), `build_reactions_2d_inclined` (`4072-4104`) | `build_reactions_3d` (`linear.rs:4106-4184`), `build_reactions_3d_inclined` (`4187-4223`) | Genuinely differ | 2D handles rotated `"spring"` reaction `-R_beta^T diag(k) R_beta u` (`4006-4030`) and inclined slot 1; 3D handles 6 DOFs and inclined slot 0. |
| 17 | `linear.rs` | `plain_rigid_2d` (`linear.rs:4318-4323`), `reject_unimposed_settlements_2d` (`4354-4389`) | `plain_rigid_3d` (`linear.rs:4327-4333`), `reject_unimposed_settlements_3d` (`4395-4441`) | Genuinely differ | 3D `reject_unimposed_settlements_3d` (`4403-4416`) explicitly refuses a settlement on a DOF where both restraint flag and spring stiffness are set; 2D (`4354-4389`) checks whether the `support_type` restrains the DOF. |
| 18 | `linear.rs` | `validate_input_2d` (`linear.rs:4443-4618`), `validate_loads_2d` (`4623-4691`) | `validate_input_3d` (`linear.rs:4773-4775`), `validate_input_3d_for_analysis` (`4777-5097`), `validate_loads_3d` (`5102-5207`) | Genuinely differ | 3D also validates `left_hand` refusal (`4786-4791`), `j`/`cw`, `is_inclined` normal length, and plate/quad/shell/curved-beam geometry and aspect ratios. |
| 19 | `linear.rs` | `refuse_moments_without_rotation_2d` (`linear.rs:4701-4764`), `moment_lost_2d` (`4766-4771`) | `refuse_moments_without_rotation_3d` (`linear.rs:5216-5277`), `refuse_loads_on_orphan_dofs_3d` (`5283-5310`), `moment_lost_3d` (`5312-5317`) | **Genuinely differ** | **Divergence `#1445`**: 3D has `refuse_loads_on_orphan_dofs_3d` (`5283-5310`), which refuses any nodal moment or member fixed-end moment landing on an orphan rotational DOF before solving; 2D lacks `refuse_loads_on_orphan_dofs_2d` and relies on `refuse_moments_without_rotation_2d` plus the post-solve $> 100\text{ rad}$ check (`linear.rs:1129-1138`). |
| 20 | `linear.rs` | `compute_internal_forces_2d` (`linear.rs:5319-5325`), `compute_internal_forces_2d_with_loads` (`5329-5337`), `compute_internal_forces_2d_typed` (`5339-5563`) | `compute_internal_forces_3d` (`linear.rs:5565-5571`), `compute_internal_forces_3d_with_loads` (`5575-5884`) | Genuinely differ | Recover $f_\text{local} = k\,T\,u_e - f_e^*$; 3D also recovers 14-DOF warping bimoments and plate/quad/quad9/solid-shell/curved-shell/curved-beam stresses (`5889-6385`). |
| 21 | `linear.rs` | `compute_equilibrium_summary_2d` (`linear.rs:6511-6617`) | `compute_equilibrium_summary_3d` (`linear.rs:6390-6504`) | Differ only in DOF count | Sums applied loads and reactions in 3 components $(F_x, F_z, M_y)$ vs 6 components $(F_x, F_y, F_z, M_x, M_y, M_z)$ about the origin. |
| 22 | `constraints.rs` | `inclined_dofs_2d` (`constraints.rs:343-359`) | `inclined_dofs_3d` (`constraints.rs:363-384`) | Differ only in DOF count | Collects inclined support rotation matrices (`InclinedFrame<2>` vs `InclinedFrame<3>`) for `equations_in_inclined_frames`. |
| 23 | `constraints.rs` | `solve_constrained_2d` (`constraints.rs:1486-1488`), `contain_constrained_2d` (`1491-1497`), `solve_constrained_2d_inner` (`1499-1527`), `solve_constrained_2d_dense` (`1533-1539`), `solve_constrained_2d_dense_validated` (`1541-1865`), `solve_constrained_2d_sparse` (`1875-2120`), `FreeConstraintSystem::build_2d` (`2571-2576`) | `solve_constrained_3d` (`constraints.rs:2123-2131`), `solve_constrained_3d_inner` (`2133-2470`), `FreeConstraintSystem::build_3d` (`2579-2584`) | **Genuinely differ** | In `build_constraint_transform` (`constraints.rs:110-335`), `RigidLink` with `dofs: []` defaults to `0..dofs_per_node.min(3)` (`138-142`), which ties $(u_x, u_z, \theta)$ in 2D (including rotation!) but $(u_x, u_y, u_z)$ in 3D (translations only; `AC-3` in `docs/solver/assembly-constraints.md:592`). Also, `"XY"` `Diaphragm` in 2D ties $(u_x, u_z, \theta)$ in the vertical model plane instead of only $u_x$ (`constraints.rs:217-225`, `AC-5`). |
| 24 | `pdelta.rs` | `to_global_2d` (`pdelta.rs:69-72`), `k_with_geometric_2d` (`82-96`), `PDeltaSystem2D` (`236-281`), `solve_pdelta_2d` (`223-230`), `solve_pdelta_2d_on` (`286-380`), `second_order_forces_2d` (`387-399`) | `to_global_3d` (`pdelta.rs:75-78`), `k_with_geometric_3d` (`98-112`), `PDeltaSystem3D` (`519-558`), `solve_pdelta_3d` (`562-573`), `solve_pdelta_3d_on` (`575-628`), `second_order_forces_3d` (`402-419`) | Truly duplicate | Both implement `PDeltaOps` (`pdelta.rs:117-125`) and delegate the Picard iteration to shared `run_pdelta_picard` (`130-217`). |
| 25 | `geometric_stiffness.rs` | `uniform_dt_2d` (`geometric_stiffness.rs:51-60`), `mean_axial_forces_2d` (`515-542`), `span_axial_geometric_stiffness_2d` (`575-611`), `add_geometric_stiffness_2d` (`501-509`), `emit_geometric_stiffness_2d` (`694-701`), `emit_buckling_geometric_stiffness_2d` (`703-711`), `emit_geometric_stiffness_2d_filtered` (`713-765`), `frame_kg_local_2d` (`775-787`), `frame_kg_global_2d` (`803-805`), `frame_geometric_end_forces_2d` (`816-838`), `truss_kg_2d` (`887-899`), `add_truss_kg_2d` (`901-949`), `build_kg_from_forces_2d` (`957-1011`), `geometric_stiffness_terms_2d` (`1538-1574`) | `uniform_dt_3d` (`geometric_stiffness.rs:62-71`), `mean_axial_forces_3d` (`544-573`), `span_axial_geometric_stiffness_3d` (`454-499`), `add_geometric_stiffness_3d` (`1382-1390`), `emit_geometric_stiffness_3d` (`1394-1401`), `emit_buckling_geometric_stiffness_3d` (`1403-1411`), `emit_geometric_stiffness_3d_filtered` (`1413-1494`), `frame_kg_local_3d` (`233-282`), `frame_kg_local_3d_warping` (`288-336`), `frame_kg_global_3d` (`339-346`), `frame_kg_span_local_3d` (`395-427`), `frame_geometric_end_forces_3d` (`841-884`), `truss_kg_3d` (`1366-1379`), `build_kg_from_forces_3d` (`1014-1020`), `build_kg_from_forces_3d_keep` (`1026-1087`), `geometric_stiffness_terms_3d` (`1606-1653`) | Differ only in DOF count | Both call shared `add_plane_kg` (`geometric_stiffness.rs:146-226`) and `add_plane_span_kg` (`352-392`) for consistent cubic-Hermite $K_g$ with hinge condensation; 3D adds $x$–$z$ plane (`s = -1`), warping `frame_kg_local_3d_warping`, and plate/quad/shell/curved-beam $K_g$. |
| 26 | `mass_matrix.rs` | `nodal_mass_entries_2d` (`mass_matrix.rs:46-58`), `total_mass_by_direction_2d` (`79-87`), `assemble_mass_matrix_2d` (`102-121`), `frame_consistent_mass` (`126-171`), `truss_consistent_mass` (`174-186`), `assemble_mass_matrix_2d_sparse` (`237-243`), `assemble_mass_matrix_2d_sparse_inclined` (`247-256`), `assemble_mass_matrix_2d_sparse_block` (`260-268`), `assemble_mass_matrix_2d_sparse_impl` (`270-355`), `compute_total_mass` (`1194-1200`), `compute_total_mass_elements` (`1203-1224`) | `nodal_mass_entries_3d` (`mass_matrix.rs:61-75`), `total_mass_by_direction_3d` (`90-98`), `assemble_mass_matrix_3d` (`359-597`), `frame_consistent_mass_3d` (`906-983`), `frame_consistent_mass_3d_warping` (`994-1024`), `assemble_mass_matrix_3d_sparse` (`616-622`), `assemble_mass_matrix_3d_sparse_inclined` (`626-635`), `assemble_mass_matrix_3d_sparse_block` (`639-647`), `assemble_mass_matrix_3d_sparse_impl` (`649-858`), `compute_total_mass_3d` (`1029-1034`), `compute_total_mass_3d_elements` (`1038-1190`) | Differ only in DOF count | Consistent Hermite frame mass (`frame_consistent_mass` vs `frame_consistent_mass_3d`) is identical on the in-plane block (see §3.6); 3D adds torsional polar inertia $I_p = I_y + I_z$ (`mass_matrix.rs:942-947`), warping mass (`994-1024`), and plate/quad/shell/area masses. |
| 27 | `buckling.rs` | `BucklingSystem2D` (`buckling.rs:57-69`), `buckling_system_2d` (`72-146`), `axial_force_round_off_2d` (`151-173`), `solve_buckling_2d` (`326-472`) | `BucklingSystem3D` (`buckling.rs:478-491`), `buckling_system_3d` (`494-601`), `axial_force_round_off_3d` (`175-197`), `solve_buckling_3d` (`635-768`) | Differ only in DOF count | Same pre-buckling static solve, round-off axial force zeroing (`151-197`), constraint reduction of $(K, K_g)$, and dense/shift-invert Lanczos eigensolve, unpacking mode shapes into `Displacement` vs `Displacement3D`. |
| 28 | `modal.rs` | `solve_modal_2d` (`modal.rs:65-368`) | `solve_modal_3d` (`modal.rs:532-728`) | Differ only in DOF count | Same sparse/dense generalized eigensolve $K\phi = \omega^2 M\phi$, effective modal mass and participation factor computation (2 translational + 1 rotational direction in 2D vs 3 translational + 3 rotational in 3D). |
| 29 | `spectral.rs` | `solve_spectral_2d` (`spectral.rs:233-359`) | `solve_spectral_3d` (`spectral.rs:409-541`) | Differ only in DOF count | Calls `solve_modal_2d`/`3d`, scales modal responses by the spectral acceleration curve, and combines via SRSS/CQC. |
| 30 | `harmonic.rs` | `solve_harmonic_2d` (`harmonic.rs:122-126`), `solve_harmonic_2d_with_damping` (`128-132`), `solve_harmonic_2d_contained` (`134-281`), `get_target_dof_2d` (`998-1008`) | `solve_harmonic_3d` (`harmonic.rs:288-292`), `solve_harmonic_3d_with_damping` (`294-305`), `solve_harmonic_3d_contained` (`307-460`), `get_target_dof_3d` (`1010-1028`) | Truly duplicate | Both assemble sparse $(K, M)$, apply constraint reduction, and call the shared complex frequency-sweep / modal-superposition solver (`harmonic.rs:462-996`). |
| 31 | `time_integration.rs` | `solve_time_history_2d` (`time_integration.rs:58-62`), `solve_time_history_2d_traced` (`65-71`), `solve_time_history_2d_inner` (`73-328`), `build_ground_influence_2d` (`696-722`), `force_history_slope_2d` (`775-788`), `compute_force_at_step` (`730-773`), `interpolate_force_history` (`808-861`), `assemble_force_record` (`865-885`), `record_state` (`1080-1101`), `build_peak_displacements` (`1104-1134`), `compute_reactions_at_state` (`1180-1200`) | `solve_time_history_3d` (`time_integration.rs:1212-1216`), `solve_time_history_3d_traced` (`1219-1225`), `solve_time_history_3d_inner` (`1227-1510`), `build_ground_influence_3d` (`1520-1541`), `force_history_slope_3d` (`1546-1559`), `compute_force_at_step_3d` (`1561-1620`), `interpolate_force_history_3d` (`1623-1673`), `assemble_force_record_3d` (`1676-1705`), `record_state_3d` (`1718-1744`), `build_peak_displacements_3d` (`1747-1762`), `compute_reactions_at_state_3d` (`1767-1787`) | Differ only in DOF count | Identical Newmark-$\beta$ / HHT-$\alpha$ time-stepping loop, Rayleigh damping, ground-motion influence vector, and force-history interpolation, duplicated for 2D and 3D types. |
| 32 | `corotational.rs` | `solve_corotational_2d` (`corotational.rs:59-358`), `scaled_loads_2d` (`363-380`), `shear_rigidity_2d` (`418-425`), `assemble_corotational` (`434-471`), `assemble_corotational_triplets_2d` (`479-522`), `assemble_truss_corotational` (`528-595`), `assemble_frame_corotational` (`603-764`), `add_spring_contributions` (`859-877`), `compute_max_displacement` (`942-953`), `build_final_results` (`956-1062`), `compute_corotational_forces` (`1065-1252`) | `solve_corotational_3d` (`corotational.rs:1269-1568`), `scaled_loads_3d` (`384-404`), `assemble_corotational_3d` (`1571-1582`), `assemble_corotational_triplets_3d` (`1589-1607`), `assemble_corotational_3d_impl` (`1609-1661`), `assemble_truss_corotational_3d` (`1669-1734`), `assemble_frame_corotational_3d` (`1744-1883`), `add_spring_contributions_3d` (`2100-2124`), `compute_max_displacement_3d` (`2127-2139`), `build_final_results_3d` (`2142-2247`), `compute_corotational_forces_3d` (`2258-2286`), `elastic_corotational_forces_3d` (`2317-2494`) | Genuinely differ | 2D uses exact deformed planar angle $\alpha = \operatorname{atan2}(\Delta z + \Delta u_z, \Delta x + \Delta u_x)$ (`corotational.rs:621-632`); 3D uses Crisfield's incremental triad update (`1760-1820`) for finite 3D rotations and refuses models with surface/shell elements (`1277-1285`). |
| 33 | `material_nonlinear.rs` | `solve_nonlinear_material_2d` (`material_nonlinear.rs:55-61`), `solve_nonlinear_material_2d_inner` (`63-378`), `secant_member_forces_2d` (`386-404`), `secant_model_2d` (`435-450`), `lookup_alpha` (`473-485`), `lookup_capacities` (`492-499`), `assemble_tangent_stiffness` (`506-518`), `assemble_tangent_stiffness_triplets` (`522-538`), `assemble_tangent_stiffness_scatter` (`542-634`), `compute_global_internal_forces` (`653-753`), `update_element_states` (`760-808`), `yield_utilization` (`814-818`), `compute_max_displacement` (`851-862`), `build_element_status` (`868-943`) | `solve_nonlinear_material_3d` (`material_nonlinear.rs:966-973`), `solve_nonlinear_material_3d_inner` (`975-1275`), `secant_member_forces_3d` (`407-431`), `secant_model_3d` (`453-468`), `lookup_alpha_3d` (`1281-1293`), `lookup_capacities_3d` (`1299-1306`), `assemble_tangent_stiffness_3d` (`1313-1325`), `assemble_tangent_stiffness_3d_triplets` (`1329-1345`), `assemble_tangent_stiffness_3d_scatter` (`1349-1487`), `compute_global_internal_forces_3d` (`1493-1639`), `yield_utilization_3d` (`1651-1656`), `update_element_states_3d` (`1662-1701`), `compute_max_displacement_3d_nl` (`1707-1719`), `build_element_status_3d` (`1725-1801`) | Differ only in DOF count | Same incremental Newton–Raphson / secant degradation loop; 2D checks uniaxial $|N|/N_p + |M|/M_p$ (`814-818`), whereas 3D checks biaxial $|N|/N_p + |M_y|/M_{py} + |M_z|/M_{pz}$ (`1651-1656`). |
| 34 | `plastic.rs`, `plastic_3d.rs`, `plastic_limit.rs` | `solve_plastic_2d` (`plastic.rs:592-595`), `solve_plastic_2d_body` (`603-1054`), `split_member` (`294-391`), `released_end_rotations` (`397-458`), `load_moment_scale_2d` (`1108-1127`), `merged_results` (`1139-1176`), `compute_plastic_moment` (`1178-1195`), `plastic_limit::confirm_2d` (`plastic_limit.rs:159-227`), `limit_analysis_2d` (`384-547`) | `solve_plastic_3d` (`plastic_3d.rs:715-717`), `solve_plastic_3d_contained` (`727-1301`), `split_member` (`207-312`), `released_end_rotations` (`318-373`), `merged_results` (`1304-1363`), `compute_plastic_moments_3d` (`1367-1396`), `load_moment_scale_3d` (`1442-1466`) | **Genuinely differ** | Event-driven hinge insertion is duplicated across `plastic.rs` and `plastic_3d.rs`. 2D has exact LP limit-analysis confirmation (`plastic_limit::confirm_2d` called at `plastic.rs:978-986`); 3D has no LP limit analysis and handles biaxial $(M_y, M_z)$ yield surfaces. |
| 35 | `fiber_nonlinear.rs` | `solve_fiber_nonlinear_2d` (`fiber_nonlinear.rs:101-105`), `solve_fiber_nonlinear_2d_contained` (`107-529`), `loads_at_2d` (`532-548`), `fiber_member_forces_2d` (`599-646`), `assemble_fiber_elements` (`714-790`), `assemble_elastic_elements` (`794-878`), `add_springs` (`882-905`), `fiber_reactions_and_equilibrium_2d` (`1688-1734`) | `solve_fiber_nonlinear_3d` (`fiber_nonlinear.rs:945-950`), `solve_fiber_nonlinear_3d_contained` (`952-1364`), `loads_at_3d` (`551-588`), `fiber_member_forces_3d` (`650-708`), `add_springs_3d` (`1368-1383`), `assemble_fiber_elements_3d` (`1389-1475`), `assemble_elastic_elements_3d` (`1479-1549`), `fiber_reactions_and_equilibrium_3d` (`1737-1784`) | **Genuinely differ** | **Divergence in `add_springs`**: 2D `add_springs` (`fiber_nonlinear.rs:882-905`) adds `art` (the artificial rotational stiffness entries from `assemble_2d`) to the tangent matrix; 3D `add_springs_3d` (`1368-1383`) omits `art`. |
| 36 | `cable.rs` | `horizontal_projection_2d` (`cable.rs:184-186`), `ernst_diff_2d` (`208-210`), `cable_slots_2d` (`223-243`), `solve_cable_2d` (`330-335`), `solve_cable_2d_pretensioned` (`342-353`), `solve_cable_2d_inner` (`355-734`) | `horizontal_projection_3d` (`cable.rs:189-191`), `ernst_diff_3d` (`213-215`), `cable_slots_3d` (`245-268`), `solve_cable_3d` (`749-755`), `solve_cable_3d_pretensioned` (`759-771`), `solve_cable_3d_inner` (`773-1158`) | Differ only in DOF count | Same Ernst secant/tangent modulus iteration and tension-only deactivation; `horizontal_projection_2d` is `dx.abs()` (`184-186`) whereas `horizontal_projection_3d` is `dx.hypot(dy)` (`189-191`). |
| 37 | `contact.rs` | `solve_contact_2d` (`contact.rs:742-746`), `solve_contact_2d_contained` (`748-1143`), `solve_uplift_2d` (`662-732`), `contact_corrections_2d` (`546-654`), `gap_relative_2d` (`1146-1151`), `gap_tangential_2d` (`1154-1159`), `gap_normal_force_2d` (`1162-1165`), `n2s_normal_force_2d` (`1168-1178`), `n2s_tangential_2d` (`1182-1190`), `project_slave_onto_segment_2d` (`1588-1627`), `build_diagnostics_2d` (`1649-1714`) | `solve_contact_3d` (`contact.rs:1216-1221`), `solve_contact_3d_contained` (`1223-1579`), `build_diagnostics_3d` (`1717-1767`) | **Genuinely differ** | 2D supports `uplift_supports` (`solve_uplift_2d`, `662-732`) and `NodeToSurface` segment contact (`1588-1627`); 3D explicitly refuses `uplift_supports` (`1225-1231`) and supports only node-to-node gap elements. |
| 38 | `staged.rs` | `parse_staged_2d` (`staged.rs:49-51`), `solve_staged_2d` (`74-84`), `solve_staged_2d_contained` (`86-439`), `assemble_staged_2d` (`444-656`), `assemble_staged_2d_triplets` (`670-892`), `build_results_from_u` (`895-919`), `iterate_cables_staged_2d` (`979-1250`) | `parse_staged_3d` (`staged.rs:55-57`), `solve_staged_3d` (`1263-1273`), `solve_staged_3d_contained` (`1275-1583`), `add_artificial_stiffness_3d` (`1704-1772`), `assemble_staged_3d_triplets` (`1791-1886`), `build_results_from_u_3d` (`1900-1931`) | **Genuinely differ** | **Multiple divergences**: 2D has hand-rolled `assemble_staged_2d` (`444-656`) and `assemble_staged_2d_triplets` (`670-892`) with their own copy of the artificial spring (`586-640`, `833-870`; `#1445`), supports `time_dependent` CEB-FIP creep/shrinkage (`285-351`) and `iterate_cables_staged_2d` (`979-1250`), and silently ignores inclined supports. 3D reuses `assemble_3d` / `assemble_stiffness_sparse_3d_parallel` (`1400, 1798`), refuses inclined supports (`1290-1296`), and omits staged cable iteration and time-dependent creep. |
| 39 | `moving_loads.rs` | `solve_moving_loads_2d` (`moving_loads.rs:84-184`), `moving_loads_at_position_2d` (`189-224`), `build_load_path` (`226-274`), `auto_detect_path` (`276-288`), `diagram_range_2d` (`303-334`), `base_loads` (`336-338`) | `solve_moving_loads_3d` (`moving_loads.rs:391-500`), `moving_loads_at_position_3d` (`524-534`), `moving_loads_at_position_3d_with_maps` (`539-593`), `build_load_path_3d` (`595-642`), `auto_detect_path_3d` (`644-653`), `base_loads_3d` (`667-669`) | **Genuinely differ** | **Two divergences**: (1) 2D evaluates interior span stations (`diagram_range_2d`, `303-334`) so mid-span bending peaks under a moving axle are captured in the envelope; 3D envelopes only member start/end forces (`474-487`). (2) On an inclined deck member, 2D projects vertical axle load $P$ into both transverse $-P\cos\alpha$ and axial $-P\sin\alpha$ (`px: Some(-axle.weight * sin_a)`, `213-219`), whereas 3D `PointOnElement` has no `px` field and drops the axial component $-P\sin\alpha$ (`578-587`)! |
| 40 | `kinematic.rs` | `count_support_restraints_2d` (`kinematic.rs:41-59`), `compute_static_degree_2d` (`64-127`), `analyze_kinematics_2d` (`130-330`), `expected_zero_rotations_2d` (`338-386`), `fast_solvable_2d` (`394-488`), `build_diagnosis_2d` (`841-879`) | `count_support_restraints_3d` (`kinematic.rs:493-521`), `compute_static_degree_3d` (`524-591`), `analyze_kinematics_3d` (`594-827`) | Genuinely differ | 2D has `fast_solvable_2d` (`394-488`) and `expected_zero_rotations_2d` (`338-386`); both use Jacobi-scaled LU rank with `1e-10` threshold (`docs/solver/stability.md:24`). |
| 41 | `prestress.rs` | `tendon_loads_2d` (`prestress.rs:351-360`), `compute_equivalent_loads_2d` (`367-492`), `solve_prestress_2d` (`512-629`) | `tendon_loads_3d` (`prestress.rs:640-649`), `compute_equivalent_loads_3d` (`652-772`), `solve_prestress_3d` (`779-893`) | Differ only in DOF count | Same tendon profile geometry, friction/anchorage losses, and equivalent load generation in 1 plane vs 2 planes. |
| 42 | `load_cases.rs` | `solve_multi_case_2d` (`load_cases.rs:289-413`), `combine_results` (`418-558`), `compute_envelope` (`563-678`), `compute_station_envelopes` (`685-777`), `solve_combinations_by_superposition` (`786-826`) | `solve_multi_case_3d` (`load_cases.rs:835-949`), `combine_results_3d` (`954-1102`), `compute_envelope_3d` (`1107-1231`), `compute_station_envelopes_3d` (`1236-1325`) | Differ only in DOF count | Same linear-combination superposition and station-envelope logic over `AnalysisResults` vs `AnalysisResults3D`. |
| 43 | `winkler.rs` | `WinklerInput` (`winkler.rs:19-28`), `solve_winkler_2d` (`71-190`), `add_foundation_2d` (`193-260`) | `WinklerInput3D` (`winkler.rs:35-44`), `solve_winkler_3d` (`267-379`), `add_foundation_3d` (`382-462`) | Differ only in DOF count | Both use shared `winkler_foundation_matrix` (`46-66`); 3D applies `D K_f D` with `D = diag(1, -1, 1, -1)` on the $z$-bed (`422-437`). |
| 44 | `ssi.rs` | `SsiInput` (`ssi.rs:47-57`), `solve_ssi_2d` (`210-335`) | `SsiInput3D` (`ssi.rs:64-74`), `solve_ssi_3d` (`340-467`) | Truly duplicate | Both call shared `validate_springs` (`122-182`) and `spring_triplets` (`185-207`) and run the same secant iteration. |
| 45 | `imperfections.rs` | `apply_imperfections_2d` (`imperfections.rs:48-174`), `notional_loads_2d` (`179-227`), `solve_with_imperfections_2d` (`232-279`) | `apply_imperfections_3d` (`imperfections.rs:286-412`), `notional_loads_3d` (`417-467`), `solve_with_imperfections_3d` (`472-519`) | Differ only in DOF count | Same nodal coordinate perturbation / notional lateral load generation and P-Delta delegation. |
| 46 | `creep_shrinkage.rs` | `solve_creep_shrinkage_2d` (`creep_shrinkage.rs:235-380`) | `solve_creep_shrinkage_3d` (`creep_shrinkage.rs:385-535`) | Truly duplicate | Both use the same CEB-FIP 1990 / ACI 209 time-step loop, scaling `E` by $1/(1+\phi)$ and injecting shrinkage as equivalent uniform thermal contraction. |
| 47 | `reduction.rs` | `guyan_reduce_2d` (`reduction.rs:58-152`), `craig_bampton_2d` (`241-368`), `solve_reduced_modal_2d` (`465-552`) | `guyan_reduce_3d` (`reduction.rs:157-236`), `craig_bampton_3d` (`373-460`), `solve_reduced_modal_3d` (`557-645`) | Truly duplicate | Assemble $(K, M)$ in 2D vs 3D and call the shared matrix condensation / reduced eigensolve helpers. |
| 48 | `dynamic_validation.rs` | `validate_masses_2d` (`dynamic_validation.rs:14-68`), `validate_time_history_config_2d` (`148-192`), `validate_harmonic_config_2d` (`242-275`) | `validate_masses_3d` (`dynamic_validation.rs:70-146`), `validate_time_history_config_3d` (`194-240`), `validate_harmonic_config_3d` (`277-310`) | Differ only in DOF count | 3D also validates `masses.area` (`103-143`) and 6-DOF direction indices. |
| 49 | `feature_gates.rs` | `gate_2d_linear` (`feature_gates.rs:196-206`), `gate_2d_pdelta` (`208-220`), `gate_2d_buckling` (`222-235`), `gate_2d_modal` (`237-249`), `gate_2d_harmonic` (`251-263`), `gate_2d_time_history` (`265-277`), `gate_2d_corotational` (`279-293`), `gate_2d_material_nl` (`295-309`), `gate_2d_fiber_nl` (`311-325`), `gate_2d_plastic` (`327-341`), `gate_2d_cable` (`343-355`), `gate_2d_contact` (`357-369`), `gate_2d_staged` (`371-383`), `gate_2d_moving_loads` (`385-397`), `gate_2d_winkler` (`399-411`), `gate_2d_ssi` (`413-425`), `gate_2d_prestress` (`427-439`), `gate_2d_creep` (`441-453`), `gate_2d_imperfections` (`455-467`), `gate_2d_arc_length` (`469-483`), `gate_2d_disp_control` (`485-499`), `gate_2d_reduction` (`501-513`), `gate_2d_multi_case` (`515-527`), `scan_2d` (`66-125`) | `gate_3d_linear` (`feature_gates.rs:533-543`), `gate_3d_pdelta` (`545-557`), `gate_3d_buckling` (`559-572`), `gate_3d_modal` (`574-586`), `gate_3d_harmonic` (`588-600`), `gate_3d_time_history` (`602-614`), `gate_3d_corotational` (`616-630`), `gate_3d_material_nl` (`632-646`), `gate_3d_fiber_nl` (`648-662`), `gate_3d_plastic` (`664-678`), `gate_3d_cable` (`680-692`), `gate_3d_contact` (`694-706`), `gate_3d_staged` (`708-720`), `gate_3d_moving_loads` (`722-734`), `gate_3d_winkler` (`736-748`), `gate_3d_ssi` (`750-762`), `gate_3d_prestress` (`764-776`), `gate_3d_creep` (`778-790`), `gate_3d_imperfections` (`792-804`), `gate_3d_reduction` (`806-818`), `gate_3d_multi_case` (`820-832`), `scan_3d` (`127-190`) | Genuinely differ | Both populate a shared `Features` struct (`feature_gates.rs:14-64`) and check per-analysis capability flags; 2D has `gate_2d_arc_length` and `gate_2d_disp_control` (no 3D arc-length solver). |
| 50 | `pre_solve_gates.rs` | `check_linear_2d` (`pre_solve_gates.rs:41-84`), `check_pdelta_2d` (`144-164`), `check_buckling_2d` (`191-212`), `check_modal_2d` (`242-261`), `check_time_history_2d` (`288-314`), `check_harmonic_2d` (`345-367`), `check_corotational_2d` (`395-417`), `check_material_nl_2d` (`445-467`), `check_plastic_2d` (`495-525`), `check_fiber_nl_2d` (`556-578`), `check_cable_2d` (`606-626`), `check_contact_2d` (`654-674`), `check_staged_2d` (`702-722`), `check_moving_loads_2d` (`750-770`), `check_winkler_2d` (`798-818`), `check_ssi_2d` (`846-866`), `check_prestress_2d` (`894-914`), `check_creep_2d` (`942-962`), `check_imperfections_2d` (`990-1010`), `check_reduction_2d` (`1038-1058`), `check_rigid_body_restraint_2d` (`1178-1290`) | `check_linear_3d` (`pre_solve_gates.rs:86-142`), `check_pdelta_3d` (`166-189`), `check_buckling_3d` (`214-240`), `check_modal_3d` (`263-286`), `check_time_history_3d` (`316-343`), `check_harmonic_3d` (`369-393`), `check_corotational_3d` (`419-443`), `check_material_nl_3d` (`469-493`), `check_plastic_3d` (`527-554`), `check_fiber_nl_3d` (`580-604`), `check_cable_3d` (`628-652`), `check_contact_3d` (`676-700`), `check_staged_3d` (`724-748`), `check_moving_loads_3d` (`772-796`), `check_winkler_3d` (`820-844`), `check_ssi_3d` (`868-892`), `check_prestress_3d` (`916-940`), `check_creep_3d` (`964-988`), `check_imperfections_3d` (`1012-1036`), `check_reduction_3d` (`1060-1084`), `check_rigid_body_restraint_3d` (`1292-1425`) | Genuinely differ | 3D also checks shell/plate mesh distortion (`check_shell_distortion_3d`, `1086-1176`); `check_rigid_body_restraint_2d` checks 3 planar rigid-body modes vs 6 spatial rigid-body modes in `check_rigid_body_restraint_3d`. |
| 51 | `self_checks.rs` | `check_static_2d` (`self_checks.rs:34-95`), `check_pdelta_2d` (`165-210`), `check_modal_2d` (`265-320`), `check_buckling_2d` (`385-435`), `check_harmonic_2d` (`495-545`), `check_time_history_2d` (`605-660`) | `check_static_3d` (`self_checks.rs:97-163`), `check_pdelta_3d` (`212-263`), `check_modal_3d` (`322-383`), `check_buckling_3d` (`437-493`), `check_harmonic_3d` (`547-603`), `check_time_history_3d` (`662-720`) | Differ only in DOF count | Post-solve equilibrium, Betti reciprocity, Rayleigh quotient, and modal orthogonality self-checks. |
| 52 | `arc_length.rs` | `solve_arc_length` (`arc_length.rs:117-382`), `solve_displacement_control` (`389-540`) | *(none)* | Genuinely differ (2D-only) | Crisfield cylindrical arc-length and displacement-control continuation exist only for 2D `SolverInput`. |

---

## 2. Option A vs Option B

### 2.1 Option A: 2D as a 3D Model on $z = 0$ with $u_z, r_x, r_y$ Restrained

In Option A, every 2D analysis entry point translates `SolverInput` into `SolverInput3D` on the
plane $z = 0$ (the global $X$–$Y$ plane, `Plane::XY` in `engine/src/metamorphic/planes.rs:27, 115-244`),
restrains the out-of-plane DOFs $(u_z, r_x, r_y)$ (`rz = true, rrx = true, rry = true`) at every node,
runs the 3D solver, and projects `AnalysisResults3D` back to `AnalysisResults` (`pull_static` in
`engine/src/metamorphic/planes.rs:262-311`).

#### Why $z = 0$ (`Plane::XY`) Is Cleaner Than $y = 0$ (`Plane::XZ`)

Although Stabileo's documentation describes a 2D model as living in the global $X$–$Z$ plane
(`docs/solver/frames.md:50`, `docs/solver/assembly-constraints.md:65`), embedding on $z = 0$
(`Plane::XY`) has three algebraic advantages over $y = 0$ (`Plane::XZ`):

1. **Right-handed in-plane rotation without sign flips**: On $z = 0$, the 2D coordinates $(x, z_{2D})$
   map to $(X, Y, 0)_{3D}$, so $e_1 \times e_2 = e_X \times e_Y = +e_Z$ (`metamorphic/planes.rs:320`).
   Consequently $(u_x, u_z, \theta)_{2D} = (u_X, u_Y, r_Z)_{3D}$ and $(F_x, F_z, M)_{2D} = (F_X, F_Y, M_Z)_{3D}$
   with **no sign negation** (unlike $y = 0$, where $e_X \times e_Z = -e_Y$ forces $\theta_{2D} = -r_Y^{3D}$ and
   $M_{2D} = -M_Y^{3D}$, which caused bug `AC-15` in `web/src/lib/engine/solver-service.ts`).
2. **No vertical-column local-axis switch**: In `compute_local_axes_3d` (`engine/src/element/transform.rs:198-208`),
   `default_ey_ref` switches the reference axis from $+Z$ to $+X$ when $|e_{x,Z}| > 0.999$. For any
   member lying in $z = 0$, $e_{x,Z} = 0$ identically for **all** member orientations $\alpha \in (-\pi, \pi]$
   (horizontal, inclined, or vertical in the 2D frame). Thus `default_ey_ref` always picks $+Z$, giving
   $e_z^{3D} = (0, 0, 1)$ and $e_y^{3D} = e_z^{3D} \times e_x = (-\sin\alpha, \cos\alpha, 0) = e_y^{2D}$
   (`element/transform.rs:14-15`).
3. **Direct 1-to-1 section and internal-force mapping**: Because $e_z^{3D} = +Z$ and $e_y^{3D} = e_y^{2D}$
   for every member on $z = 0$, 2D in-plane bending is always bending in the local $x$–$y$ plane about
   local $+z$:
   - `iz_3d = iz_2d`, `as_z_3d = as_y_2d`, `release_mz_start = hinge_start`, `release_mz_end = hinge_end`;
   - `(N, V, M)_{2D} = (N, V_y, M_z)_{3D}` with **identical signs** (`element/frame.rs:273-276`, $s = +1$).

#### What Changes Under Option A

To make Option A a complete replacement for the 2D solver (rather than only a test oracle on the subset supported by `metamorphic/planes.rs:115-244`), the embedding and 3D solver must be extended to cover eight gaps where `embed_2d` currently returns `unrep` or where 3D lacks a 2D capability:

1. **Support-plus-spring semantics (`#1636`–`#1646`, `dof.rs:134-143` vs `244-259`)**: A 2D rigid support type with `kx/ky/kz` on a restrained DOF keeps that DOF restrained in 2D, whereas `DofNumbering::build_3d` frees any flagged DOF with a positive spring. Option A must either strip spring stiffnesses on restrained 2D DOFs during embedding (preserving 2D behaviour) or unify the rule first (§5, PR 1).
2. **Rotated 2D springs (`assembly.rs:3465-3502`)**: 2D allows `angle != 0` on `"spring"` supports; `SolverSupport3D` has no spring rotation angle (must either add 3D rotated spring support or emit a 2D-compatible `ConnectorElement` to ground).
3. **Inclined rollers (`dof.rs:254`, `assembly.rs:424-428`)**: 2D `"inclinedRoller"` with `angle` $\theta$ has normal $(\sin\theta, \cos\theta)$ in the 2D plane; on $z = 0$ this maps to `is_inclined: Some(true)` with `(normal_x, normal_y, normal_z) = (sin θ, cos θ, 0.0)`.
4. **Point loads with axial force `px` or concentrated moment `my` (`types/input.rs:125-137`, `moving_loads.rs:213-219`)**: `SolverPointLoad3D` (`types/input.rs:696-705`) must gain `px: Option<f64>` and `mz: Option<f64>` / `my: Option<f64>`, wired into `fef.rs` (`fef_point_load_3d`), `assembly.rs`, and `diagrams_3d.rs`.
5. **Constraints and connectors on $z = 0$ (`metamorphic/planes.rs:116-121`)**: `Constraint` DOF indices in `EqualDOF`, `MasterSlave`, and `LinearMPC` must be remapped from 2D local slots `(0, 1, 2)` to $z = 0$ 3D local slots `(0, 1, 5)`, `Diaphragm` plane set to `"XY"`, `RigidLink` empty `dofs: []` expanded to `[0, 1, 5]` (matching 2D's tied rotation, `constraints.rs:140`), and `ConnectorElement` rotated into the $X$–$Y$ plane.
6. **2D-only analyses and features**:
   - `arc_length.rs` (`solve_arc_length`, `solve_displacement_control`): must be ported to 3D or kept on a generic reduced system.
   - `plastic_limit.rs` (`confirm_2d`, `limit_analysis_2d`): LP limit-analysis confirmation is 2D-only (`plastic.rs:978-986`).
   - `contact.rs`: `solve_uplift_2d` (`662-732`) and `NodeToSurface` (`1588-1627`) are 2D-only (`solve_contact_3d` refuses `uplift_supports` at `1225-1231`).
   - `staged.rs`: `time_dependent` creep/shrinkage and `iterate_cables_staged_2d` (`979-1250`) are 2D-only (`solve_staged_3d` also refuses inclined supports at `1290-1296`).
   - `moving_loads.rs`: interior span envelope evaluation (`diagram_range_2d`, `303-334`) is 2D-only.

#### What Results Would Change Under Option A

- **Well-conditioned linear, modal, P-Delta, and buckling models**: For models with $\kappa(K)$ moderate, the active free submatrix $K_{ff}$ on $z = 0$ is **mathematically identical** to the 2D $K_{ff}$ (because all out-of-plane DOFs $u_z, r_x, r_y$ are restrained and eliminated from $K_{ff}$; see §3). However, element transformation $T^{\mathsf T} k T$ in 3D multiplies $12\times 12$ matrices instead of $6\times 6$, and `max_diag_k` (`assembly.rs:1532-1536`) scans all $6N$ DOFs (including restrained out-of-plane diagonals $EA/L$, $GJ/L$, $4EI_y/L$), which can change:
  - floating-point rounding by $\mathcal{O}(\kappa(K)\varepsilon)$ (up to $6.76\times 10^{-14}$ relative on the fixture corpus; see §2.3);
  - `k_art = 1e-10 * max_diag_k` if an out-of-plane rotational or torsional diagonal exceeds the in-plane translational diagonal;
  - sparse Cholesky pivot / AMD ordering when constrained or near-singular;
  - near-singular linear solves where 3D sparse runs the shift ladder (`linear.rs:2430-2530`) while 2D sparse falls back to dense LU (`linear.rs:830-947`) — until both are replaced by the unified `stability::analyze` verdict (§5).

#### Performance Cost of Option A (Theoretical and Measured)

Even when $u_z, r_x, r_y$ are restrained so the free system size $n_f$ is unchanged ($3$ free DOFs per unrestrained frame node, $2$ per truss node), Option A pays an unavoidable per-solve overhead in **assembly, numbering, and post-processing**:

- Total DOFs per node double from $3 \to 6$ (or $2 \to 6$ for truss-only models if embedded as frames, $2 \to 3$ if truss-only), so $K_{rr}$ and $K_{fr}$ have $2\times$ to $3\times$ the dimension.
- Frame element local stiffness and coordinate transformation $T^{\mathsf T} k T$ operate on $12\times 12$ ($1{,}728$ multiply-adds) instead of $6\times 6$ ($216$ multiply-adds) — an $8\times$ increase in element-level dense matrix products.
- Translating `SolverInput` $\to$ `SolverInput3D` and `AnalysisResults3D` $\to$ `AnalysisResults` allocates intermediate `HashMap`s and `Vec`s on every call.

### 2.2 Measured Option A Benchmark on `engine/tests/fixtures/`

A throwaway test in `engine/tests/derivation_assembly_constraints.rs` (run via `make test.engine.targeted TEST=derivations FILTER=measure_option_a_fixtures`, 20 repetitions per fixture with `std::hint::black_box`, then reverted) solved all **82 2D fixture models** in `engine/tests/fixtures/*-input.json` (all 32 named `ex-*` / `cantilever` / `portal-*` / `ss-beam` fixtures plus `random-1..50-input.json`) both natively with `solve_2d` and embedded on $z = 0$ via `metamorphic::planes::embed_2d(&input, Plane::XY)` + `solve_3d` + `pull_static`:

| Metric | Value | Notes |
|---|---|---|
| 2D fixtures tested in `engine/tests/fixtures/` | **82 / 82** | 0 unrepresentable fixtures, 0 solve failures |
| Bitwise-identical fixtures (`rel_u = rel_r = rel_f = 0`) | **69 / 82** (84.1%) | Axis-aligned beams, portals, and frames where $T$ is a signed permutation |
| Total wall time: native `solve_2d` (82 fixtures, mean of 20 reps) | **39.54 ms** | $482\,\mu\text{s}$ mean per fixture |
| Total wall time: embedded `solve_3d` only | **74.26 ms** | **$1.88\times$** native `solve_2d` ($906\,\mu\text{s}$ mean per fixture) |
| Total wall time: `embed_2d` + `solve_3d` + `pull_static` | **76.20 ms** | **$1.93\times$** native `solve_2d` ($929\,\mu\text{s}$ mean per fixture) |
| Per-fixture time ratio (`solve_3d / solve_2d`) range | **$1.75\times$ – $2.11\times$** | Min: `random-27-input.json` ($n=2, e=1$, $352.5\,\mu\text{s} \to 616.0\,\mu\text{s}$, $1.75\times$); Max: `ex-color-map-demo-input.json` ($n=12, e=14$, $2254.0\,\mu\text{s} \to 4750.4\,\mu\text{s}$, $2.11\times$) |
| Max displacement difference $\max |u_{2D} - u_{3D}|$ | **$1.531\times 10^{-16}\text{ m/rad}$** (rel **$6.757\times 10^{-14}$**) | On `ex-color-map-demo-input.json` ($n=12, e=14$) |
| Max reaction difference $\max |R_{2D} - R_{3D}|$ | **$1.009\times 10^{-12}\text{ kN/kN}\cdot\text{m}$** (rel **$5.461\times 10^{-15}$**) | On `ex-color-map-demo-input.json` |
| Max element-force difference $\max |f_{2D} - f_{3D}|$ | **$1.290\times 10^{-12}\text{ kN/kN}\cdot\text{m}$** (rel **$6.980\times 10^{-15}$**) | On `ex-color-map-demo-input.json` |
| Max stray out-of-plane translation / rotation / force / moment | **$0.0$** | All out-of-plane components identically zero |

Representative per-fixture rows from the benchmark run:

| Fixture | Nodes | Elements | `solve_2d` ($\mu$s) | `solve_3d` ($\mu$s) | Ratio | Max Rel Diff ($u / R / f$) |
|---|---|---|---|---|---|---|
| `cantilever-input.json` | 2 | 1 | 283.4 | 510.3 | $1.80\times$ | `0.00e0 / 0.00e0 / 0.00e0` |
| `ex-portal-frame-input.json` | 4 | 3 | 602.7 | 1134.4 | $1.88\times$ | `0.00e0 / 0.00e0 / 0.00e0` |
| `ex-building-3story-dlw-case1-input.json` | 8 | 9 | 1503.1 | 2934.1 | $1.95\times$ | `0.00e0 / 0.00e0 / 0.00e0` |
| `ex-three-hinge-arch-input.json` | 9 | 8 | 1200.0 | 2337.9 | $1.95\times$ | `6.10e-16 / 2.03e-16 / 3.30e-16` |
| `ex-truss-input.json` | 8 | 13 | 308.7 | 620.7 | $2.01\times$ | `1.27e-15 / 3.25e-15 / 2.27e-15` |
| `ex-warren-truss-input.json` | 9 | 15 | 340.8 | 685.7 | $2.01\times$ | `2.32e-15 / 2.84e-15 / 3.00e-15` |
| `ex-howe-truss-input.json` | 10 | 17 | 373.3 | 762.3 | $2.04\times$ | `0.00e0 / 0.00e0 / 0.00e0` |
| `ex-color-map-demo-input.json` | 12 | 14 | 2254.0 | 4750.4 | $2.11\times$ | `6.76e-14 / 5.46e-15 / 6.98e-15` |

### 2.3 Option B: One Dimension-Generic Pipeline (`Dim` Trait)

In Option B, the solver pipeline — DOF numbering, sparse/dense assembly, inclined-support rotation,
multi-point constraint reduction, scale-invariant stability verdict, linear factorization, reaction
recovery, equilibrium summary, and P-Delta / buckling / modal / harmonic / time-history / nonlinear
stepping — is written **once**, generic over a dimension trait `Dim` (extending the pattern already
established in `InclinedFrame<const D: usize>` at `engine/src/solver/assembly.rs:2396-2484` and
`PDeltaOps` at `engine/src/solver/pdelta.rs:117-217`):

```rust
pub trait Dim: Copy + Sync + 'static {
    const SPATIAL: usize;
    const ROTATIONAL: usize;
    const MAX_DPN: usize;
    type NodeCoords: Copy;
    type Inclined: InclinedFrame<{ Self::SPATIAL }>;
}
```

#### What Changes Under Option B

1. **Unified support representation (`SolverSupport<D>` / normalized per-DOF restraint + spring)**:
   A 2D support type string (`"fixed"`, `"pinned"`, `"rollerX"`, etc.) is lowered once at the
   input boundary into explicit per-DOF restraint flags `[bool; D::MAX_DPN]`, spring stiffnesses
   `[Option<f64>; D::MAX_DPN]`, settlements `[Option<f64>; D::MAX_DPN]`, and optional inclined/spring
   frame. `DofNumbering::build<D>` (`dof.rs`) is written once, making it structurally impossible for
   2D and 3D support+spring rules to diverge.
2. **2D frame element matrices derived from the shared 1-plane building blocks (or submatrix extraction)**:
   As proven in §3, the 2D $6\times 6$ local stiffness, FEF, geometric stiffness, and consistent mass
   matrices are the **exact restriction** of the 3D $12\times 12$ matrices to indices `[0, 1, 5, 6, 7, 11]`
   (calling `add_bending_block` with $s = +1$ in `element/frame.rs:268-334` and `add_plane_kg` with
   $s = +1$ in `solver/geometric_stiffness.rs:146-226`).
3. **One pipeline per analysis**:
   - `stability::analyze_constrained` (`stability.rs:164-247`) is called once by the generic linear,
     P-Delta, buckling, modal, and nonlinear entry points.
   - `PreparedStatic<D>` (`linear.rs`), `solve_constrained<D>` (`constraints.rs`), `solve_pdelta<D>` (`pdelta.rs`),
     `solve_buckling<D>` (`buckling.rs`), `solve_modal<D>` (`modal.rs`), `solve_harmonic<D>` (`harmonic.rs`),
     `solve_time_history<D>` (`time_integration.rs`), `solve_staged<D>` (`staged.rs`), and
     `solve_moving_loads<D>` (`moving_loads.rs`) each collapse from two implementations into one.
   - Dimension-specific element families (3D shells/plates/curved beams) are assembled via a trait hook
     that is a no-op for `D2`.

#### What Results Would Change Under Option B

- **Zero floating-point drift on existing 2D models**: Because `D2` still assembles $6\times 6$
  frame matrices and $4\times 4$ truss matrices over $2$ or $3$ DOFs per node in the same order,
  every 2D model that does not hit an intentional bug fix (such as `#1636`–`#1646`, `#1445`, or
  the `stability.rs` refusal of Singular/Mechanism models) remains **bitwise identical** to today's
  `solve_2d`.
- **Intentional soundness changes (each gated by its own PR and results version)**:
  1. Unifying the support+spring rule (`#1636`–`#1646`) and settlement-on-free-DOF refusal (`AC-10`).
  2. Calling `stability::analyze_constrained` (`stability.rs:164-247`) at every solver entry to replace
     artificial rotational springs and the 3D shift ladder / 2D LU fallback (`#762`, `#1445`, `#1496`).
  3. Unifying `moving_loads`, `staged`, `fiber_nonlinear`, and `constraints` (`AC-3`, `AC-5`) parity gaps.

#### Performance Cost of Option B

- **$1.00\times$ (zero runtime overhead)** for both 2D and 3D: Rust monomorphizes `Dim` over `D2`
  and `D3`, keeping 2D at $3$ DOFs/node ($6\times 6$ element matrices) instead of paying Option A's
  $1.88\times$–$2.11\times$ slowdown.

### 2.4 Summary Comparison: Option A vs Option B

| Criterion | Option A (Embed 2D in 3D on $z = 0$) | Option B (Generic `Dim` Pipeline + Shared Kernels) |
|---|---|---|
| Runtime cost on 2D solves | **$1.88\times$–$2.11\times$ slower** (`76.20 ms` vs `39.54 ms` on 82 fixtures) | **$1.00\times$** (native $3$-DOF/node assembly and solve) |
| Bitwise preservation of valid 2D results | 69/82 fixtures bitwise identical; 13/82 drift by up to $6.76\times 10^{-14}$ relative | **82/82 fixtures bitwise identical** (outside intentional bug-fix PRs) |
| Eliminates duplicate solver pipeline code (Cause E) | Yes, after porting 2D-only features (`arc_length`, `plastic_limit`, `uplift`, staged creep/cables, moving-load interior stations) to 3D | Yes, directly; 2D-only and 3D-only element/analysis hooks plug into the same generic pipeline |
| Eliminates plane/axis sign traps (Cause D) | Requires translating constraints/connectors/loads to $z = 0$ and back | Yes; 2D and 3D share one `Dim`-parameterized pipeline, verified by the $z = 0$ / $y = 0$ embedding gate |

---

## 3. Does the Condensed 3D Frame Element Reproduce Today's 2D Frame Element Matrices?

**Yes — identically, with no Schur-complement coupling terms.**
In the 3D local frame, the axial, $x$–$y$ bending, $x$–$z$ bending, and torsional blocks are
mutually orthogonal (zero cross-stiffness, zero cross-mass, and zero cross-geometric-stiffness
entries). Therefore, restraining the 6 out-of-plane DOFs
$(w_1, \theta_{x1}, \theta_{y1}, w_2, \theta_{x2}, \theta_{y2}) = \text{indices } [2, 3, 4, 8, 9, 10]$
(or statically condensing them when unrestrained) is simply **extracting the $6\times 6$ submatrix**
on the 6 in-plane local DOFs:

$$
(u_1, v_1, \theta_{z1}, u_2, v_2, \theta_{z2}) = \text{3D local indices } [0, 1, 5, 6, 7, 11].
$$

With the parameter mapping

$$
I_{z,\text{3D}} = I_{z,\text{2D}}, \qquad A_{s,z,\text{3D}} = A_{s,y,\text{2D}}, \qquad
\texttt{release\_mz\_start} = \texttt{hinge\_start}, \qquad \texttt{release\_mz\_end} = \texttt{hinge\_end},
$$

every 2D frame matrix in the codebase is reproduced entry-by-entry:

### 3.1 Local Elastic Stiffness (`engine/src/element/frame.rs`)

- **2D (`frame_local_stiffness_2d`, `engine/src/element/frame.rs:13-84`)**:
  - Axial stiffness $EA/L$ is placed at $(0,0), (3,3), (0,3), (3,0)$ (`frame.rs:28-32`).
  - Shear parameter $\phi = \dfrac{12 E I_z}{G A_{s,y} L^2}$ with $G = \dfrac{E}{2(1+\nu)}$ when `as_y > 0`, else $0$ (`frame.rs:18-24`).
  - Bending stiffness on DOFs $(v_1, \theta_1, v_2, \theta_2) = [1, 2, 4, 5]$ (`frame.rs:34-81`):
    - **No hinges** (`frame.rs:34-55`):
      $$
      k_b = \frac{E I_z}{(1+\phi)L^3}\begin{bmatrix}
      12 & 6L & -12 & 6L \\
      6L & (4+\phi)L^2 & -6L & (2-\phi)L^2 \\
      -12 & -6L & 12 & -6L \\
      6L & (2-\phi)L^2 & -6L & (4+\phi)L^2
      \end{bmatrix}.
      $$
    - **Start hinge only** (`hinge_start && !hinge_end`, `frame.rs:56-67`): condensed factor $c = \dfrac{12}{4+\phi}$, giving $\pm c\,\dfrac{EI_z}{L^3}$ on shear rows, $c\,\dfrac{EI_z}{L^2}$ on $(v_1,\theta_2)$, $-c\,\dfrac{EI_z}{L^2}$ on $(v_2,\theta_2)$, and $\dfrac{c}{4}\dfrac{EI_z}{L} = \dfrac{3EI_z}{(4+\phi)L}$ on $(\theta_2,\theta_2)$, with row/column $2$ ($\theta_1$) zero.
    - **End hinge only** (`!hinge_start && hinge_end`, `frame.rs:68-79`): same factor $c = \dfrac{12}{4+\phi}$ on $(v_1, v_2, \theta_1)$, with row/column $5$ ($\theta_2$) zero.
    - **Both ends hinged** (`hinge_start && hinge_end`, `frame.rs:80-81`): bending block is all zero.
- **3D (`frame_local_stiffness_3d`, `engine/src/element/frame.rs:163-260`, and `add_bending_block`, `268-334`)**:
  - Axial stiffness $EA/L$ is placed at $(0,0), (6,6), (0,6), (6,0)$ (`frame.rs:212-216`).
  - For $x$–$y$ bending (about local $z$), `frame_local_stiffness_3d` computes $\phi_z = \dfrac{12 E I_z}{G A_{s,z} L^2}$ (`frame.rs:201-206`) and calls `add_bending_block(&mut k, e, iz, l, phi_z, [1, 5, 7, 11], +1.0, release_mz_start, release_mz_end)` (`frame.rs:235-247`).
  - Inside `add_bending_block` (`frame.rs:268-334`) with `s = +1.0` and `dofs = [1, 5, 7, 11]`, every formula for `[false, false]`, `[true, false]`, `[false, true]`, and `[true, true]` is **character-for-character identical** to `frame_local_stiffness_2d` (`frame.rs:34-81`) mapped from `[1, 2, 4, 5]` to `[1, 5, 7, 11]`.
  - No other block in `frame_local_stiffness_3d` touches indices `[0, 1, 5, 6, 7, 11]`: torsion touches `[3, 9]` (`219-231`), and $x$–$z$ bending touches `[2, 4, 8, 10]` (`249-257`).

### 3.2 Coordinate Transformation (`engine/src/element/transform.rs`)

- **Embedded on $z = 0$ (`Plane::XY`)**:
  - For a member from $(x_i, y_i, 0)$ to $(x_j, y_j, 0)$, $e_x = (\cos\alpha, \sin\alpha, 0)$. Since $|e_{x,Z}| = 0 \le 0.999$, `default_ey_ref` (`transform.rs:198-208`) returns $\hat{u} = (0, 0, 1)$, so `orthonormal_frame` (`218-235`) yields $e_z = (0, 0, 1)$ and $e_y = e_z \times e_x = (-\sin\alpha, \cos\alpha, 0)$.
  - Restricted to the active 3D DOFs `[0, 1, 5, 6, 7, 11]`, the $3\times 3$ block $\Lambda = [e_x; e_y; e_z]$ has $\Lambda_{0..2, 0..2} = \begin{bmatrix}\cos\alpha & \sin\alpha \\ -\sin\alpha & \cos\alpha\end{bmatrix}$ and $\Lambda_{2,2} = +1$, which is **identically** `frame_transform_2d` (`transform.rs:9-29`).
- **Embedded on $y = 0$ (`Plane::XZ`)**:
  - For a member from $(x_i, 0, z_i)$ to $(x_j, 0, z_j)$ with $|e_{x,Z}| \le 0.999$, `default_ey_ref` (`transform.rs:198-208`) picks $\hat{u} = (0, 0, 1)$, giving $e_y = (0, -1, 0)$ (out of plane) and $e_z = (-\sin\alpha, 0, \cos\alpha)$ (in plane). Here 2D in-plane bending lands on the 3D $x$–$z$ block (`[2, 4, 8, 10]`, $s = -1$) with $\Lambda_{1,1} = -1$ mapping $\theta_{2D} = -\theta_Y^{3D}$, and near-vertical members ($|e_{x,Z}| > 0.999$) switch reference to $+X$, rotating $(e_y, e_z)$ by $90^\circ$. Setting `iy = iz` and `as_y = as_z` (or passing explicit `local_y = (0, 1, 0)`) makes $T^{\mathsf T} k T$ on the active global DOFs identical after the $\theta_{2D} = -\theta_Y^{3D}$ sign map (`engine/tests/assembly_paths.rs:640-715`).

### 3.3 Equivalent Nodal Loads (`engine/src/element/fef.rs`)

- `place_bending_planes_3d` (`engine/src/element/fef.rs:536-561`) places the 2D 6-DOF vector `y_plane` directly onto 3D indices `[0, 1, 5, 6, 7, 11]` with **no sign change** (`f[0] = y_plane[0], f[1] = y_plane[1], f[5] = y_plane[2], f[6] = y_plane[3], f[7] = y_plane[4], f[11] = y_plane[5]`).
- `adjust_fef_for_hinges_3d` (`fef.rs:564-652`) extracts `[f[0], f[1], f[5], f[6], f[7], f[11]]`, calls the 2D `adjust_fef_for_hinges` (`323-397`), and writes the result back to `[0, 1, 5, 6, 7, 11]`.
- `fef_thermal_3d` (`fef.rs:464-489`) places `dt_gradient_y` on DOFs `[5, 11]` as `[-m_z, +m_z]` where `m_z = e * iz * alpha * dt_gradient_y / h_y`, which is identical to `fef_thermal_2d` (`288-307`) on DOFs `[2, 5]`.

### 3.4 Geometric Stiffness $K_g$ (`engine/src/solver/geometric_stiffness.rs`)

- Both `frame_kg_local_2d` (`geometric_stiffness.rs:775-787`) and `frame_kg_local_3d` (`233-282`) call the same helper `add_plane_kg` (`146-226`):
  - 2D calls `add_plane_kg(&mut kg, n, l, [1, 2, 4, 5], 1.0, hinge_start, hinge_end)` (`784`);
  - 3D calls `add_plane_kg(&mut kg, n, l, [1, 5, 7, 11], 1.0, release_mz_start, release_mz_end)` (`264-273`).
- Both span-varying geometric stiffness functions `span_axial_geometric_stiffness_2d` (`575-611`) and `frame_kg_span_local_3d` (`395-427`) call the same helper `add_plane_span_kg` (`352-392`).

### 3.5 Consistent Mass Matrix $M$ (`engine/src/solver/mass_matrix.rs`)

- `frame_consistent_mass` (`mass_matrix.rs:126-171`, 2D $6\times 6$) and `frame_consistent_mass_3d` (`906-983`, 3D $12\times 12$) use the exact same $mL/420$ translational-rotational cubic Hermite coefficients (`140, 70` axial at `[0, 3]` vs `[0, 6]`, and `156, 22L, 54, -13L, 4L^2, -3L^2` at `[1, 2, 4, 5]` vs `[1, 5, 7, 11]`).

---

## 4. Exact 2D Conventions in the Engine

Every 2D convention implemented in the Rust engine, cross-referenced by `file:line`:

### 4.1 Global Coordinates and Nodal DOFs

| Quantity | 2D Convention | Code Reference | 3D Counterpart ($y = 0$ XZ Plane) | 3D Counterpart ($z = 0$ XY Plane) |
|---|---|---|---|---|
| Horizontal axis | $+X$ (`node.x`) | `types/input.rs:10` | $+X$ (`node.x`) | $+X$ (`node.x`) |
| Vertical axis | $+Z$ (`node.z`, JSON `"z"` or alias `"y"`, gravity along $-Z$) | `types/input.rs:11-14` | $+Z$ (`node.z`) | $+Y$ (`node.y`) |
| Nodal DOFs (frame model) | $(u_X, u_Z, \theta)$ at local slots `(0, 1, 2)` | `solver/dof.rs:28-31` | $(u_X, u_Z, -\theta_Y)$ on slots `(0, 2, 4)` | $(u_X, u_Y, +\theta_Z)$ on slots `(0, 1, 5)` |
| Positive nodal rotation $\theta$ | Counter-clockwise in the $X$–$Z$ plane (from $+X$ toward $+Z$), i.e. right-hand rotation about $-Y$ | `element/transform.rs:19-28`, `docs/solver/frames.md:52-55` | $\theta_{2D} = -\theta_Y^{3D}$ (`Displacement::ry = -Displacement3D::ry`) | $\theta_{2D} = +\theta_Z^{3D}$ (`Displacement::ry = +Displacement3D::rz`) |
| Positive nodal moment load `my` | Acts in the $+\theta_{2D}$ (counter-clockwise, about $-Y$) direction | `solver/assembly.rs:957-963` | $M_{Y,\text{3D}} = -M_{2D}$ | $M_{Z,\text{3D}} = +M_{2D}$ |
| Positive prescribed rotation `dry` | Imposed on $\theta_{2D}$ (counter-clockwise, about $-Y$) | `solver/linear.rs:677-695` | $d_{ry,\text{3D}} = -d_{ry,\text{2D}}$ | $d_{rz,\text{3D}} = +d_{ry,\text{2D}}$ |
| Positive support reaction `my` | Counter-clockwise moment exerted by support on structure | `solver/linear.rs:3995-4060` | $R_{M_y,\text{3D}} = -R_{M,\text{2D}}$ | $R_{M_z,\text{3D}} = +R_{M,\text{2D}}$ |

### 4.2 Member Local Axes (`engine/src/element/transform.rs:9-29`)

For a 2D element from node $I = (x_i, z_i)$ to node $J = (x_j, z_j)$ with length $L = \sqrt{(x_j - x_i)^2 + (z_j - z_i)^2}$,
$\cos\alpha = (x_j - x_i)/L$, $\sin\alpha = (z_j - z_i)/L$:

- **Local $x$-axis** (along member from $I \to J$):
  $$
  e_x = (\cos\alpha, \sin\alpha).
  $$
- **Local $y$-axis** ($+90^\circ$ counter-clockwise from $e_x$ in the 2D plane; points to $+Z$ when member runs along $+X$):
  $$
  e_y = (-\sin\alpha, \cos\alpha).
  $$
- **Implicit local $z$-axis** (completing the right-handed local triad $e_x \times e_y = e_z$):
  - In the $y = 0$ ($X$–$Z$) embedding, $e_x \times e_y = (\cos\alpha, 0, \sin\alpha) \times (-\sin\alpha, 0, \cos\alpha) = (0, -1, 0) = -Y$.
  - In the $z = 0$ ($X$–$Y$) embedding, $e_x \times e_y = (\cos\alpha, \sin\alpha, 0) \times (-\sin\alpha, \cos\alpha, 0) = (0, 0, +1) = +Z$.
- **Transformation matrix** (`frame_transform_2d`, `transform.rs:9-29`):
  $$
  T_{2D} = \operatorname{diag}(R, 1, R, 1), \qquad
  R = \begin{bmatrix} \cos\alpha & \sin\alpha \\ -\sin\alpha & \cos\alpha \end{bmatrix}, \qquad
  u_\text{local} = T_{2D}\,u_\text{global}.
  $$

### 4.3 Section Properties: Which 3D Axis `iz` and `as_y` Map To

- **`SolverSection::iz`** (`types/input.rs:40`): The 2D second moment of area resists bending in the member's local $x$–$y$ plane (about local $z$).
  - When embedded on $z = 0$ (`Plane::XY`), every member has $e_z^{3D} = +Z$ and $e_y^{3D} = e_y^{2D}$, so `SolverSection::iz` maps strictly to **`SolverSection3D::iz`**.
  - When embedded on $y = 0$ (`Plane::XZ`) with default 3D local axes (`transform.rs:198-208`), a non-vertical member has $e_z^{3D}$ in the $X$–$Z$ plane and $e_y^{3D} = -Y$ out of plane, so in-plane bending is about local $y$ (`SolverSection3D::iy`), whereas a vertical member ($|e_{x,Z}| > 0.999$) switches reference to $+X$ and bends about local $z$ (`SolverSection3D::iz`). Hence `metamorphic/planes.rs:138` and `tests/differential/planar.rs:38` set `iy = iz = c.iz` in 3D embeddings.
- **`SolverSection::as_y`** (`types/input.rs:42`, `element/frame.rs:18-24`):
  - In **2D**, `as_y` is paired with `iz`: $\phi = \dfrac{12 E I_z}{G A_{s,y} L^2}$ (`element/frame.rs:21`), resisting shear along local $y$.
  - In **3D**, `as_z` is paired with `iz` ($\phi_z = \dfrac{12 E I_z}{G A_{s,z} L^2}$ at `element/frame.rs:204`, resisting shear along local $y$), whereas `as_y` is paired with `iy` ($\phi_y = \dfrac{12 E I_y}{G A_{s,y} L^2}$ at `element/frame.rs:196`, resisting shear along local $z$).
  - Therefore, 2D's `as_y` maps to 3D's **`as_z`** on the local $x$–$y$ bending block (and to both `as_y` and `as_z` if `default_ey_ref` is allowed to switch axes in the $X$–$Z$ plane).

### 4.4 Member Loads and Thermal Gradient Signs (`engine/src/element/fef.rs`)

- **Transverse distributed load `q_i, q_j`** (`types/input.rs:113-116`, `fef.rs:62-97`) and **point load `p`** (`types/input.rs:129`, `fef.rs:182-227`): positive in the **local $+y$** direction. Gravity ($-Z$) on a horizontal member running from left to right ($+X$) has $q < 0$.
- **Concentrated member couple `my`** (`types/input.rs:136`, `fef.rs:234-261`): positive counter-clockwise in the local $x$–$y$ plane (about local $+z$).
- **Thermal load `dt_uniform, dt_gradient`** (`types/input.rs:141-148`, `fef.rs:288-307`):
  - $\Delta T_\text{uniform} > 0$ produces axial expansion (equivalent nodal forces $EA\alpha\Delta T\,[-1, +1]$ along local $x$).
  - $\Delta T_\text{gradient} = T(-y) - T(+y)$ (bottom fiber hotter than top fiber when positive) produces equivalent nodal moments $EI_z\kappa_0\,[0, -1, 0, +1]$ on $(\theta_1, \theta_2)$ with $\kappa_0 = \alpha\Delta T_\text{gradient}/h$ (`fef.rs:297-306`).
  - In 3D (`fef.rs:464-489`), `dt_gradient_y` uses the **same** sign convention `[-m_z, +m_z]` on $(\theta_{z1}, \theta_{z2})$, whereas `dt_gradient_z` uses `[+m_y, -m_y]` on $(\theta_{y1}, \theta_{y2})$ (`metamorphic/planes.rs:216-217`: `dt_gradient_y = m.cy * t.dt_gradient`, `dt_gradient_z = -m.cz * t.dt_gradient`).

### 4.5 Internal Force and Diagram Sign Conventions (`linear.rs`, `diagrams.rs`)

From `compute_internal_forces_2d_typed` (`engine/src/solver/linear.rs:5490-5505`) with local nodal force vector $f_\text{local} = k_\text{local}\,T\,u_e - f_\text{fef}^*$:

| Quantity | Start (Node $I$, $x = 0$) | End (Node $J$, $x = L$) | Interior Diagram $x \in [0, L]$ (`postprocess/diagrams.rs:213-295`) | Physical Meaning |
|---|---|---|---|---|
| Axial $N$ | `n_start = -f_local[0]` | `n_end = +f_local[3]` | $N(x) = N_s - \int_0^x q_x(\xi)\,d\xi - \sum_{a < x} P_x$ | **Positive in tension** |
| Shear $V$ | `v_start = +f_local[1]` | `v_end = -f_local[4]` | $V(x) = V_s + \int_0^x q_y(\xi)\,d\xi + \sum_{a < x} P_y$ | Resultant along local $+y$ on the **negative ($-x$) cut face** (upward at left support of a horizontal beam) |
| Moment $M$ | `m_start = +f_local[2]` | `m_end = -f_local[5]` | $M(x) = M_s - V_s x - \int_0^x q_y(\xi)(x-\xi)\,d\xi - \sum_{a < x} P_y(x-a) + \sum_{a < x} M_a$ | Resultant about local $+z$ on the **negative ($-x$) cut face**: $dM/dx = -V(x)$. **Positive $M$ = tension on local $+y$ (top fiber), i.e. hogging**; a gravity-loaded simply supported beam along $+X$ ($q_y = -q < 0$) has $V_s = +qL/2 > 0$ and midspan moment $M(L/2) = -qL^2/8 < 0$ (`docs/solver/frames.md:408-413, 424-431`). |

In 3D (`linear.rs:5770-5785`, `postprocess/diagrams_3d.rs:98-145`):
- `mz_start = +f_local[5]`, `mz_end = -f_local[11]`, and $M_z(x) = M_{z,s} - V_{y,s}x - \dots$ (`diagrams_3d.rs:98-118`) follow the **exact same sign convention** as 2D $M(x)$.
- `my_start = +f_local[4]`, `my_end = -f_local[10]`, and $M_y(x) = M_{y,s} + V_{z,s}x + \dots$ (`diagrams_3d.rs:119-139`) have $+V_{z,s}x$ because $\theta_y = -dw/dx$, so a gravity load along local $-z$ produces $M_y(L/2) = +qL^2/8 > 0$ (opposite in sign to 2D $M$).

---

## 5. Recommended Plan in PR-Sized Steps

We recommend **Option B** (one dimension-generic solver pipeline over `Dim`, with 2D element
matrices sharing the 1-plane building blocks of 3D), guarded from Step 1 by Option A's 2D-in-3D
embedding check in CI. This gives complete code unification without Option A's $1.9\times$ 2D
runtime penalty or floating-point perturbation of existing 2D models.

### Where the Stability Verdict (`engine/src/solver/stability.rs`) Is Written Once

`engine/src/solver/stability.rs` (`docs/solver/stability.md`) is **already** dimension-independent
at its core:
- `stability::analyze(k: &CsMat, tags: &[Tag])` (`stability.rs:255-434`) and
  `stability::analyze_constrained(k_free: &CsMat, free_tags: &[Tag], sys: Option<&FreeConstraintSystem>)`
  (`stability.rs:164-247`) operate purely on a sparse symmetric matrix `CsMat` and a slice of
  `Tag { node: usize, kind: Kind }` (`stability.rs:28-39`).
- Under unification, `DofNumbering<D>` produces `tags(&self) -> Vec<Tag>` directly (replacing the
  `two_d: bool` flag in `stability::tags(dof_num, two_d)` at `stability.rs:79-90`), and the single
  generic static preparation entry point `prepare_static<D>` (as well as the generic P-Delta,
  buckling, modal, plastic, and staged pipelines) calls `stability::analyze_constrained` **once**
  on the un-regularized matrix assembled inside `without_artificial_stiffness` (`assembly.rs:53-68`).
- When the verdict is `Verdict::Mechanism` or `Verdict::Singular`, the solver refuses immediately
  before any factorization (`docs/solver/stability.md:208-215`). When the verdict is
  `Verdict::Stable { free_rotations, .. }`, the free-rotation subspace is deflated via `W'`
  (`docs/solver/stability.md:218-236`), retiring `orphan_rotation_dofs` (`assembly.rs:74-106`),
  `artificial_stiffness_entries` (`assembly.rs:29-51`), the staged-construction spring copies
  (`staged.rs:586-640, 833-870`), the 2D post-solve $> 100\text{ rad}$ check (`linear.rs:1129-1138`),
  and the 3D sparse shift ladder (`linear.rs:2430-2530`) in one place for both dimensions.

### PR-by-PR Sequence

1. **PR 1 — Make "every 2D model equals the same model embedded in 3D" a required CI gate**:
   - Extend `metamorphic::planes::embed_2d` and `pull_static` (`engine/src/metamorphic/planes.rs:115-311`)
     to cover `inclinedRoller` supports, `PointOnElement` loads with `px` and `my` (adding optional
     `px` and `mz`/`my` fields to `SolverPointLoad3D` at `types/input.rs:696-705` and wiring them
     into `fef.rs:450-460`, `assembly.rs:1710-1740`, and `diagrams_3d.rs:98-145`), `Constraint`
     remapping, and `ConnectorElement`.
   - Promote the 2D-vs-3D planar parity check (`Plane::XY` and `Plane::XZ`) across linear static,
     P-Delta, modal, buckling, harmonic, time-history, and multi-case analyses into `make test.engine.gates`
     (`Makefile:234-242`) on the fixture, example, and differential corpora, with an explicit allow-list
     only for the open defects fixed in PRs 2–3.
2. **PR 2 — Unify `DofNumbering` and support/spring/settlement rules (`#1636`–`#1646`, `AC-10`)**:
   - Normalize `SolverSupport` and `SolverSupport3D` into a shared per-DOF restraint/spring/settlement
     descriptor in `engine/src/solver/dof.rs`.
   - Resolve `#1636`–`#1646` and `AC-10` by enforcing one rule across 2D and 3D (refusing or
     interpreting a spring or settlement on a restrained DOF identically in both dimensions, and
     aligning `inclined_restrained_3d` rotational-spring handling at `dof.rs:266-282`), with a
     results-version bump and regression tests for `#1636`–`#1646`.
3. **PR 3 — Unify `Constraint` defaults and plane semantics (`AC-3`, `AC-5`)**:
   - Align `RigidLink` empty `dofs: []` and `Diaphragm` plane rules in `engine/src/solver/constraints.rs:138-235`
     so a 2D constraint and its 3D embedding produce identical kinematics (`engine/tests/derivation_assembly_constraints.rs`).
4. **PR 4 — Share 1-plane frame element kernels between 2D and 3D (`engine/src/element/frame.rs`, `mass_matrix.rs`)**:
   - Refactor `frame_local_stiffness_2d` (`element/frame.rs:13-84`) to call `add_bending_block`
     (`268-334`, $s = +1$, DOFs `[1, 2, 4, 5]`) and `frame_consistent_mass_3d` (`mass_matrix.rs:906-983`)
     to call a shared `add_plane_consistent_mass` helper (mirroring `add_plane_kg` in
     `geometric_stiffness.rs:146-226`). Zero behaviour change; verified by `symbolic_elements.rs`.
5. **PR 5 — Introduce `Dim` (`D2`, `D3`) and unify dense/sparse assembly (`assembly.rs`, `sparse_assembly.rs`, `mass_matrix.rs`, `geometric_stiffness.rs`)**:
   - Generalize `InclinedFrame<const D: usize>` (`assembly.rs:2396-2484`) into the `Dim` trait and
     unify stiffness, load, mass, and $K_g$ assembly so `assemble_sparse<D>`, `assemble_mass<D>`,
     and `emit_geometric_stiffness<D>` are written once.
6. **PR 6 — Wire `stability::analyze_constrained` once into generic `prepare_static<D>` (`stability.rs`, `linear.rs`, `constraints.rs`)**:
   - Unify `PreparedStatic2D` and `PreparedStatic3D` (`linear.rs:464-478, 2067-2083`) and
     `solve_constrained_2d`/`3d` (`constraints.rs:1486-2470`) into `PreparedStatic<D>` and
     `solve_constrained<D>`.
   - Call `stability::analyze_constrained` (`stability.rs:164-247`) at the single `prepare_static<D>`
     entry point (slice 2 of `docs/solver/stability.md:242-245`), removing artificial rotational
     springs, `orphan_rotation_dofs`, the 2D LU fallback, and the 3D shift ladder in one step (`#762`, `#1445`, `#1496`).
7. **PR 7 — Unify P-Delta, buckling, modal, spectral, harmonic, time-history, reduction, and multi-case over `Dim`**:
   - Collapse `BucklingSystem2D`/`3D` (`buckling.rs`), `solve_modal_2d`/`3d` (`modal.rs`),
     `solve_spectral_2d`/`3d` (`spectral.rs`), `solve_harmonic_2d`/`3d` (`harmonic.rs`),
     `solve_time_history_2d`/`3d` (`time_integration.rs`), `reduction.rs`, and `load_cases.rs` into
     single `Dim`-generic implementations, calling `stability::analyze_constrained` on the stiffness
     side of the eigen/dynamic pencils (slice 4 of `docs/solver/stability.md:248-249`).
8. **PR 8 — Unify nonlinear, staged, contact, prestress, creep, Winkler, SSI, and moving-loads solvers**:
   - Collapse `material_nonlinear.rs`, `fiber_nonlinear.rs` (fixing the missing `art` / free-rotation
     handling in 3D at `1368-1383`), `cable.rs`, `contact.rs`, `staged.rs` (retiring its duplicate
     assembler `assemble_staged_2d` at `444-892` and bringing staged cable iteration and creep to 3D),
     `moving_loads.rs` (bringing interior station evaluation `diagram_range_2d` at `303-334` and
     inclined-member axial load projection at `213-219` to 3D), `winkler.rs`, `ssi.rs`,
     `prestress.rs`, `creep_shrinkage.rs`, and `imperfections.rs` onto `Dim`.
