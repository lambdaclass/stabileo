# Shell and plate elements

This file covers the five surface elements: the DKT+CST triangle, the flat MITC4 quadrilateral,
the flat 9-node "MITC9" quadrilateral, the degenerated-continuum curved shell (4 nodes) and the
8-node solid shell. For each it gives the formulation the code implements, the conventions, the
mass, geometric stiffness, equivalent loads and stress recovery, and where the code departs from
the textbook. Assembly, DOF numbering and constraints are in
[assembly-constraints.md](assembly-constraints.md). The modal, buckling and P-Delta drivers that
consume shell mass and $K_G$ are in [mass-geometric-dynamics.md](mass-geometric-dynamics.md).
Frame conventions (Z-up, right-handed rotations) are in [frames.md](frames.md#2-coordinate-systems-and-dofs).

| Kernel | Source |
|---|---|
| DKT+CST triangle | `engine/src/element/plate.rs`: `local_axes`, `cst_b_matrix`, `cst_stiffness`, `dkt_b_matrix`, `dkt_stiffness`, `plate_local_stiffness`, `plate_transform_3d`, `plate_pressure_load`, `plate_thermal_load`, `plate_consistent_mass`, `plate_stress_recovery`, `plate_stress_at_nodes(_thermal)`, `plate_geometric_stiffness`, `plate_shear_stiffness_dkmt`, `plate_local_stiffness_thick` |
| MITC4 | `engine/src/element/quad.rs`: `quad_local_axes`, `warp_offsets`, `warp_correct_*`, `shear_b_nat`, `mitc4_local_stiffness`, `quad_transform_3d`, `quad_consistent_mass`, `quad_geometric_stiffness`, `quad_stresses`, `quad_transverse_shear(_at)`, `quad_stress_at_nodes`, `quad_nodal_von_mises`, `quad_pressure_load`, `quad_thermal_load`, `quad_self_weight_load`, `quad_edge_load` |
| MITC9 | `engine/src/element/quad9.rs`: `shape_functions_9`, `quad9_local_axes`, `shear_b_nat_9`, `mitc9_local_stiffness`, `quad9_transform_3d`, `quad9_consistent_mass`, `quad9_geometric_stiffness`, `quad9_stresses`, `quad9_stress_at_nodes`, `quad9_*_load` |
| Curved shell | `engine/src/element/curved_shell.rs`: `compute_element_directors`, `covariant_basis`, `local_frame`, `build_b_matrix_at_point`, `shear_b_covariant`, `ans_shear_to_local`, `drilling_row`, `curved_shell_stiffness(_impl/_no_ans/_covariant)`, `curved_shell_consistent_mass`, `curved_shell_geometric_stiffness`, `curved_shell_stresses`, `curved_shell_*_load` |
| Solid shell | `engine/src/element/solid_shell.rs`: `covariant_b_matrix`, `covariant_to_cartesian`, `compute_ans_tying`, `apply_ans`, `solid_shell_stiffness`, `solid_shell_consistent_mass`, `solid_shell_geometric_stiffness`, `solid_shell_stresses`, `solid_shell_*_load` |
| Assembly of K, loads | `engine/src/solver/assembly.rs` (`assemble_stiffness_3d`, element-load loop), `sparse_assembly.rs` |
| Mass | `engine/src/solver/mass_matrix.rs`: `assemble_mass_matrix_3d(_sparse_impl)` |
| Geometric stiffness | `engine/src/solver/geometric_stiffness.rs`: `add_{plate,quad,quad9,solid_shell,curved_shell}_geometric_stiffness_3d`, `shell_thermal` |
| Stress recovery | `engine/src/solver/linear.rs`: `compute_plate_stresses`, `compute_quad_stresses`, `compute_quad_nodal_stresses` |

## 1. Common conventions

- Units: lengths m, forces kN. `E` is in MPa and multiplied by 1000 in assembly. All shells are
  **isotropic, linear elastic, homogeneous through the thickness**. There is no orthotropic,
  layered or offset-midsurface option; $G=E/(2(1+\nu))$.
- DOFs per node: $(u_X,u_Y,u_Z,\theta_X,\theta_Y,\theta_Z)$, right-handed rotation vectors
  (the solid shell has translations only).
- **Flat elements** (DKT, MITC4, MITC9) are formulated in a local frame $(e_x,e_y,e_z)$ and
  rotated with the block-diagonal $T$ whose 3×3 blocks have rows $e_x,e_y,e_z$
  ($\mathbf u_\ell=T\mathbf u_g$, $K_g=T^{\mathsf T}K_\ell T$, $\mathbf f_g=T^{\mathsf T}\mathbf f_\ell$).
  Translations and rotations use the same rotation, so the local rotation about $e_z$ is the
  drilling rotation.
- Local bending kinematics (all flat elements): $u=z\,\theta_y$, $v=-z\,\theta_x$, so for a
  Kirchhoff plate $\theta_x=w_{,y}$ and $\theta_y=-w_{,x}$.
- **Engineering curvature** (MITC4/MITC9, and the public output of all elements):
  $$\boldsymbol\kappa=\begin{bmatrix}-\theta_{y,x}\\ \theta_{x,y}\\ \theta_{x,x}-\theta_{y,y}\end{bmatrix}
  \overset{\text{Kirchhoff}}{=}\begin{bmatrix}w_{,xx}\\w_{,yy}\\2w_{,xy}\end{bmatrix},\qquad
  \mathbf m = D_b\boldsymbol\kappa,\quad D_b=\frac{Et^3}{12(1-\nu^2)}\begin{bmatrix}1&\nu&0\\\nu&1&0\\0&0&\tfrac{1-\nu}{2}\end{bmatrix}.$$
  Moments are therefore **sagging-positive** (tension on the $-z$ face for $m_x>0$). Fibre stress
  $\sigma(z)=\sigma_m - 12\,m\,z/t^3$: top $\sigma_m-6m/t^2$, bottom $\sigma_m+6m/t^2$.
  Pinned by `shell_stress_conventions.rs`.
- Membrane: plane stress $D_m=\frac{Et}{1-\nu^2}[\ldots]$ (same pattern), $\mathbf n=D_m\boldsymbol\varepsilon$.
  Reported $\sigma_{xx},\sigma_{yy},\tau_{xy}$ are mid-surface stresses $n/t$.
- Transverse shear (Mindlin elements): $\gamma_{xz}=w_{,x}+\theta_y$, $\gamma_{yz}=w_{,y}-\theta_x$,
  $\mathbf q=\kappa_s G t\,\boldsymbol\gamma$ with $\kappa_s=5/6$ hard-coded. $Q_x$ is the force per unit
  length along $+z$ on a face with outward normal $+x$.
- Thermal input (`SolverPlateThermalLoad`): `dt_uniform` $\Delta T_u$, `dt_gradient`
  $\Delta T_g=T(+z\text{ face})-T(-z\text{ face})$, optional `alpha` (default $1.2\times10^{-5}$).
  Free strains $\varepsilon_{th}=\alpha\Delta T_u$ (isotropic), free engineering curvature
  $\kappa_{th}=-\alpha\Delta T_g/t$ (a hotter top curls the plate top-convex).
  $N_T=E t\alpha\Delta T_u/(1-\nu)$, $M_T=Et^2\alpha\Delta T_g/(12(1-\nu))$.
- **Drilling stabilisation** (all flat elements and the curved shell) is the Hughes–Brezzi
  penalty against the membrane's own rotation, never against $\theta_z$ alone:
  $$\Pi_d=\tfrac12\gamma\int_A(\theta_z-\omega)^2\,dA,\qquad \omega=\tfrac12(v_{,x}-u_{,y}),\qquad \gamma=\frac{G\,t}{1000}.$$
  It vanishes on every rigid motion (so it is not a spring to ground when a beam or a nodal moment
  turns the node) and is positive semidefinite (a rank-one $B_d^{\mathsf T}B_d$ per point). The
  factor $10^{-3}$ is fixed; there is no user parameter. The membrane is not enriched by the
  drilling rotation (not an Allman element): $\theta_z$ is tied to the membrane rotation only by
  the penalty, so in-plane moments applied at a shell node are carried with a stiffness of order
  $\gamma A$, three orders below the membrane shear stiffness.

## 2. DKT+CST triangle (`plate.rs`)

### 2.1 Geometry
$e_x=\widehat{x_1-x_0}$, $e_z=\widehat{(x_1-x_0)\times(x_2-x_0)}$, $e_y=e_z\times e_x$; nodes are
projected to $(x_i,y_i)$ with origin at node 0. The element is exactly flat.

### 2.2 Membrane: CST
$N_i=L_i$, $B_m$ constant ($\partial N_i/\partial x=(y_j-y_k)/2A$, $\partial N_i/\partial y=(x_k-x_j)/2A$, cyclic),
$K_m=A\,B_m^{\mathsf T}D_mB_m$ (6×6 on $u_i,v_i$). Constant strain: very stiff in in-plane bending
(needs fine meshes for walls in bending; no drilling enrichment).

### 2.3 Bending: DKT (Batoz–Bathe–Ho 1980)
Rotations $\beta_x,\beta_y$ are quadratic, with Kirchhoff constraints imposed at the corners and
edge midpoints and the tangential rotation linear along each edge. DOFs per node $(w,\theta_x,\theta_y)$.
With $x_{ij}=x_i-x_j$, $l_{ij}^2=x_{ij}^2+y_{ij}^2$ and $k=4,5,6$ for sides $ij=23,31,12$:
$$P_k=-6x_{ij}/l_{ij}^2,\quad q_k=3x_{ij}y_{ij}/l_{ij}^2,\quad t_k=-6y_{ij}/l_{ij}^2,\quad r_k=3y_{ij}^2/l_{ij}^2,$$
and $H_{x,\xi},H_{x,\eta},H_{y,\xi},H_{y,\eta}$ are the BBH 1980 tables (coded verbatim in `dkt_b_matrix`,
with $\xi=L_2$, $\eta=L_3$). Then
$$B_b=\frac1{2A}\begin{bmatrix}y_{31}H_{x,\xi}+y_{12}H_{x,\eta}\\-x_{31}H_{y,\xi}-x_{12}H_{y,\eta}\\-x_{31}H_{x,\xi}-x_{12}H_{x,\eta}+y_{31}H_{y,\xi}+y_{12}H_{y,\eta}\end{bmatrix},\qquad
K_b=\sum_{g=1}^3\tfrac13A\,B_b^{\mathsf T}D_bB_b$$
with the 3 interior points $(\tfrac16,\tfrac16),(\tfrac23,\tfrac16),(\tfrac16,\tfrac23)$ (exact for the
quadratic integrand). $B_b\mathbf u$ is the **physical** strain gradient $-\nabla\nabla w$, i.e. minus
the engineering curvature of §1; recovery negates the moments so the public sign matches MITC4.
DKT is a Kirchhoff element: no transverse shear energy, no shear locking, no $Q$ output.

### 2.4 Drilling and assembly into 18×18
DOF positions per node $[u,v,w,\theta_x,\theta_y,\theta_z]$. The CST's $\omega$ is constant, so the
penalty integrals are exact: $\int N_iN_j=A(1+\delta_{ij})/12$, $\int N_i=A/3$.

### 2.5 DKMT add-on (`plate_local_stiffness_thick`) — not used by any solver path
Adds $\alpha K_s$, $K_s=\kappa_sGtA\,B_s^{\mathsf T}B_s$ at the centroid with $\gamma_{xz}=w_{,x}-\theta_y$,
$\gamma_{yz}=w_{,y}+\theta_x$ and $\alpha=\phi/(1+\phi)$, $\phi=t^2/(\bar l^2\kappa_s(1-\nu)/2)$. This is not
Katili's DKMT: the shear signs contradict §1 (a rigid tilt strains it) and the term *adds*
stiffness, whereas shear deformation must add flexibility. See [SH-1](#discrepancies-and-open-questions-for-review).

### 2.6 Mass, $K_G$, loads, recovery
- **Mass** (`plate_consistent_mass`, despite the name): lumped, $m=\rho At/3$ on each translation
  and $I=m\,t^2/12$ on **all three** rotations, including the drilling one. This rotary inertia
  is isotropic, hence frame-invariant; assembly scatters it without rotation (correct).
- **$K_G$**: $w$ interpolated **linearly** (not with the DKT field), on the $w$ DOFs only:
  $K_{G,ij}=A\,\nabla N_i^{\mathsf T}\begin{bmatrix}N_{xx}&N_{xy}\\N_{xy}&N_{yy}\end{bmatrix}\nabla N_j$.
  All three membrane resultants are used; no in-plane ($u,v$) terms.
- **Pressure**: $pA/3$ per node along $e_z$, no moments (the docstring's "consistent moments" are
  not implemented; for DKT this lumped vector is the usual choice).
- **Thermal**: $\mathbf f_m=A B_m^{\mathsf T}[N_T,N_T,0]^{\mathsf T}$, $\mathbf f_b=\sum_g\tfrac13A\,B_b^{\mathsf T}[M_T,M_T,0]^{\mathsf T}$
  ($B_b$ is physical, $\kappa_{th}^{phys}=+\alpha\Delta T_g/t$).
- **Recovery**: centroid membrane (constant) and DKT moments at $(\tfrac13,\tfrac13)$, thermal strain
  subtracted; nodal values evaluate $B_b$ at the vertices (`plate_stress_at_nodes_thermal`, also
  thermal-corrected since SH-10). Principal and von Mises stresses are the worse of the two
  faces. No $Q_x,Q_y$.

## 3. MITC4 flat quadrilateral (`quad.rs`)

### 3.1 Geometry, warping
$e_z=\widehat{d_{13}\times d_{24}}$ (diagonals), $e_x$ = edge 0→1 orthogonalised to $e_z$, $e_y=e_z\times e_x$.
Nodes are projected onto that plane. A warped quad (nodes at distance $h_i=(x_i-\bar x)\cdot e_z$
from the mean plane) is corrected by rigid links from each node to its projection
(MacNeal 1978; Taylor 1987): $u_p=u-h_i\theta_y$, $v_p=v+h_i\theta_x$, i.e. $\mathbf u_p=W\mathbf u$,
$K\leftarrow W^{\mathsf T}KW$, $\mathbf u\leftarrow W\mathbf u$ in recovery, $\mathbf f\leftarrow W^{\mathsf T}\mathbf f$ for the thermal load.
Mass, $K_G$, pressure and self-weight are **not** warp-corrected (second order in $h$).

### 3.2 Membrane: bilinear + EAS-7
Bilinear $N_i$, 2×2 Gauss, plus seven enhanced-strain modes condensed at element level
(Simo–Rifai 1990 modes $\xi,\eta$; Andelfinger–Ramm 1993 bilinear $\xi\eta$ modes):
$$\tilde{\boldsymbol\varepsilon}=\frac{\det J_0}{\det J}\,T_0\,\hat M(\xi,\eta)\,\boldsymbol\alpha,\qquad
\hat M=\begin{bmatrix}\xi&0&0&0&\xi\eta&0&0\\0&\eta&0&0&0&\xi\eta&0\\0&0&\xi&\eta&0&0&\xi\eta\end{bmatrix}$$
with $T_0$ the Voigt transformation built from $J_0^{-1}$ at the centre (columns
$[p^2,r^2,2pr]$, $[q^2,s^2,2qs]$, $[pq,rs,ps+qr]$ with $J_0^{-1}=\begin{bmatrix}p&r\\q&s\end{bmatrix}$).
$C=\int B_m^{\mathsf T}D_m\tilde M$, $Q=\int\tilde M^{\mathsf T}D_m\tilde M$, $K_m\leftarrow K_m-CQ^{-1}C^{\mathsf T}$.
$\int\tilde M\,dA=0$ under 2×2 Gauss, so the patch test is preserved. If $Q$ is singular the
enhancement is skipped (no abort). The function docstring says "4-mode EAS"; the code has 7.

### 3.3 Bending and transverse shear
Bending: $\kappa$ of §1 with bilinear $\theta$, 2×2 Gauss. Shear: MITC4 (Dvorkin–Bathe 1984) on the
covariant components
$$e_{\xi z}=w_{,\xi}+J_{11}\theta_y-J_{12}\theta_x,\qquad e_{\eta z}=w_{,\eta}+J_{21}\theta_y-J_{22}\theta_x$$
($J_{\alpha\beta}=\partial x_\beta/\partial\xi_\alpha$ at the tying point), tied at
A$(0,-1)$, B$(0,1)$ for $e_{\xi z}$ and C$(-1,0)$, D$(1,0)$ for $e_{\eta z}$:
$$\tilde e_{\xi z}=\tfrac12(1-\eta)e^A_{\xi z}+\tfrac12(1+\eta)e^B_{\xi z},\quad \tilde e_{\eta z}=\tfrac12(1-\xi)e^C_{\eta z}+\tfrac12(1+\xi)e^D_{\eta z},\quad \boldsymbol\gamma=J^{-1}\tilde{\mathbf e}$$
evaluated at each 2×2 point. This is the standard MITC4; it is free of shear locking
(`sh_thin_cantilever_strip_does_not_shear_lock`, L/t = 1000, ratio within 5%) and has exactly
six zero eigenvalues (`element_rigid_body_modes.rs`).

### 3.4 Drilling
§1 with bilinear $N$ and 2×2 Gauss: $B_d=[\tfrac12N_{i,y},\,-\tfrac12N_{i,x},\,0,0,0,\,N_i]$ per node.

### 3.5 Mass, $K_G$, loads
- **Mass** (`quad_consistent_mass`): consistent, $\rho t\int N_iN_j$ on each translation and
  $\rho t^3/12\int N_iN_j$ on local $\theta_x,\theta_y$; **no inertia on the drilling rotation**.
  The matrix is local; assembly rotates it with $T$ (SH-4: it used to be scattered unrotated).
- **$K_G$**: bilinear $w$, 2×2 Gauss, $w$ DOFs only, element-constant $N_{xx},N_{yy},N_{xy}$ taken
  at the centroid from the linear solution, from the **mechanical** strain (thermal strain
  removed).
- **Pressure**: $\int pN_i\,dA$ along $e_z$ on the projected element. For a warped quad the
  resultant $pA_{proj}e_z$ equals $p$ times the exact vector area $\tfrac12d_{13}\times d_{24}$ of
  the bilinear surface (`sh_warped_quad_pressure_resultant_equals_vector_area`); only the
  nodal split differs from the curved shell. Not a follower load.
- **Self-weight**: $\int(\rho/1000)\,t\,N_i\,\mathbf g\,dA$ (ρ in kg/m³, g in m/s² → kN).
- **Thermal**: $f_{u_i}=\int N_{i,x}N_T$, $f_{v_i}=\int N_{i,y}N_T$, $f_{\theta x,i}=-\int N_{i,y}M_T$, $f_{\theta y,i}=+\int N_{i,x}M_T$.
- **Edge load**: uniform $q_n$ (outward, $e_n=\widehat{e_t\times e_z}$) and $q_t$, $L/2$ per node.

### 3.6 Recovery
Centroid $\sigma,m$ from §1 with thermal strain subtracted; $Q_x,Q_y$ at the centre from the tied
field (exact there); nodal $\sigma,m$ by bilinear extrapolation of the 2×2 Gauss values (factor
$\sqrt3$); no nodal $Q$.

## 4. MITC9 flat quadrilateral (`quad9.rs`)

Nine-node Lagrange $N$ (corners 0–3, midsides 4–7, centre 8), flat projection on the
**corner-diagonal plane**, 3×3 Gauss for membrane, bending, shear and drilling.
Membrane and bending are **displacement-based** (no assumed membrane strains, unlike Bucalem–Bathe
1993). Transverse shear is tied:
- $e_{\xi z}$ at the 2×3 grid $\xi=\pm1/\sqrt3$, $\eta\in\{-1,0,1\}$, interpolated with 2-point
  Lagrange in $\xi$ times quadratic Lagrange in $\eta$;
- $e_{\eta z}$ at $\xi\in\{-1,0,1\}$, $\eta=\pm1/\sqrt3$, symmetrically;
- $\boldsymbol\gamma=J^{-1}\tilde{\mathbf e}$ at each point.

Bucalem–Bathe place the "3" direction at $0,\pm\sqrt{3/5}$, not at $0,\pm1$ (SH-8). The element
passes the patch test, has six zero eigenvalues on planar geometry and does not lock in the thin
limit. The element is a flat facet on the plane normal to the corner-diagonal $e_z$ through the
parametric mid-surface centroid $\mathbf c=\sum w_i\mathbf x_i$ (Simpson weights 1/36, 1/9, 4/9 on
corner, midside and centre nodes). Nodes off that plane (any curved 9-node shell, or warped corners)
are tied to their projections by rigid links of length $h_i=(\mathbf x_i-\mathbf c)\cdot e_z$, the
MITC4 warp correction on all nine nodes: $K\leftarrow W^{\mathsf T}KW$, $u\leftarrow Wu$ in
recovery, $f\leftarrow W^{\mathsf T}f$ for the thermal load, so rigid motions are exact on any
geometry (SH-7). A free uniform expansion of a curved element is not: the facet reads the normal
motion $\alpha\Delta T\,h_i$ of its off-plane nodes as a deflection with no rotation and resists it
in transverse shear (12 % of the thermal load unbalanced on the 0.2-sag patch), as for a warped
MITC4; the faceted model has no in-element curvature to make it stress-free. Curvature is carried by the mesh (facets), not inside the element. Mass, $K_G$, loads and recovery
mirror MITC4 with the 9-node functions (3×3 Gauss, nodal values by tensor Lagrange extrapolation
from the Gauss grid, no $Q$ output, thermal-subtracted); $K_G$ acts on $w$ only, which the links
leave unchanged. The matrix is explicitly symmetrised at the end.

## 5. Curved shell: degenerated continuum (`curved_shell.rs`)

### 5.1 Kinematics
$$\mathbf x(\xi,\eta,\zeta)=\sum N_i\mathbf x_i+\zeta\tfrac h2\sum N_i\mathbf d_i,\qquad
\mathbf u=\sum N_i\mathbf u_i+\zeta\tfrac h2\sum N_i\,(\boldsymbol\theta_i\times\mathbf d_i)$$
(Ahmad–Irons–Zienkiewicz 1970). Directors $\mathbf d_i$: user `normals` if given, otherwise the
**per-element** corner normals $\widehat{e_{i,i+1}\times e_{i,i-1}}$ flipped into the hemisphere of
$d_{13}\times d_{24}$; they are not averaged across elements, so adjacent elements can disagree at
a shared node (a kink is represented, a smooth surface is faceted at the director level).
Rotations are the three global $\theta$; the component along $\mathbf d_i$ produces no displacement
and is held only by the drilling penalty. The stiffness is built **in global axes** (no $T$).

### 5.2 Strains and integration
$g_1,g_2,g_3$ from $\partial\mathbf x/\partial(\xi,\eta,\zeta)$; local frame $e_3=\hat g_3$,
$e_1=\widehat{g_1-(g_1\cdot e_3)e_3}$, $e_2=e_3\times e_1$. The Cartesian gradient
$\partial u_k/\partial x_i=\sum_j (J^{-1})_{ji}\,\partial u_k/\partial\xi_j$ is projected to
$[\varepsilon_{11},\varepsilon_{22},\gamma_{12},\gamma_{13},\gamma_{23}]$ and
$D=\mathrm{diag}(D_{ps}, \kappa_sG,\kappa_sG)$ ($\sigma_{33}=0$, $\kappa_s=5/6$). Integration 2×2 in-plane
× 2 Gauss points in $\zeta$, $dV=\det J\,d\xi d\eta d\zeta$. No EAS: the membrane part is the plain
bilinear one, so it is stiffer in in-plane bending than MITC4 and prone to membrane locking on
coarse curved meshes.

### 5.3 MITC4 shear in the covariant frame
$2\varepsilon_{\xi\zeta}=\partial_\xi\mathbf u\cdot g_3+\partial_\zeta\mathbf u\cdot g_1$ (and $\eta$) are
sampled at A,B,C,D **per $\zeta$ layer** and interpolated as in §3.3. They are mapped to the local
frame with the contravariant basis $g^i$ (rows of $J^{-1}$):
$$\gamma_{\alpha3}=\sum_{i=1,2}(e_\alpha\cdot g^i)(e_3\cdot g^3)\,2\tilde\varepsilon_{i\zeta}$$
(`ans_shear_to_local`; $e_3\cdot g^{1,2}=0$ exactly, $\varepsilon_{\zeta\zeta}$ is not in the strain set).
Until SH-3 this used $(\hat g_\alpha\cdot e_\beta)/(|g_\alpha||g_3|)$, correct only for $g_1\perp g_2$.

### 5.4 Drilling
`drilling_row` uses the interpolated mid-surface normal $\mathbf n=\widehat{g_1\times g_2}$ and dual
tangent basis: $\omega_n=\tfrac12\sum_a N_{i,a}(\mathbf n\times g^a)\cdot\mathbf u_i$, row
$=[-\omega_n\text{ terms},\ N_i\mathbf n]$, integrated over the **area** $|g_1\times g_2|\,d\xi d\eta$ with
$\gamma=Gh/1000$ (SH-2: it was integrated over the volume, giving $Gh^2/1000$).

### 5.5 Mass, $K_G$, loads, recovery
- **Mass**: consistent, $\rho h\int N_iN_j$ on translations. The rotation blocks come from the
  element's own kinematics, $\mathbf u_\text{rot}=\zeta\frac h2\sum_iN_i\,(\boldsymbol\theta_i\times\mathbf d_i)$:

  $$
  M^{\theta\theta}_{ij}=\frac{\rho h^3}{12}\int N_iN_j\,\big((\mathbf d_i\cdot\mathbf d_j)\,I-\mathbf d_j\mathbf d_i^{\mathsf T}\big)\,dA ,
  $$

  which is $I-\mathbf d_i\mathbf d_i^{\mathsf T}$ on the diagonal blocks. There is inertia about
  the two axes normal to the nodal director and none for a spin about the director, which moves no
  material. History: SH-4 moved it from global $\theta_X,\theta_Y$ to the surface normal. The
  review of #330 then replaced the Gauss-point normal by the nodal directors, because the normal
  gave a director spin positive mass wherever the director differs from it
  (`sh4_curved_shell_director_spin_has_no_mass`).
- **$K_G$**: $\int\nabla_s N_i^{\mathsf T}\mathbf N\nabla_s N_j\,dA$ on **all three** translations (so it
  includes in-plane terms), 2×2 Gauss, $dA=\det J/(h/2)$, with the centroid mid-surface membrane
  resultants from the mechanical strain (SH-5).
- **Pressure**: $\sum_g pN_i(t_1\times t_2)w_g$ with the true mid-surface tangents — exact surface
  normal and area at each Gauss point; direction $t_1\times t_2$ (right-hand node order). Not a
  follower load (geometry is the undeformed one).
- **Self-weight**: $(\rho/1000)h|t_1\times t_2|N_i\mathbf g$ (SH-12: the $/1000$ was missing).
- **Thermal**: $\int B^{\mathsf T}\boldsymbol\sigma_{th}dV$, $\sigma_{11}=\sigma_{22}=\frac{E}{1-\nu}\alpha(\Delta T_u+\zeta\Delta T_g/2)$.
- **Edge load**: 2-point Gauss, outward $\widehat{\hat t\times\hat d}$.
- **Recovery**: centroid mid-surface membrane stresses; moments $m=-\int\sigma z\,dz$ by two
  Gauss points in ζ (exact where the strain is linear in ζ, i.e. constant directors; a quadrature where varying directors make the Jacobian depend on ζ; sign as the flat MITC4), both in the centre mid-surface
  frame ($e_1\parallel g_1$ projected on the tangent plane). Stresses, moments and corner Von Mises
  use the mechanical strain $\varepsilon-\alpha(\Delta T_u+\zeta\Delta T_g/2)$, the thermal loads
  on the element summed (SH-6). Nodal von Mises: membrane, 2×2 extrapolated.

## 6. Solid shell (`solid_shell.rs`)

Trilinear 8-node hexahedron, translations only, $\zeta$ (nodes 1–4 → 5–8) is the thickness
direction, full 3D isotropic $C$ (no plane-stress condensation), 2×2×2 Gauss. ANS on the
**covariant** strains $E_{kl}=\tfrac12(g_k\cdot\mathbf u_{,l}+g_l\cdot\mathbf u_{,k})$:
- $E_{\zeta\zeta}$ tied at the four mid-surface corners $(\pm1,\pm1,0)$, bilinear (Betsch–Stein 1995,
  Bischoff–Ramm 1997) — removes curvature-thickness locking;
- $2E_{\xi\zeta}$ at $(0,\pm1,0)$, $2E_{\eta\zeta}$ at $(\pm1,0,0)$ (Dvorkin–Bathe) — removes shear locking;

then mapped to Cartesian with $\varepsilon_{ab}=\sum E_{kl}G^k_aG^l_b$ ($G^k$ = columns of $J^{-1}$). Frame
invariant (`solid_shell_stiffness_is_frame_invariant`). There is **no EAS** on the thickness
strain: $E_{\zeta\zeta}$ is constant through the thickness, so with $\nu>0$ the bending stress
$\sigma_{zz}$ cannot vanish (Poisson thickness locking, SH-9). The name "SHB8" in the header is
not the SHB8PS reduced-integration element.
Mass: consistent $\rho\int N_iN_j$ (no rotations, so no rotary-inertia question).
$K_G=\int \nabla N_I^{\mathsf T}\boldsymbol\sigma\nabla N_J\,\delta_{ij}dV$ with the full centroid Cauchy stress.
Pressure on the top face (inward positive), self-weight $\rho g/1000$. Recovery: centroid stresses,
moments zero (this element has no rotation DOFs; through-thickness integration is not done),
von Mises at the eight Gauss points.

## 7. Interaction with releases, offsets and constraints

Shells have no releases. Constraints (rigid links, diaphragms, eccentric connections) act on the
assembled DOFs and do not alter the element ([assembly-constraints.md](assembly-constraints.md));
the constrained solver recovers shell stresses from the constrained displacement field
(`constrained_shell_stress.rs`). A node reached only by solid shells gets an artificial rotational
stiffness and nodal moments on it are refused (`solid_shell_analyses.rs`). Shells are linear only:
the corotational solver ignores them (`shell_nonlinear_regressions.rs`).

## 8. Limits of validity

| Element | Thin limit | Thick limit | Distortion / geometry | Notes |
|---|---|---|---|---|
| DKT+CST | exact Kirchhoff, no locking | no shear deformation | flat only; CST membrane very stiff in in-plane bending | no $Q$ |
| MITC4 | no shear locking (ANS) | Mindlin, $\kappa_s=5/6$ | warp corrected by rigid links (warping > 0.01 and > 0.1 diagnosed in assembly) | EAS membrane |
| MITC9 | no shear locking | Mindlin | flat facet; curved or warped nodes tied by rigid links (SH-7), curvature from the mesh | no assumed membrane strain |
| Curved shell | no shear locking | Mindlin | true 3D geometry; no EAS → membrane locking on coarse curved meshes | moments recovered through the thickness (SH-6) |
| Solid shell | no shear/curvature-thickness locking | 3D | Poisson thickness locking for $\nu>0$ (SH-9) | translations only |

All: small strain, small rotation, linear isotropic material, constant thickness per element,
mid-surface reference (no offsets), quality gates in `pre_solve_gates.rs` (aspect ratio, skew,
warping, Jacobian sign).

## 9. Verification map

| Property | Tests |
|---|---|
| Rigid modes, kernel = 6, PSD | `element_rigid_body_modes.rs` (DKT, MITC4, MITC4 warped, MITC9 planar, curved warped, solid), `shell_rigid_body_modes.rs`, `derivation_shells.rs::sh_dkt_triangle_annihilates_rigid_motions` |
| Patch tests (distorted, tilted) | `shell_patch_tests.rs` (MITC4, curved flat, DKT, MITC9, solid) |
| Symmetry | `element_rigid_body_modes.rs::eigenvalues`, `derivation_shells.rs::sh_shell_stiffnesses_are_symmetric` |
| Thin limit, no shear locking | `derivation_shells.rs::sh_thin_cantilever_strip_does_not_shear_lock` (all four 6-DOF elements, L/t = 1000), `shell_patch_tests.rs::solid_shell_thin_cantilever_does_not_lock` |
| Moment/thermal sign conventions | `shell_stress_conventions.rs`, `shell_model_equilibrium.rs::a_hotter_top_curls_the_strip_down`, `shell_transverse_shear.rs` |
| Transverse shear $Q$ | `shell_transverse_shear.rs::mitc4_quads_carry_the_tip_load_as_qx` |
| Constant shear on skewed curved shell | `derivation_shells.rs::sh3_*` |
| Drilling magnitude parity | `derivation_shells.rs::sh2_*` |
| Mass axes, curved-shell mass | `derivation_shells.rs::sh4_*` |
| $K_G$ from mechanical strain | `derivation_shells.rs::sh5_*` |
| Pressure resultant on warped quad | `derivation_shells.rs::sh_warped_quad_pressure_resultant_equals_vector_area` |
| Self-weight units | `derivation_shells.rs::sh12_*` |
| Benchmarks (Scordelis-Lo, hemisphere, Navier plates, …) | `tests/validation/domains/plates_shells/*`, `tests/validation/benchmarks/shell_benchmark.rs` |

Gaps: no test of the MITC9 tying positions against Bucalem–Bathe; no test of MITC4/MITC9
consistent mass against a closed-form frequency of a plate with rotary inertia; the curved-shell
$K_G$ in-plane terms are untested separately; no orthotropic or layered material exists to test.

## References

- J.-L. Batoz, K.-J. Bathe, L.-W. Ho, "A study of three-node triangular plate bending elements",
  *IJNME* 15 (1980) 1771–1812.
- E. N. Dvorkin, K.-J. Bathe, "A continuum mechanics based four-node shell element for general
  nonlinear analysis", *Eng. Comput.* 1 (1984) 77–88.
- M. L. Bucalem, K.-J. Bathe, "Higher-order MITC general shell elements", *IJNME* 36 (1993)
  3729–3754.
- J. C. Simo, M. S. Rifai, "A class of mixed assumed strain methods and the method of
  incompatible modes", *IJNME* 29 (1990) 1595–1638.
- U. Andelfinger, E. Ramm, "EAS-elements for two-dimensional, three-dimensional, plate and shell
  structures", *IJNME* 36 (1993) 1311–1337.
- T. J. R. Hughes, F. Brezzi, "On drilling degrees of freedom", *CMAME* 72 (1989) 105–121.
- S. Ahmad, B. M. Irons, O. C. Zienkiewicz, "Analysis of thick and thin shell structures by
  curved finite elements", *IJNME* 2 (1970) 419–451.
- R. H. MacNeal, "A simple quadrilateral shell element", *Comput. Struct.* 8 (1978) 175–183;
  R. L. Taylor, "Finite element analysis of linear shell problems", 1987.
- P. Betsch, E. Stein, "An assumed strain approach avoiding artificial thickness straining",
  *Commun. Numer. Meth. Eng.* 11 (1995) 899–909; M. Bischoff, E. Ramm, *IJNME* 40 (1997) 4427–4449.
- I. Katili, "A new discrete Kirchhoff-Mindlin element based on Mindlin-Reissner plate theory",
  *IJNME* 36 (1993) 1859–1883.
- K.-J. Bathe, *Finite Element Procedures*, 2nd ed., 2014, ch. 5.4.

## Discrepancies and open questions for review

| ID | Finding | Status | Test |
|---|---|---|---|
| SH-1 | **DKMT add-on is wrong and unused.** `plate_local_stiffness_thick` adds $\alpha K_s$ with $\gamma_{xz}=w_{,x}-\theta_y$, $\gamma_{yz}=w_{,y}+\theta_x$; with $\theta_x=w_{,y}$, $\theta_y=-w_{,x}$ a rigid tilt gives $\gamma=2$ (relative $K\mathbf r$ residual 5e-2). It also adds stiffness where shear deformation must add flexibility. Public API only, no solver path. Remove, or implement Katili's DKMT? | OPEN | `sh1_dkmt_thick_triangle_annihilates_rigid_motions` (ignored) |
| SH-2 | **Curved-shell drilling penalty had dimension $Gh^2$.** It was integrated over the volume with $\gamma=Gh/1000$, i.e. $h$ × the flat elements' value and unit-dependent (×0.05 at h = 0.05 m). Now an area integral, identical to MITC4 on a flat element. | FIXED | `sh2_curved_shell_drilling_penalty_matches_flat_mitc4` |
| SH-3 | **Curved-shell ANS transform wrong on skewed elements.** Tied covariant shears were mapped with $(\hat g_\alpha\cdot e_\beta)/(|g_\alpha||g_3|)$ instead of $(e_\beta\cdot g^\alpha)(e_3\cdot g^3)$. A constant transverse shear on a 60° parallelogram read $\gamma=(1.25, 0.43)$ instead of $(1,0)$: shear energy ×1.75, the element too stiff in shear on any non-rectangular mesh. Fixed in the default and the `_covariant` variant. | FIXED | `sh3_curved_shell_ans_reproduces_constant_shear_on_a_skewed_element` |
| SH-4 | **Shell rotary inertia on the wrong axes.** Quad and quad9 masses (local) were scattered without rotation; the curved shell put $\rho h^3/12$ on global $\theta_X,\theta_Y$. A wall got inertia about its normal (drilling) and none about one in-plane axis. Now $T^{\mathsf T}MT$ in dense and sparse assembly, and $(I-\mathbf n\mathbf n^{\mathsf T})$ in the curved shell. Horizontal elements unchanged. Follow-ups from the review of #330: the curved-shell block is built from the nodal directors (§5.5). The time-history initial acceleration now finds the massless drilling direction of an oblique shell, which is not a coordinate DOF ([mass-geometric-dynamics.md §7](mass-geometric-dynamics.md)). | FIXED | `sh4_wall_rotary_inertia_is_about_in_plane_axes`, `sh4_curved_shell_mass_horizontal_unchanged`, `sh4_curved_shell_director_spin_has_no_mass`, `shell_mass_is_rotation_invariant`, `shell_time_history_initial_acceleration_is_rotation_invariant` |
| SH-5 | **$K_G$ from total strain for DKT, MITC9, curved shell.** Only the quad removed the thermal strain; a free, heated slab got $N=E t\alpha\Delta T/(1-\nu)$ of spurious tension (cooled: compression, so a spurious buckling load). All shells now use the mechanical strain, with several thermal loads summed as $\sum\alpha\Delta T$. | FIXED | `sh5_free_thermal_expansion_carries_no_geometric_stiffness` |
| SH-6 | **Curved-shell moments were reported as zero** and its stresses ignored thermal strain. `curved_shell_stresses` computed only mid-surface membrane stresses and the solver wrote mx = my = mxy = 0. Now $m=-\int z\sigma\,dz$ at the 2 ζ points, and stresses and moments subtract $\alpha(\Delta T_u+\zeta\Delta T_g/2)$, summed over the element's thermal loads (SA-2026-013). The app's temperature on a curved quad (sent as `quadThermal`, then dropped) goes as `curvedShellThermal`; a shell load naming another family's element is refused. | FIXED | `sh6_curved_shell_reports_bending_moments`, `sh6_curved_shell_cantilever_reports_the_static_moment`, `sh6_free_heated_curved_shell_is_stress_free`, `sh6_restrained_heated_curved_shell_matches_mitc4`, `shell_loads_must_name_their_own_family` |
| SH-7 | **MITC9 was planar only.** Flat projection on the corner plane with no rigid-link correction: a cylindrical patch with 0.2 sag on a 2×2 element had relative $K\mathbf r$ residual 0.11 for a rigid rotation, and 101 MPa of nodal von Mises stress (steel, t = 50 mm) for a 1 mrad rigid rotation, while the docstring advertised it for curved shells. Now the MITC4 rigid links on all nine nodes (exact rigid modes, still faceted; docstring says so). Hemisphere (MacNeal–Harder) 16×16: 0.935 → 0.976 of 0.093. Advisory SA-2026-018. | FIXED (#411) | `sh7_curved_mitc9_annihilates_rigid_motions`, `sh7_warped_doubly_curved_mitc9_annihilates_rigid_motions`, `sh7_curved_mitc9_rigid_motion_is_stress_free`, `discretization_error.rs::mitc9_curved_benchmarks_at_16x16` |
| SH-8 | **MITC9 tying points differ from the cited reference.** The code ties $e_{\xi z}$ at $\eta\in\{-1,0,1\}$ (and symmetric); Bucalem–Bathe use $0,\pm\sqrt{3/5}$, and also tie the membrane strains. No failing behaviour found (kernel 6, patch test, thin limit pass); a reviewer should decide whether the variant is intended and cite it. | OPEN | none (no failing case found) |
| SH-9 | **Solid shell Poisson thickness locking.** No EAS on $E_{\zeta\zeta}$ with the full 3D law: at ν = 0.3 a narrow strip (b/L = 0.15) is stiffer than even the cylindrical-bending bound $PL^3(1-\nu^2)/3EI$ (ratio 0.96; 0.88 of beam theory). At ν = 0 it matches beam theory to 1%. Add a linear-in-ζ EAS thickness mode or a plane-stress-condensed law? | OPEN | `sh9_solid_shell_strip_does_not_poisson_lock` (ignored), control `sh9_solid_shell_strip_matches_beam_at_zero_poisson` |
| SH-10 | **DKT nodal stresses ignored thermal strain.** The solver's `nodal_von_mises` for plates came from the total strain: a free, heated triangle reported $E\alpha\Delta T/(1-\nu)$ at its nodes and 0 at its centroid. New `plate_stress_at_nodes_thermal`, used by the solver. | FIXED | `sh10_free_heated_plate_has_zero_nodal_stress` |
| SH-11 | **Only the last thermal load on a shell was used in recovery.** The load vector sums all thermal loads on an element; stress recovery (`HashMap::insert`) kept the last. Two ΔT = 10 loads on a free quad reported σ = Eα·10/(1−ν). Now summed as free strains $\sum\alpha_k\Delta T_k$ (also exact for different α). The sums are keyed by (family, id), since quad and quad9 ids are family-local: keyed by id alone, a quad and a quad9 with the same id doubled each other's correction (found in review of #330). | FIXED | `sh11_two_thermal_loads_on_one_free_shell_leave_it_stress_free`, `sh11_quad_and_quad9_with_the_same_id_keep_their_own_thermal_loads` |
| SH-12 | **Curved-shell self-weight 1000× too large.** `density` is kg/m³ (as for quads); the quad and quad9 divide ρg by 1000 to get kN, the curved shell did not. | FIXED | `sh12_self_weight_is_rho_g_t_area_in_kn_for_every_shell` |
| SH-13 | **Drilling DOF inertia differs by element.** DKT lumps $mt^2/12$ on $\theta_z$; MITC4, MITC9 and the curved shell put none. Both are arbitrary (drilling has no physical inertia); a massless drilling DOF is handled by the eigensolvers but gives infinite-frequency modes in explicit dynamics. | DOCUMENTED-CHOICE | n/a |
| SH-14 | **Simplified $K_G$.** Flat elements: $w$-only, linear/bilinear/biquadratic $w$ (not the DKT field), element-constant centroid resultants; curved shell adds in-plane terms. Adequate for plate buckling under membrane stress; no shell-bending or moment-driven $K_G$, no rotation terms. | DOCUMENTED-CHOICE | `solid_shell_analyses.rs::buckling_*`, validation buckling benchmarks |
| SH-15 | **Docstrings that disagree with the code**: `plate_pressure_load` claims consistent moments (it is $pA/3$ lumped); `mitc4_local_stiffness` says 4-mode EAS (code: 7); `plate_consistent_mass` and `quad_consistent_mass` say lumped/consistent the other way round. | OPEN (docs) | n/a |
| SH-16 | **Hard-coded constants**: $\kappa_s=5/6$, drilling $10^{-3}G t$, no user override; isotropic material only. | DOCUMENTED-CHOICE | n/a |
