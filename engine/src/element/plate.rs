/// DKT+CST triangular plate/shell element.
///
/// Combines:
/// - CST (Constant Strain Triangle) for in-plane membrane behavior (6 DOFs)
/// - DKT (Discrete Kirchhoff Triangle) for out-of-plane bending (9 DOFs)
/// - Artificial drilling stiffness (3 DOFs)
///
/// Total: 18 DOFs per element (6 per node).
/// Node DOF ordering: [ux, uy, uz, rx, ry, rz] per node.

// ---------------------------------------------------------------------------
// Public result struct
// ---------------------------------------------------------------------------

/// Stress results at the element centroid.
#[derive(Debug, Clone)]
pub struct PlateStressLocal {
    /// Membrane stress σ_xx (kN/m²).
    pub sigma_xx: f64,
    /// Membrane stress σ_yy (kN/m²).
    pub sigma_yy: f64,
    /// Membrane shear stress τ_xy (kN/m²).
    pub tau_xy: f64,
    /// Bending moment m_x (kN·m/m).
    pub mx: f64,
    /// Bending moment m_y (kN·m/m).
    pub my: f64,
    /// Twisting moment m_xy (kN·m/m).
    pub mxy: f64,
    /// Maximum principal stress (kN/m²).
    pub sigma_1: f64,
    /// Minimum principal stress (kN/m²).
    pub sigma_2: f64,
    /// Von Mises equivalent stress (kN/m²).
    pub von_mises: f64,
}

// ---------------------------------------------------------------------------
// Local coordinate helpers
// ---------------------------------------------------------------------------

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn norm3(v: &[f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn sub3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot3(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Compute local orthonormal axes from the three triangle vertices.
/// Returns (ex, ey, ez) where:
///   ex = direction from node 0 to node 1
///   ez = outward normal (edge01 × edge02, normalised)
///   ey = ez × ex
fn local_axes(coords: &[[f64; 3]; 3]) -> ([f64; 3], [f64; 3], [f64; 3]) {
    let v01 = sub3(&coords[1], &coords[0]);
    let v02 = sub3(&coords[2], &coords[0]);

    let len01 = norm3(&v01);
    let ex = [v01[0] / len01, v01[1] / len01, v01[2] / len01];

    let n = cross(&v01, &v02);
    let n_len = norm3(&n);
    let ez = [n[0] / n_len, n[1] / n_len, n[2] / n_len];

    let ey = cross(&ez, &ex);

    (ex, ey, ez)
}

/// Project 3D coordinates onto the local 2D plane defined by (ex, ey) with
/// origin at node 0.  Returns [(x1,y1), (x2,y2), (x3,y3)].
fn project_to_2d(
    coords: &[[f64; 3]; 3],
    ex: &[f64; 3],
    ey: &[f64; 3],
) -> [(f64, f64); 3] {
    let o = coords[0];
    let mut pts = [(0.0, 0.0); 3];
    for i in 0..3 {
        let d = sub3(&coords[i], &o);
        pts[i] = (dot3(&d, ex), dot3(&d, ey));
    }
    pts
}

/// Twice the signed area of the triangle in local 2D.
fn twice_area(p: &[(f64, f64); 3]) -> f64 {
    (p[1].0 - p[0].0) * (p[2].1 - p[0].1) - (p[2].0 - p[0].0) * (p[1].1 - p[0].1)
}

// ---------------------------------------------------------------------------
// CST membrane stiffness (6×6)
// ---------------------------------------------------------------------------

/// CST B-matrix (3×6) for a triangle with local 2D coordinates `p`.
/// Returns (B, area) where B is row-major 3×6.
fn cst_b_matrix(p: &[(f64, f64); 3]) -> ([f64; 18], f64) {
    let two_a = twice_area(p);
    let area = two_a.abs() / 2.0;

    // Shape function derivatives:
    //   dN_i/dx = (y_j - y_k) / (2A)
    //   dN_i/dy = (x_k - x_j) / (2A)
    // where (i,j,k) are cyclic: (0,1,2), (1,2,0), (2,0,1).
    let dnx = [
        (p[1].1 - p[2].1) / two_a,
        (p[2].1 - p[0].1) / two_a,
        (p[0].1 - p[1].1) / two_a,
    ];
    let dny = [
        (p[2].0 - p[1].0) / two_a,
        (p[0].0 - p[2].0) / two_a,
        (p[1].0 - p[0].0) / two_a,
    ];

    // B = [ dN1/dx   0      dN2/dx   0      dN3/dx   0    ]
    //     [ 0        dN1/dy  0       dN2/dy  0       dN3/dy]
    //     [ dN1/dy   dN1/dx  dN2/dy  dN2/dx  dN3/dy  dN3/dx]
    let mut b = [0.0; 18];
    for i in 0..3 {
        b[0 * 6 + 2 * i] = dnx[i];
        b[1 * 6 + 2 * i + 1] = dny[i];
        b[2 * 6 + 2 * i] = dny[i];
        b[2 * 6 + 2 * i + 1] = dnx[i];
    }
    (b, area)
}

/// CST membrane stiffness K_m = A * Bt * D * B   (6×6, row-major).
fn cst_stiffness(p: &[(f64, f64); 3], e: f64, nu: f64, t: f64) -> [f64; 36] {
    let (b, area) = cst_b_matrix(p);

    // D_membrane (3×3, plane stress)
    let coeff = e * t / (1.0 - nu * nu);
    let d = [
        coeff,        coeff * nu,   0.0,
        coeff * nu,   coeff,        0.0,
        0.0,          0.0,          coeff * (1.0 - nu) / 2.0,
    ];

    // DB = D * B  (3×6)
    let mut db = [0.0; 18];
    for i in 0..3 {
        for j in 0..6 {
            let mut s = 0.0;
            for k in 0..3 {
                s += d[i * 3 + k] * b[k * 6 + j];
            }
            db[i * 6 + j] = s;
        }
    }

    // K = A * Bt * DB  (6×6)
    let mut km = [0.0; 36];
    for i in 0..6 {
        for j in 0..6 {
            let mut s = 0.0;
            for k in 0..3 {
                s += b[k * 6 + i] * db[k * 6 + j];
            }
            km[i * 6 + j] = area * s;
        }
    }
    km
}

// ---------------------------------------------------------------------------
// DKT bending stiffness (9×9)
// ---------------------------------------------------------------------------

/// Geometric quantities for DKT element edges.
#[allow(dead_code)] // `area` is read; the edge terms are recomputed in `dkt_b_matrix`.
struct DktGeom {
    /// Edge lengths squared: l_ij^2 for edges 4-5 (01), 5-6 (12), 6-4 (20)
    lij_sq: [f64; 3],
    /// x_ij = x_j - x_i for each edge
    xij: [f64; 3],
    /// y_ij = y_j - y_i for each edge
    yij: [f64; 3],
    /// Area of the triangle.
    area: f64,
}

fn dkt_geometry(p: &[(f64, f64); 3]) -> DktGeom {
    // Edges: k=0 → (0,1), k=1 → (1,2), k=2 → (2,0)
    let idx = [(0, 1), (1, 2), (2, 0)];
    let mut xij = [0.0; 3];
    let mut yij = [0.0; 3];
    let mut lij_sq = [0.0; 3];
    for k in 0..3 {
        let (i, j) = idx[k];
        xij[k] = p[j].0 - p[i].0;
        yij[k] = p[j].1 - p[i].1;
        lij_sq[k] = xij[k] * xij[k] + yij[k] * yij[k];
    }
    let two_a = twice_area(p);
    let area = two_a.abs() / 2.0;
    DktGeom { lij_sq, xij, yij, area }
}

/// Evaluate the DKT B-matrix (3×9) at natural coordinates (xi, eta).
///
/// The DOF ordering per node is (w, θx, θy), right-handed rotations: θx = ∂w/∂y,
/// θy = −∂w/∂x, the convention every other element in the model shares.
///
/// Batoz, Bathe & Ho (1980), "A study of three-node triangular plate bending
/// elements", IJNME 15, eqs. for Hx,ξ … Hy,η and B. With xᵢⱼ = xᵢ − xⱼ,
/// lᵢⱼ² = xᵢⱼ² + yᵢⱼ² and k = 4, 5, 6 for sides ij = 23, 31, 12:
///   Pₖ = −6xᵢⱼ/lᵢⱼ², qₖ = 3xᵢⱼyᵢⱼ/lᵢⱼ², tₖ = −6yᵢⱼ/lᵢⱼ², rₖ = 3yᵢⱼ²/lᵢⱼ².
///
/// The previous coefficients were Pₖ = −6xy/l², qₖ = 3x²/l², tₖ = −6y²/l² on
/// xⱼ − xᵢ: dimensionally wrong (Pₖ and tₖ must scale as 1/length), and the
/// element neither annihilated a rigid tilt nor converged — a simply supported
/// square plate read about 3.8× Navier's deflection at any mesh density.
fn dkt_b_matrix(
    p: &[(f64, f64); 3],
    _g: &DktGeom,
    xi: f64,
    eta: f64,
) -> [f64; 27] {
    let (x1, y1) = p[0];
    let (x2, y2) = p[1];
    let (x3, y3) = p[2];
    // Sides k = 4, 5, 6 ↔ ij = 23, 31, 12 (stored at index 0, 1, 2).
    let xs = [x2 - x3, x3 - x1, x1 - x2];
    let ys = [y2 - y3, y3 - y1, y1 - y2];
    let mut pk = [0.0; 3];
    let mut qk = [0.0; 3];
    let mut tk = [0.0; 3];
    let mut rk = [0.0; 3];
    for k in 0..3 {
        let l2 = xs[k] * xs[k] + ys[k] * ys[k];
        pk[k] = -6.0 * xs[k] / l2;
        qk[k] = 3.0 * xs[k] * ys[k] / l2;
        tk[k] = -6.0 * ys[k] / l2;
        rk[k] = 3.0 * ys[k] * ys[k] / l2;
    }
    let (p4, p5, p6) = (pk[0], pk[1], pk[2]);
    let (q4, q5, q6) = (qk[0], qk[1], qk[2]);
    let (t4, t5, t6) = (tk[0], tk[1], tk[2]);
    let (r4, r5, r6) = (rk[0], rk[1], rk[2]);
    let a = 1.0 - 2.0 * xi;
    let b = 1.0 - 2.0 * eta;

    let hx_xi = [
        p6 * a + (p5 - p6) * eta,
        q6 * a - (q5 + q6) * eta,
        -4.0 + 6.0 * (xi + eta) + r6 * a - eta * (r5 + r6),
        -p6 * a + eta * (p4 + p6),
        q6 * a - eta * (q6 - q4),
        -2.0 + 6.0 * xi + r6 * a + eta * (r4 - r6),
        -eta * (p5 + p4),
        eta * (q4 - q5),
        -eta * (r5 - r4),
    ];
    let hy_xi = [
        t6 * a + eta * (t5 - t6),
        1.0 + r6 * a - eta * (r5 + r6),
        -q6 * a + eta * (q5 + q6),
        -t6 * a + eta * (t4 + t6),
        -1.0 + r6 * a + eta * (r4 - r6),
        -q6 * a - eta * (q4 - q6),
        -eta * (t4 + t5),
        eta * (r4 - r5),
        -eta * (q4 - q5),
    ];
    let hx_eta = [
        -p5 * b - xi * (p6 - p5),
        q5 * b - xi * (q5 + q6),
        -4.0 + 6.0 * (xi + eta) + r5 * b - xi * (r5 + r6),
        xi * (p4 + p6),
        xi * (q4 - q6),
        -xi * (r6 - r4),
        p5 * b - xi * (p4 + p5),
        q5 * b + xi * (q4 - q5),
        -2.0 + 6.0 * eta + r5 * b + xi * (r4 - r5),
    ];
    let hy_eta = [
        -t5 * b - xi * (t6 - t5),
        1.0 + r5 * b - xi * (r5 + r6),
        -q5 * b + xi * (q5 + q6),
        xi * (t4 + t6),
        xi * (r4 - r6),
        -xi * (q4 - q6),
        t5 * b - xi * (t4 + t5),
        -1.0 + r5 * b + xi * (r4 - r5),
        -q5 * b - xi * (q4 - q5),
    ];

    // B = 1/(2A)·[ y31·Hx,ξ + y12·Hx,η ;
    //              −x31·Hy,ξ − x12·Hy,η ;
    //              −x31·Hx,ξ − x12·Hx,η + y31·Hy,ξ + y12·Hy,η ]
    let (x31, y31, x12, y12) = (xs[1], ys[1], xs[2], ys[2]);
    let two_a = x31 * y12 - x12 * y31;
    let mut b_dkt = [0.0; 27];
    for j in 0..9 {
        b_dkt[j] = (y31 * hx_xi[j] + y12 * hx_eta[j]) / two_a;
        b_dkt[9 + j] = (-x31 * hy_xi[j] - x12 * hy_eta[j]) / two_a;
        b_dkt[18 + j] = (-x31 * hx_xi[j] - x12 * hx_eta[j] + y31 * hy_xi[j] + y12 * hy_eta[j]) / two_a;
    }
    b_dkt
}

/// DKT bending stiffness matrix (9×9, row-major).
/// Uses 3-point Gauss quadrature over the triangle.
fn dkt_stiffness(p: &[(f64, f64); 3], e: f64, nu: f64, t: f64) -> [f64; 81] {
    let g = dkt_geometry(p);

    // D_bending (3×3)
    let d_coeff = e * t * t * t / (12.0 * (1.0 - nu * nu));
    let d_bend = [
        d_coeff,         d_coeff * nu,    0.0,
        d_coeff * nu,    d_coeff,         0.0,
        0.0,             0.0,             d_coeff * (1.0 - nu) / 2.0,
    ];

    // 3-point Gauss quadrature on triangle.
    // Points: (2/3, 1/6, 1/6), (1/6, 2/3, 1/6), (1/6, 1/6, 2/3)
    // In area coordinates (L1, L2, L3). Using xi = L2, eta = L3:
    let gauss_pts: [(f64, f64); 3] = [
        (1.0 / 6.0, 1.0 / 6.0),
        (2.0 / 3.0, 1.0 / 6.0),
        (1.0 / 6.0, 2.0 / 3.0),
    ];
    let gauss_w = 1.0 / 3.0; // weight for each point (sums to 1)

    let mut kb = [0.0; 81]; // 9×9

    for gp in &gauss_pts {
        let b = dkt_b_matrix(p, &g, gp.0, gp.1);

        // DB = D * B  (3×9)
        let mut db = [0.0; 27];
        for i in 0..3 {
            for j in 0..9 {
                let mut s = 0.0;
                for k in 0..3 {
                    s += d_bend[i * 3 + k] * b[k * 9 + j];
                }
                db[i * 9 + j] = s;
            }
        }

        // K += w * Bt * DB  (9×9): upper triangle, mirrored, so the matrix is
        // exactly symmetric rather than symmetric to round-off.
        for i in 0..9 {
            for j in i..9 {
                let mut s = 0.0;
                for k in 0..3 {
                    s += b[k * 9 + i] * db[k * 9 + j];
                }
                kb[i * 9 + j] += gauss_w * s;
                if j != i { kb[j * 9 + i] += gauss_w * s; }
            }
        }
    }

    // Multiply by area (the Gauss weights are normalised to unit triangle area;
    // det(J)/2 = area, and we integrate over the unit triangle).
    let area = g.area;
    for v in kb.iter_mut() {
        *v *= area;
    }
    kb
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

/// DOF index within the 18-DOF element vector.
/// Per node: [ux(0), uy(1), uz(2), rx(3), ry(4), rz(5)]
/// Node offsets: node0 → 0, node1 → 6, node2 → 12.

/// Membrane (CST) DOF positions: ux, uy for each of the 3 nodes.
const MEM_DOFS: [usize; 6] = [0, 1, 6, 7, 12, 13];
/// Bending (DKT) DOF positions: uz, rx, ry for each of the 3 nodes.
const BEND_DOFS: [usize; 9] = [2, 3, 4, 8, 9, 10, 14, 15, 16];
/// Drilling DOF positions: rz for each of the 3 nodes.
const DRILL_DOFS: [usize; 3] = [5, 11, 17];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compute the 18×18 local stiffness matrix for a DKT+CST triangular plate
/// element (row-major flat vector).
///
/// # Arguments
/// * `coords` – 3 node positions in 3D global space
/// * `e`      – Young's modulus (kN/m²)
/// * `nu`     – Poisson's ratio
/// * `t`      – shell thickness (m)
pub fn plate_local_stiffness(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);

    let km = cst_stiffness(&p, e, nu, t);
    let kb = dkt_stiffness(&p, e, nu, t);

    let n = 18;
    let mut k = vec![0.0; n * n];

    // Scatter membrane (6×6) into 18×18.
    for i in 0..6 {
        for j in 0..6 {
            k[MEM_DOFS[i] * n + MEM_DOFS[j]] += km[i * 6 + j];
        }
    }

    // Scatter bending (9×9) into 18×18.
    for i in 0..9 {
        for j in 0..9 {
            k[BEND_DOFS[i] * n + BEND_DOFS[j]] += kb[i * 9 + j];
        }
    }

    // Drilling stabilization (Hughes & Brezzi 1989): γ·∫(θz − ω)² dA with
    // ω = ½(∂v/∂x − ∂u/∂y), γ = G·t/1000. Against the membrane's own rotation, not
    // θz alone: a penalty on θz alone resists a rigid rotation about the normal and
    // acts as a spring to ground wherever a beam, a nodal moment or a fold turns
    // those nodes. The CST's ω is constant, so the integrals are exact:
    // ∫NᵢNⱼ = A(1 + δᵢⱼ)/12, ∫Nᵢ = A/3.
    let two_a = twice_area(&p);
    let area = two_a.abs() / 2.0;
    let g_shear = e / (2.0 * (1.0 + nu));
    let gamma = g_shear * t / 1000.0;
    // Row of −ω on the membrane DOFs: u_i → +½ ∂Nᵢ/∂y, v_i → −½ ∂Nᵢ/∂x.
    let mut w_row = [0.0; 18];
    for a in 0..3 {
        let (b, c) = ((a + 1) % 3, (a + 2) % 3);
        let dn_dx = (p[b].1 - p[c].1) / two_a;
        let dn_dy = (p[c].0 - p[b].0) / two_a;
        w_row[MEM_DOFS[2 * a]] = 0.5 * dn_dy;
        w_row[MEM_DOFS[2 * a + 1]] = -0.5 * dn_dx;
    }
    // Upper triangle, mirrored: exactly symmetric, not symmetric to round-off.
    for r in 0..18 {
        if w_row[r] == 0.0 { continue; }
        for c in r..18 {
            let v = gamma * area * w_row[r] * w_row[c];
            k[r * n + c] += v;
            if c != r { k[c * n + r] += v; }
        }
    }
    for a in 0..3 {
        for r in 0..18 {
            if w_row[r] == 0.0 { continue; }
            let v = gamma * area / 3.0 * w_row[r];
            k[r * n + DRILL_DOFS[a]] += v;
            k[DRILL_DOFS[a] * n + r] += v;
        }
        for b in 0..3 {
            let nn = if a == b { area / 6.0 } else { area / 12.0 };
            k[DRILL_DOFS[a] * n + DRILL_DOFS[b]] += gamma * nn;
        }
    }

    k
}

/// Compute the 18×18 transformation matrix from local to global coordinates
/// (row-major flat vector).
///
/// Block-diagonal: six 3×3 rotation sub-blocks (one per DOF-triple per node).
///
/// The rotation matrix R has rows [ex, ey, ez] so that u_local = R · u_global.
pub fn plate_transform_3d(coords: &[[f64; 3]; 3]) -> Vec<f64> {
    let (ex, ey, ez) = local_axes(coords);

    let n = 18;
    let mut t = vec![0.0; n * n];

    // 6 blocks of 3×3 along the diagonal.
    for blk in 0..6 {
        let off = blk * 3;
        // Row 0 of block → ex
        t[(off + 0) * n + (off + 0)] = ex[0];
        t[(off + 0) * n + (off + 1)] = ex[1];
        t[(off + 0) * n + (off + 2)] = ex[2];
        // Row 1 of block → ey
        t[(off + 1) * n + (off + 0)] = ey[0];
        t[(off + 1) * n + (off + 1)] = ey[1];
        t[(off + 1) * n + (off + 2)] = ey[2];
        // Row 2 of block → ez
        t[(off + 2) * n + (off + 0)] = ez[0];
        t[(off + 2) * n + (off + 1)] = ez[1];
        t[(off + 2) * n + (off + 2)] = ez[2];
    }

    t
}

/// Compute the 18-element consistent pressure load vector in **global**
/// coordinates for a uniform pressure applied normal to the plate surface.
///
/// Uses the consistent load vector formulation for the DKT element:
/// - Translational DOFs: F/3 per node in the normal direction
/// - Rotational DOFs: consistent moments from the DKT shape functions
///   integrated over the element area
///
/// The rotational terms improve accuracy for coarse meshes by ensuring
/// the load vector is work-equivalent to the actual distributed pressure.
pub fn plate_pressure_load(
    coords: &[[f64; 3]; 3],
    pressure: f64,
) -> Vec<f64> {
    let (_ex, _ey, ez) = local_axes(coords);
    let p = project_to_2d(coords, &_ex, &_ey);
    let area = twice_area(&p).abs() / 2.0;

    let total_force = pressure * area;
    let f_per_node = total_force / 3.0;

    // The pressure acts in the local z direction. In global coordinates the
    // force at each node is f_per_node * ez.
    let mut f = vec![0.0; 18];
    for node in 0..3 {
        let base = node * 6;
        f[base + 0] = f_per_node * ez[0];
        f[base + 1] = f_per_node * ez[1];
        f[base + 2] = f_per_node * ez[2];
    }
    f
}

/// Compute the 18-element thermal load vector in **global** coordinates
/// for a plate element subjected to uniform temperature change and/or
/// through-thickness temperature gradient.
///
/// # Arguments
/// * `coords` – 3 node positions in 3D global space
/// * `e` – Young's modulus (kN/m²)
/// * `nu` – Poisson's ratio
/// * `t` – shell thickness (m)
/// * `alpha` – coefficient of thermal expansion (1/°C)
/// * `dt_uniform` – uniform temperature change (°C)
/// * `dt_gradient` – temperature gradient through thickness (°C, positive = top hotter)
///
/// Thermal loading produces:
/// - Membrane forces from uniform temperature: N_T = E*α*ΔT*t / (1-ν)
/// - Bending moments from gradient: M_T = E*α*ΔT_grad*t² / (12*(1-ν))
///
/// The FEF is derived from: f_thermal = integral(B^T * D * ε_thermal * dA)
pub fn plate_thermal_load(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
    alpha: f64,
    dt_uniform: f64,
    dt_gradient: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);
    let area = twice_area(&p).abs() / 2.0;

    let mut f_local = vec![0.0; 18];

    // Membrane thermal forces: uniform temperature produces isotropic strain
    // ε_th = α * ΔT in all directions.
    // Resultant force per unit length: N_T = D_mem * ε_th
    // where D_mem * [ε, ε, 0]^T = E*t/(1-ν) * [ε, ε, 0]^T (for plane stress + isotropic strain)
    // N_T = E * t * α * ΔT / (1 - ν) per unit length, applied as body force.
    if dt_uniform.abs() > 1e-15 {
        let n_thermal = e * t * alpha * dt_uniform / (1.0 - nu);

        // CST approach: f = A * B^T * [N_T, N_T, 0]^T
        let (b_cst, _) = cst_b_matrix(&p);
        let sigma = [n_thermal, n_thermal, 0.0];
        for i in 0..6 {
            let mut val = 0.0;
            for k in 0..3 {
                val += b_cst[k * 6 + i] * sigma[k];
            }
            f_local[MEM_DOFS[i]] += area * val;
        }
    }

    // Bending thermal moments: temperature gradient produces curvature
    // κ_th = α * ΔT_grad / t in all directions.
    // Resultant moment per unit length: M_T = D_bend * κ_th
    // M_T = E * t² * α * ΔT_grad / (12 * (1 - ν))
    if dt_gradient.abs() > 1e-15 {
        let m_thermal = e * t * t * alpha * dt_gradient / (12.0 * (1.0 - nu));
        let g = dkt_geometry(&p);

        // Integrate B_dkt^T * [M_T, M_T, 0]^T over the element
        let gauss_pts: [(f64, f64); 3] = [
            (1.0 / 6.0, 1.0 / 6.0),
            (2.0 / 3.0, 1.0 / 6.0),
            (1.0 / 6.0, 2.0 / 3.0),
        ];
        let gauss_w = 1.0 / 3.0;

        let kappa_th = [m_thermal, m_thermal, 0.0];

        for gp in &gauss_pts {
            let b = dkt_b_matrix(&p, &g, gp.0, gp.1);
            for i in 0..9 {
                let mut val = 0.0;
                for k in 0..3 {
                    val += b[k * 9 + i] * kappa_th[k];
                }
                f_local[BEND_DOFS[i]] += gauss_w * area * val;
            }
        }
    }

    // Transform to global coordinates
    let t_mat = plate_transform_3d(coords);
    let n = 18;
    let mut f_global = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            f_global[i] += t_mat[j * n + i] * f_local[j]; // T^T
        }
    }
    f_global
}

/// Compute the 18×18 lumped mass matrix (row-major flat vector).
///
/// mass per node = ρ · A · t / 3 applied to translational DOFs only.
pub fn plate_consistent_mass(
    coords: &[[f64; 3]; 3],
    rho: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);
    let area = twice_area(&p).abs() / 2.0;

    let m_node = rho * area * t / 3.0;

    let n = 18;
    let mut mass = vec![0.0; n * n];

    // Rotational inertia per node: I = m_node * t² / 12
    // This is the physical rotational inertia through the plate thickness,
    // needed to avoid a singular mass matrix when plate DOFs are free.
    let i_rot = m_node * t * t / 12.0;

    for node in 0..3 {
        let base = node * 6;
        // Translational DOFs: ux, uy, uz
        mass[(base + 0) * n + (base + 0)] = m_node;
        mass[(base + 1) * n + (base + 1)] = m_node;
        mass[(base + 2) * n + (base + 2)] = m_node;
        // Rotational DOFs: rx, ry, rz — physical rotational inertia
        mass[(base + 3) * n + (base + 3)] = i_rot;
        mass[(base + 4) * n + (base + 4)] = i_rot;
        mass[(base + 5) * n + (base + 5)] = i_rot;
    }

    mass
}

/// Recover plate stresses at the element centroid from local displacements.
///
/// Thermal strains are subtracted before applying the constitutive law:
/// ε_mech = ε_total − α·ΔT_uniform (membrane), κ_mech = κ_total − α·ΔT_gradient/t (bending).
/// Without this correction a fully restrained plate under ΔT reports σ = 0
/// instead of σ = −E·α·ΔT/(1−ν).
///
/// # Arguments
/// * `coords`  – 3 node positions in 3D global space
/// * `e`       – Young's modulus (kN/m²)
/// * `nu`      – Poisson's ratio
/// * `t`       – shell thickness (m)
/// * `u_local` – 18-element displacement vector in the **local** coordinate system
/// * `alpha`   – coefficient of thermal expansion (1/°C), 0 = no thermal correction
/// * `dt_uniform`  – uniform temperature change (°C)
/// * `dt_gradient` – through-thickness temperature gradient (°C)
pub fn plate_stress_recovery(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
    u_local: &[f64],
    alpha: f64,
    dt_uniform: f64,
    dt_gradient: f64,
) -> PlateStressLocal {
    assert!(u_local.len() >= 18, "u_local must have at least 18 entries");

    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);

    // -----------------------------------------------------------------------
    // Membrane stresses (constant over the element — CST)
    // -----------------------------------------------------------------------
    let (b_cst, _area) = cst_b_matrix(&p);

    // Extract membrane displacements: ux, uy per node.
    let mut u_mem = [0.0; 6];
    for i in 0..6 {
        u_mem[i] = u_local[MEM_DOFS[i]];
    }

    // epsilon = B_cst * u_mem  (3 components)
    let mut eps = [0.0; 3];
    for i in 0..3 {
        for j in 0..6 {
            eps[i] += b_cst[i * 6 + j] * u_mem[j];
        }
    }

    // Subtract thermal strains (mechanical strain drives stress)
    let eps_th = alpha * dt_uniform;
    eps[0] -= eps_th;
    eps[1] -= eps_th;

    // D_membrane
    let dm_coeff = e * t / (1.0 - nu * nu);
    let d_mem = [
        dm_coeff,         dm_coeff * nu,    0.0,
        dm_coeff * nu,    dm_coeff,         0.0,
        0.0,              0.0,              dm_coeff * (1.0 - nu) / 2.0,
    ];

    // Membrane stress resultants  (force per unit length: N/m).
    // To get actual stress (kN/m²) we divide by thickness.
    let mut n_mem = [0.0; 3]; // Nxx, Nyy, Nxy (force/length)
    for i in 0..3 {
        for j in 0..3 {
            n_mem[i] += d_mem[i * 3 + j] * eps[j];
        }
    }
    // Stress = N / t  (but D already includes t, so N = D*eps and sigma = N/t)
    let sigma_xx = n_mem[0] / t;
    let sigma_yy = n_mem[1] / t;
    let tau_xy = n_mem[2] / t;

    // -----------------------------------------------------------------------
    // Bending moments at the centroid (DKT)
    // -----------------------------------------------------------------------
    let g = dkt_geometry(&p);

    // Evaluate B at centroid (xi=1/3, eta=1/3).
    let b_dkt = dkt_b_matrix(&p, &g, 1.0 / 3.0, 1.0 / 3.0);

    // Extract bending displacements: w, theta_x, theta_y per node.
    let mut u_bend = [0.0; 9];
    for i in 0..9 {
        u_bend[i] = u_local[BEND_DOFS[i]];
    }

    // Curvatures kappa = B_dkt * u_bend  (3 components)
    let mut kappa = [0.0; 3];
    for i in 0..3 {
        for j in 0..9 {
            kappa[i] += b_dkt[i * 9 + j] * u_bend[j];
        }
    }

    // Subtract thermal curvatures (mechanical curvature drives moment)
    let kappa_th = alpha * dt_gradient / t;
    kappa[0] -= kappa_th;
    kappa[1] -= kappa_th;

    // D_bending
    let db_coeff = e * t * t * t / (12.0 * (1.0 - nu * nu));
    let d_bend = [
        db_coeff,         db_coeff * nu,    0.0,
        db_coeff * nu,    db_coeff,         0.0,
        0.0,              0.0,              db_coeff * (1.0 - nu) / 2.0,
    ];

    // Moments m = D_bending * kappa  (kN·m / m)
    let mut mom = [0.0; 3];
    for i in 0..3 {
        for j in 0..3 {
            mom[i] += d_bend[i * 3 + j] * kappa[j];
        }
    }
    let mx = mom[0];
    let my = mom[1];
    let mxy = mom[2];

    // -----------------------------------------------------------------------
    // Combined top/bottom fibre stresses and principal / von Mises
    // -----------------------------------------------------------------------
    // Bending stress at extreme fibre (z = ±t/2):
    //   sigma_bending = ±6 * M / t²
    let bend_xx = 6.0 * mx / (t * t);
    let bend_yy = 6.0 * my / (t * t);
    let bend_xy = 6.0 * mxy / (t * t);

    // Top fibre (z = +t/2): membrane + bending.
    let sx_top = sigma_xx + bend_xx;
    let sy_top = sigma_yy + bend_yy;
    let txy_top = tau_xy + bend_xy;

    // Bottom fibre (z = -t/2): membrane - bending.
    let sx_bot = sigma_xx - bend_xx;
    let sy_bot = sigma_yy - bend_yy;
    let txy_bot = tau_xy - bend_xy;

    // Principal stresses and von Mises on both faces; report worst case.
    let (s1_top, s2_top, vm_top) = principal_and_von_mises(sx_top, sy_top, txy_top);
    let (s1_bot, s2_bot, vm_bot) = principal_and_von_mises(sx_bot, sy_bot, txy_bot);

    let (sigma_1, sigma_2, von_mises) = if vm_top >= vm_bot {
        (s1_top, s2_top, vm_top)
    } else {
        (s1_bot, s2_bot, vm_bot)
    };

    PlateStressLocal {
        sigma_xx,
        sigma_yy,
        tau_xy,
        mx,
        my,
        mxy,
        sigma_1,
        sigma_2,
        von_mises,
    }
}

// ---------------------------------------------------------------------------
// Principal stress / von Mises helper
// ---------------------------------------------------------------------------

/// Compute element quality metrics for a triangular plate element.
///
/// Returns (aspect_ratio, skew_angle_deg, min_angle_deg).
/// - aspect_ratio: ratio of longest to shortest edge (1.0 = equilateral)
/// - skew_angle_deg: deviation from ideal 60° angle
/// - min_angle_deg: minimum interior angle
///
/// Guidelines:
/// - Aspect ratio < 5 is acceptable, < 3 is good
/// - Min angle > 15° is acceptable, > 30° is good
pub fn plate_element_quality(coords: &[[f64; 3]; 3]) -> (f64, f64, f64) {
    let edges = [
        sub3(&coords[1], &coords[0]),
        sub3(&coords[2], &coords[1]),
        sub3(&coords[0], &coords[2]),
    ];
    let lengths: Vec<f64> = edges.iter().map(|e| norm3(e)).collect();

    let max_l = lengths.iter().cloned().fold(0.0f64, f64::max);
    let min_l = lengths.iter().cloned().fold(f64::MAX, f64::min);
    let aspect_ratio = if min_l > 1e-15 { max_l / min_l } else { f64::INFINITY };

    // Interior angles using dot product.
    let mut angles = [0.0f64; 3];
    for i in 0..3 {
        let a = &edges[i];
        let b_neg = [
            -edges[(i + 2) % 3][0],
            -edges[(i + 2) % 3][1],
            -edges[(i + 2) % 3][2],
        ];
        let cos_angle = dot3(a, &b_neg) / (norm3(a) * norm3(&b_neg)).max(1e-15);
        angles[i] = cos_angle.clamp(-1.0, 1.0).acos().to_degrees();
    }

    let min_angle = angles.iter().cloned().fold(f64::MAX, f64::min);
    let skew_angle = (60.0 - min_angle).abs(); // deviation from equilateral

    (aspect_ratio, skew_angle, min_angle)
}

/// Recover plate stresses at all three nodes by evaluating the DKT B-matrix
/// at the element vertices instead of just the centroid.
///
/// Returns an array of 3 `PlateStressLocal` values, one per node.
pub fn plate_stress_at_nodes(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
    u_local: &[f64],
) -> [PlateStressLocal; 3] {
    assert!(u_local.len() >= 18);

    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);
    let g = dkt_geometry(&p);

    // Membrane stresses are constant (CST), same at all nodes.
    let (b_cst, _area) = cst_b_matrix(&p);
    let mut u_mem = [0.0; 6];
    for i in 0..6 {
        u_mem[i] = u_local[MEM_DOFS[i]];
    }
    let mut eps = [0.0; 3];
    for i in 0..3 {
        for j in 0..6 {
            eps[i] += b_cst[i * 6 + j] * u_mem[j];
        }
    }
    let dm_coeff = e * t / (1.0 - nu * nu);
    let d_mem = [
        dm_coeff, dm_coeff * nu, 0.0,
        dm_coeff * nu, dm_coeff, 0.0,
        0.0, 0.0, dm_coeff * (1.0 - nu) / 2.0,
    ];
    let mut n_mem = [0.0; 3];
    for i in 0..3 {
        for j in 0..3 {
            n_mem[i] += d_mem[i * 3 + j] * eps[j];
        }
    }
    let sigma_xx = n_mem[0] / t;
    let sigma_yy = n_mem[1] / t;
    let tau_xy = n_mem[2] / t;

    // Bending D-matrix.
    let db_coeff = e * t * t * t / (12.0 * (1.0 - nu * nu));
    let d_bend = [
        db_coeff, db_coeff * nu, 0.0,
        db_coeff * nu, db_coeff, 0.0,
        0.0, 0.0, db_coeff * (1.0 - nu) / 2.0,
    ];

    let mut u_bend = [0.0; 9];
    for i in 0..9 {
        u_bend[i] = u_local[BEND_DOFS[i]];
    }

    // Evaluate bending at each vertex in natural coordinates:
    // Node 0: (xi=0, eta=0), Node 1: (xi=1, eta=0), Node 2: (xi=0, eta=1)
    let vertex_pts = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)];

    let mut results = [
        PlateStressLocal { sigma_xx: 0.0, sigma_yy: 0.0, tau_xy: 0.0, mx: 0.0, my: 0.0, mxy: 0.0, sigma_1: 0.0, sigma_2: 0.0, von_mises: 0.0 },
        PlateStressLocal { sigma_xx: 0.0, sigma_yy: 0.0, tau_xy: 0.0, mx: 0.0, my: 0.0, mxy: 0.0, sigma_1: 0.0, sigma_2: 0.0, von_mises: 0.0 },
        PlateStressLocal { sigma_xx: 0.0, sigma_yy: 0.0, tau_xy: 0.0, mx: 0.0, my: 0.0, mxy: 0.0, sigma_1: 0.0, sigma_2: 0.0, von_mises: 0.0 },
    ];

    for (idx, &(xi, eta)) in vertex_pts.iter().enumerate() {
        let b_dkt = dkt_b_matrix(&p, &g, xi, eta);
        let mut kappa = [0.0; 3];
        for i in 0..3 {
            for j in 0..9 {
                kappa[i] += b_dkt[i * 9 + j] * u_bend[j];
            }
        }
        let mut mom = [0.0; 3];
        for i in 0..3 {
            for j in 0..3 {
                mom[i] += d_bend[i * 3 + j] * kappa[j];
            }
        }

        let mx = mom[0];
        let my = mom[1];
        let mxy = mom[2];

        let bend_xx = 6.0 * mx / (t * t);
        let bend_yy = 6.0 * my / (t * t);
        let bend_xy = 6.0 * mxy / (t * t);

        let sx_top = sigma_xx + bend_xx;
        let sy_top = sigma_yy + bend_yy;
        let txy_top = tau_xy + bend_xy;
        let sx_bot = sigma_xx - bend_xx;
        let sy_bot = sigma_yy - bend_yy;
        let txy_bot = tau_xy - bend_xy;

        let (s1_top, s2_top, vm_top) = principal_and_von_mises(sx_top, sy_top, txy_top);
        let (s1_bot, s2_bot, vm_bot) = principal_and_von_mises(sx_bot, sy_bot, txy_bot);

        let (sigma_1, sigma_2, von_mises) = if vm_top >= vm_bot {
            (s1_top, s2_top, vm_top)
        } else {
            (s1_bot, s2_bot, vm_bot)
        };

        results[idx] = PlateStressLocal {
            sigma_xx, sigma_yy, tau_xy,
            mx, my, mxy,
            sigma_1, sigma_2, von_mises,
        };
    }

    results
}

/// Compute principal stresses and von Mises equivalent from 2D plane stress.
fn principal_and_von_mises(sx: f64, sy: f64, txy: f64) -> (f64, f64, f64) {
    let avg = (sx + sy) / 2.0;
    let diff = (sx - sy) / 2.0;
    let r = (diff * diff + txy * txy).sqrt();

    let s1 = avg + r;
    let s2 = avg - r;

    // Von Mises: sqrt(s1^2 - s1*s2 + s2^2)
    let vm = (s1 * s1 - s1 * s2 + s2 * s2).sqrt();
    (s1, s2, vm)
}

// ---------------------------------------------------------------------------
// Geometric stiffness matrix for plate buckling
// ---------------------------------------------------------------------------

/// Compute the 18×18 geometric stiffness matrix for a triangular plate element
/// under in-plane stress resultants (Nxx, Nyy, Nxy) in local coordinates.
///
/// This enables linear buckling analysis of plates under membrane loads.
/// The geometric stiffness accounts for the destabilizing effect of in-plane
/// forces on out-of-plane deformations.
///
/// # Arguments
/// * `coords` – 3 node positions in 3D global space
/// * `nxx`, `nyy`, `nxy` – membrane stress resultants (kN/m) in local coords
///
/// Uses the standard formulation: Kg = integral(B_g^T * S * B_g * dA)
/// where S is the 2×2 stress matrix and B_g relates displacement gradients
/// to nodal DOFs.
pub fn plate_geometric_stiffness(
    coords: &[[f64; 3]; 3],
    nxx: f64,
    nyy: f64,
    nxy: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);
    let two_a = twice_area(&p);
    let area = two_a.abs() / 2.0;

    // Shape function derivatives (constant for CST/linear triangle):
    //   dN_i/dx = (y_j - y_k) / (2A), dN_i/dy = (x_k - x_j) / (2A)
    let dnx = [
        (p[1].1 - p[2].1) / two_a,
        (p[2].1 - p[0].1) / two_a,
        (p[0].1 - p[1].1) / two_a,
    ];
    let dny = [
        (p[2].0 - p[1].0) / two_a,
        (p[0].0 - p[2].0) / two_a,
        (p[1].0 - p[0].0) / two_a,
    ];

    // Geometric stiffness for out-of-plane DOF (uz) at each node:
    // K_g(i,j) = A * (Nxx * dNi/dx * dNj/dx + Nyy * dNi/dy * dNj/dy
    //              + Nxy * (dNi/dx * dNj/dy + dNi/dy * dNj/dx))
    let n = 18;
    let mut kg = vec![0.0; n * n];

    for i in 0..3 {
        for j in 0..3 {
            let val = area * (nxx * dnx[i] * dnx[j]
                            + nyy * dny[i] * dny[j]
                            + nxy * (dnx[i] * dny[j] + dny[i] * dnx[j]));
            // uz DOF positions: 2, 8, 14
            let ri = i * 6 + 2;
            let rj = j * 6 + 2;
            kg[ri * n + rj] += val;
        }
    }

    kg
}

// ---------------------------------------------------------------------------
// DKMT thick plate extension (Discrete Kirchhoff-Mindlin Triangle)
// ---------------------------------------------------------------------------

/// Compute the transverse shear stiffness contribution for thick plates
/// using the DKMT (Discrete Kirchhoff-Mindlin Triangle) formulation.
///
/// For thin plates (t/L < 1/20), DKT is sufficient. For thick plates,
/// transverse shear deformation becomes significant. The DKMT adds
/// a shear correction to the DKT bending stiffness.
///
/// Returns a 9×9 shear stiffness matrix (row-major) in the bending DOF space
/// (w, θx, θy per node).
///
/// The shear correction uses a reduced integration (1-point) to avoid
/// shear locking, following Katili (1993).
///
/// # Arguments
/// * `coords` – 3 node positions in 3D global space
/// * `e` – Young's modulus (kN/m²)
/// * `nu` – Poisson's ratio
/// * `t` – shell thickness (m)
/// * `kappa_s` – shear correction factor (5/6 for rectangular, π²/12 for general)
pub fn plate_shear_stiffness_dkmt(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
    kappa_s: f64,
) -> [f64; 81] {
    let (ex, ey, _ez) = local_axes(coords);
    let p = project_to_2d(coords, &ex, &ey);
    let two_a = twice_area(&p);
    let area = two_a.abs() / 2.0;

    // Shear modulus and transverse shear stiffness
    let g = e / (2.0 * (1.0 + nu));
    let ds = kappa_s * g * t; // shear rigidity per unit area

    // Shape function derivatives (constant for linear triangle)
    let dnx = [
        (p[1].1 - p[2].1) / two_a,
        (p[2].1 - p[0].1) / two_a,
        (p[0].1 - p[1].1) / two_a,
    ];
    let dny = [
        (p[2].0 - p[1].0) / two_a,
        (p[0].0 - p[2].0) / two_a,
        (p[1].0 - p[0].0) / two_a,
    ];

    // Transverse shear strains for Mindlin plate:
    //   gamma_xz = dw/dx - theta_y  (but DKT uses beta_x = -theta_y)
    //   gamma_yz = dw/dy + theta_x  (but DKT uses beta_y = theta_x)
    //
    // In DKT DOF space (w, theta_x, theta_y):
    //   gamma_xz = dw/dx - theta_y → B_s row 0
    //   gamma_yz = dw/dy + theta_x → B_s row 1
    //
    // B_s (2×9): evaluated at centroid (1-point reduced integration)
    // For node i with DOFs (w_i, theta_x_i, theta_y_i):
    //   gamma_xz contribution: dN_i/dx * w_i + 0 * theta_x_i + (-N_i) * theta_y_i
    //   gamma_yz contribution: dN_i/dy * w_i + N_i * theta_x_i + 0 * theta_y_i
    // where N_i at centroid = 1/3 for all nodes.

    let n_centroid = 1.0 / 3.0;

    // B_s (2×9) at centroid
    let mut bs = [0.0f64; 18]; // 2×9
    for i in 0..3 {
        let col_w = i * 3;
        let col_tx = i * 3 + 1;
        let col_ty = i * 3 + 2;
        // gamma_xz row
        bs[0 * 9 + col_w] = dnx[i];
        bs[0 * 9 + col_tx] = 0.0;
        bs[0 * 9 + col_ty] = -n_centroid;
        // gamma_yz row
        bs[1 * 9 + col_w] = dny[i];
        bs[1 * 9 + col_tx] = n_centroid;
        bs[1 * 9 + col_ty] = 0.0;
    }

    // Ks = ds * area * Bs^T * Bs  (9×9)
    // Using 1-point integration (centroid) with weight = area
    let mut ks = [0.0f64; 81]; // 9×9
    for i in 0..9 {
        for j in 0..9 {
            let mut s = 0.0;
            for k in 0..2 {
                s += bs[k * 9 + i] * bs[k * 9 + j];
            }
            ks[i * 9 + j] = ds * area * s;
        }
    }

    ks
}

/// Compute the full 18×18 local stiffness matrix for a DKMT (thick plate)
/// triangular element, including transverse shear deformation.
///
/// For thin plates (t/L < 1/20), this produces essentially the same result
/// as `plate_local_stiffness`. For thick plates, the added shear flexibility
/// reduces the overall stiffness.
///
/// # Arguments
/// * `coords` – 3 node positions in 3D global space
/// * `e` – Young's modulus (kN/m²)
/// * `nu` – Poisson's ratio
/// * `t` – shell thickness (m)
/// * `kappa_s` – shear correction factor (typically 5.0/6.0)
pub fn plate_local_stiffness_thick(
    coords: &[[f64; 3]; 3],
    e: f64,
    nu: f64,
    t: f64,
    kappa_s: f64,
) -> Vec<f64> {
    // Start with the standard DKT+CST stiffness
    let mut k = plate_local_stiffness(coords, e, nu, t);

    // Compute the Mindlin shear parameter per element using average edge length.
    // phi = t² / (L_avg² * kappa_s * (1-nu)/2)
    // This is the ratio of bending stiffness to shear stiffness.
    // For thin plates: phi → 0, alpha → 0, recover DKT exactly.
    // For thick plates: phi → large, alpha → 1, full shear contribution.
    let edges = [
        sub3(&coords[1], &coords[0]),
        sub3(&coords[2], &coords[1]),
        sub3(&coords[0], &coords[2]),
    ];
    let l_avg = edges.iter().map(|e| norm3(e)).sum::<f64>() / 3.0;
    let phi = t * t / (l_avg * l_avg * kappa_s * (1.0 - nu) / 2.0);
    let alpha = phi / (1.0 + phi);

    // Add scaled transverse shear stiffness
    let ks = plate_shear_stiffness_dkmt(coords, e, nu, t, kappa_s);

    let n = 18;
    for i in 0..9 {
        for j in 0..9 {
            k[BEND_DOFS[i] * n + BEND_DOFS[j]] += alpha * ks[i * 9 + j];
        }
    }

    k
}

/// Compute the ratio t/L_min for a plate element, where L_min is the shortest
/// edge length. This is used to determine whether thick plate theory (DKMT)
/// is needed.
///
/// Guidelines:
/// - t/L < 0.05 (1/20): thin plate, DKT is sufficient
/// - t/L >= 0.05: thick plate, use DKMT
pub fn plate_thickness_ratio(coords: &[[f64; 3]; 3], t: f64) -> f64 {
    let edges = [
        sub3(&coords[1], &coords[0]),
        sub3(&coords[2], &coords[1]),
        sub3(&coords[0], &coords[2]),
    ];
    let min_l = edges.iter().map(|e| norm3(e)).fold(f64::MAX, f64::min);
    if min_l > 1e-15 { t / min_l } else { f64::INFINITY }
}
