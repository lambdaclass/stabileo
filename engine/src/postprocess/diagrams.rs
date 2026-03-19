use crate::types::*;
use serde::{Deserialize, Serialize};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramPoint {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDiagram {
    pub element_id: usize,
    pub points: Vec<DiagramPoint>,
    pub max_value: f64,
    pub min_value: f64,
    pub max_abs_t: f64,
    pub max_abs_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramResults {
    pub moment: Vec<ElementDiagram>,
    pub shear: Vec<ElementDiagram>,
    pub axial: Vec<ElementDiagram>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeformedPoint {
    pub x: f64,
    pub y: f64,
}

const NUM_POINTS: usize = 21;

// ==================== Sampling ====================

fn build_sampling_positions(
    length: f64,
    point_loads: &[PointLoadInfo],
) -> Vec<f64> {
    let mut positions = std::collections::BTreeSet::new();

    // Regular grid
    for i in 0..NUM_POINTS {
        let t = i as f64 / (NUM_POINTS - 1) as f64;
        // Use integer-keyed representation to avoid f64 in BTreeSet
        positions.insert((t * 1e12) as i64);
    }

    // Around point loads
    let eps = 1e-6;
    for pl in point_loads {
        let t_pl = pl.a / length;
        if t_pl > eps {
            positions.insert(((t_pl - eps) * 1e12) as i64);
        }
        positions.insert((t_pl * 1e12) as i64);
        if t_pl < 1.0 - eps {
            positions.insert(((t_pl + eps) * 1e12) as i64);
        }
    }

    positions.into_iter().map(|k| k as f64 / 1e12).collect()
}

// ==================== Diagram Value At ====================

/// Compute the value of a diagram (M, V, or N) at a given normalized position t.
pub fn compute_diagram_value_at(
    kind: &str,
    t: f64,
    ef: &ElementForces,
) -> f64 {
    let xi = t * ef.length;

    let v_start = ef.v_start;
    let m_start = ef.m_start;

    // Build distributed loads list
    let d_loads: Vec<&DistributedLoadInfo> = if !ef.distributed_loads.is_empty() {
        ef.distributed_loads.iter().collect()
    } else if ef.q_i.abs() > 1e-10 || ef.q_j.abs() > 1e-10 {
        Vec::new()
    } else {
        Vec::new()
    };
    let use_legacy_q = ef.distributed_loads.is_empty() && (ef.q_i.abs() > 1e-10 || ef.q_j.abs() > 1e-10);

    match kind {
        "moment" => {
            let mut value = m_start - v_start * xi;

            // Distributed load contributions
            if use_legacy_q {
                let dq = ef.q_j - ef.q_i;
                value -= ef.q_i * xi * xi / 2.0 + dq * xi * xi * xi / (6.0 * ef.length);
            }
            for dl in &d_loads {
                if xi > dl.a + 1e-10 {
                    let x_end = xi.min(dl.b);
                    let s = x_end - dl.a;
                    let span = dl.b - dl.a;
                    if span < 1e-12 || s < 1e-12 { continue; }
                    let dq = (dl.q_j - dl.q_i) / span;
                    let d = xi - dl.a;
                    value -= dl.q_i * (d * s - s * s / 2.0)
                           + dq * (d * s * s / 2.0 - s * s * s / 3.0);
                }
            }

            // Point loads
            let mut sorted_pl = ef.point_loads.clone();
            sorted_pl.sort_by(|a, b| a.a.partial_cmp(&b.a).unwrap());
            for pl in &sorted_pl {
                if pl.a < xi - 1e-10 {
                    value -= pl.p * (xi - pl.a);
                    if let Some(mz) = pl.my {
                        value -= mz;
                    }
                }
            }
            value
        }
        "shear" => {
            let mut value = v_start;

            if use_legacy_q {
                let dq = ef.q_j - ef.q_i;
                value += ef.q_i * xi + dq * xi * xi / (2.0 * ef.length);
            }
            for dl in &d_loads {
                if xi > dl.a + 1e-10 {
                    let x_end = xi.min(dl.b);
                    let s = x_end - dl.a;
                    let span = dl.b - dl.a;
                    if span < 1e-12 || s < 1e-12 { continue; }
                    let dq = (dl.q_j - dl.q_i) / span;
                    value += dl.q_i * s + dq * s * s / 2.0;
                }
            }

            let mut sorted_pl = ef.point_loads.clone();
            sorted_pl.sort_by(|a, b| a.a.partial_cmp(&b.a).unwrap());
            for pl in &sorted_pl {
                if pl.a < xi - 1e-10 {
                    value += pl.p;
                }
            }
            value
        }
        "axial" => {
            let n_start = ef.n_start;
            let n_end = ef.n_end;
            let mut value = n_start + t * (n_end - n_start);
            let mut sorted_pl = ef.point_loads.clone();
            sorted_pl.sort_by(|a, b| a.a.partial_cmp(&b.a).unwrap());
            for pl in &sorted_pl {
                if let Some(px) = pl.px {
                    if pl.a < xi - 1e-10 {
                        value += px;
                    }
                }
            }
            value
        }
        _ => 0.0,
    }
}

// ==================== 2D Diagrams ====================

fn compute_single_diagram(
    kind: &str,
    ef: &ElementForces,
    node_ix: f64,
    node_iy: f64,
    node_jx: f64,
    node_jy: f64,
) -> ElementDiagram {
    let has_axial_pl = kind == "axial" && ef.point_loads.iter().any(|pl| pl.px.map_or(false, |px| px.abs() > 1e-15));
    let positions = if kind == "axial" && !has_axial_pl {
        (0..NUM_POINTS).map(|i| i as f64 / (NUM_POINTS - 1) as f64).collect()
    } else {
        build_sampling_positions(ef.length, &ef.point_loads)
    };

    let mut points = Vec::new();
    let mut max_val = f64::NEG_INFINITY;
    let mut min_val = f64::INFINITY;
    let mut max_abs_t = 0.0;
    let mut max_abs_value: f64 = 0.0;

    for &t in &positions {
        let value = compute_diagram_value_at(kind, t, ef);
        let x = node_ix + t * (node_jx - node_ix);
        let y = node_iy + t * (node_jy - node_iy);

        points.push(DiagramPoint { t, x, y, value });

        if value > max_val { max_val = value; }
        if value < min_val { min_val = value; }
        if value.abs() > max_abs_value.abs() {
            max_abs_t = t;
            max_abs_value = value;
        }
    }

    ElementDiagram {
        element_id: ef.element_id,
        points,
        max_value: max_val,
        min_value: min_val,
        max_abs_t,
        max_abs_value,
    }
}

/// Compute all 2D diagrams (M, V, N) for all elements.
pub fn compute_diagrams_2d(
    input: &SolverInput,
    results: &AnalysisResults,
) -> DiagramResults {
    let mut moment = Vec::new();
    let mut shear = Vec::new();
    let mut axial = Vec::new();

    for ef in &results.element_forces {
        let elem = input.elements.values().find(|e| e.id == ef.element_id);
        let (node_ix, node_iy, node_jx, node_jy) = if let Some(elem) = elem {
            let ni = input.nodes.values().find(|n| n.id == elem.node_i);
            let nj = input.nodes.values().find(|n| n.id == elem.node_j);
            match (ni, nj) {
                (Some(ni), Some(nj)) => (ni.x, ni.z, nj.x, nj.z),
                _ => (0.0, 0.0, ef.length, 0.0),
            }
        } else {
            (0.0, 0.0, ef.length, 0.0)
        };

        moment.push(compute_single_diagram("moment", ef, node_ix, node_iy, node_jx, node_jy));
        shear.push(compute_single_diagram("shear", ef, node_ix, node_iy, node_jx, node_jy));
        axial.push(compute_single_diagram("axial", ef, node_ix, node_iy, node_jx, node_jy));
    }

    DiagramResults { moment, shear, axial }
}

// ==================== Deformed Shape ====================

/// Compute deformed shape for a 2D element using Hermite cubic + particular solution.
pub fn compute_deformed_shape(
    node_ix: f64, node_iy: f64,
    node_jx: f64, node_jy: f64,
    u_ix: f64, u_iy: f64, r_iz: f64,
    u_jx: f64, u_jy: f64, r_jz: f64,
    scale: f64,
    length: f64,
    hinge_start: bool,
    hinge_end: bool,
    ei: Option<f64>,
    load_qi: Option<f64>,
    load_qj: Option<f64>,
    load_points: &[(f64, f64)], // (a, p)
    dist_loads: &[(f64, f64, f64, f64)], // (qi, qj, a, b)
) -> Vec<DeformedPoint> {
    let l = length;
    let cos = (node_jx - node_ix) / l;
    let sin = (node_jy - node_iy) / l;

    // Transform to local
    let v_i = -u_ix * sin + u_iy * cos;
    let v_j = -u_jx * sin + u_jy * cos;
    let u_i = u_ix * cos + u_iy * sin;
    let u_j = u_jx * cos + u_jy * sin;

    let l2 = l * l;
    let l3 = l2 * l;

    // Build distributed loads list
    let mut all_dist: Vec<(f64, f64, f64, f64)> = Vec::new();
    if !dist_loads.is_empty() {
        all_dist.extend_from_slice(dist_loads);
    } else {
        let q0 = load_qi.unwrap_or(0.0);
        let q1 = load_qj.unwrap_or(0.0);
        if q0.abs() > 1e-10 || q1.abs() > 1e-10 {
            all_dist.push((q0, q1, 0.0, l));
        }
    }

    let has_dist = !all_dist.is_empty();
    let has_pt = !load_points.is_empty();
    let ei_val = ei.unwrap_or(0.0);
    let has_loads = ei_val > 1e-6 && (has_dist || has_pt);

    // Compute v''_p at 0 and L
    let mut vpp_p0 = 0.0;
    let mut vpp_pl = 0.0;

    if has_loads {
        for &(qi, qj, a, b) in &all_dist {
            let is_full = a < 1e-10 && (b - l).abs() < 1e-10;
            if is_full {
                vpp_p0 += l2 * (4.0 * qi + qj) / (60.0 * ei_val);
                vpp_pl += l2 * (qi + 4.0 * qj) / (60.0 * ei_val);
            } else {
                // Simpson's rule
                let n_simp = 20;
                let span = b - a;
                if span < 1e-12 { continue; }
                let h = span / n_simp as f64;
                for j in 0..=n_simp {
                    let t = j as f64 / n_simp as f64;
                    let x_load = a + t * span;
                    let q_at = qi + (qj - qi) * t;
                    let w = if j == 0 || j == n_simp { h / 3.0 }
                        else if j % 2 == 1 { 4.0 * h / 3.0 }
                        else { 2.0 * h / 3.0 };
                    let dp = q_at * w;
                    if dp.abs() < 1e-15 { continue; }
                    let bp = l - x_load;
                    vpp_p0 += dp * x_load * bp * bp / (ei_val * l2);
                    vpp_pl += dp * x_load * x_load * bp / (ei_val * l2);
                }
            }
        }

        for &(a_pt, p) in load_points {
            let bp = l - a_pt;
            vpp_p0 += p * a_pt * bp * bp / (ei_val * l2);
            vpp_pl += p * a_pt * a_pt * bp / (ei_val * l2);
        }
    }

    // Adjust rotations for hinges
    let dv = v_j - v_i;
    let mut theta_i = r_iz;
    let mut theta_j = r_jz;

    if hinge_start && hinge_end {
        theta_i = dv / l + l * vpp_p0 / 3.0 + l * vpp_pl / 6.0;
        theta_j = dv / l - l * vpp_p0 / 6.0 - l * vpp_pl / 3.0;
    } else if hinge_start {
        theta_i = 3.0 * dv / (2.0 * l) - theta_j / 2.0 + l * vpp_p0 / 4.0;
    } else if hinge_end {
        theta_j = 3.0 * dv / (2.0 * l) - theta_i / 2.0 - l * vpp_pl / 4.0;
    }

    let n_pts = 21;
    let mut points = Vec::with_capacity(n_pts);

    for i in 0..n_pts {
        let xi = i as f64 / (n_pts - 1) as f64;
        let x = xi * l;
        let xi2 = xi * xi;
        let xi3 = xi2 * xi;

        // Hermite shape functions
        let n1 = 1.0 - 3.0 * xi2 + 2.0 * xi3;
        let n2 = (xi - 2.0 * xi2 + xi3) * l;
        let n3 = 3.0 * xi2 - 2.0 * xi3;
        let n4 = (-xi2 + xi3) * l;

        let mut v_local = n1 * v_i + n2 * theta_i + n3 * v_j + n4 * theta_j;

        // Add particular solution
        if has_loads {
            let mut vp = 0.0;

            for &(qi, qj, a, b) in &all_dist {
                let is_full = a < 1e-10 && (b - l).abs() < 1e-10;
                if is_full {
                    let lmx = l - x;
                    let x2lmx2 = x * x * lmx * lmx;
                    vp += x2lmx2 * (qi / 24.0 + (qj - qi) * (l + x) / (120.0 * l)) / ei_val;
                } else {
                    let n_simp = 20;
                    let span = b - a;
                    if span < 1e-12 { continue; }
                    let h = span / n_simp as f64;
                    for j in 0..=n_simp {
                        let t = j as f64 / n_simp as f64;
                        let x_load = a + t * span;
                        let q_at = qi + (qj - qi) * t;
                        let w = if j == 0 || j == n_simp { h / 3.0 }
                            else if j % 2 == 1 { 4.0 * h / 3.0 }
                            else { 2.0 * h / 3.0 };
                        let dp = q_at * w;
                        if dp.abs() < 1e-15 { continue; }
                        let ap = x_load;
                        let bp = l - x_load;
                        if x <= x_load {
                            vp += dp * bp * bp * x * x * (3.0 * ap * l - x * (3.0 * ap + bp)) / (6.0 * ei_val * l3);
                        } else {
                            let lmx = l - x;
                            vp += dp * ap * ap * lmx * lmx * (3.0 * bp * l - lmx * (3.0 * bp + ap)) / (6.0 * ei_val * l3);
                        }
                    }
                }
            }

            for &(a_pt, p) in load_points {
                let bp = l - a_pt;
                if x <= a_pt {
                    vp += p * bp * bp * x * x * (3.0 * a_pt * l - x * (3.0 * a_pt + bp)) / (6.0 * ei_val * l3);
                } else {
                    let lmx = l - x;
                    vp += p * a_pt * a_pt * lmx * lmx * (3.0 * bp * l - lmx * (3.0 * bp + a_pt)) / (6.0 * ei_val * l3);
                }
            }

            v_local += vp;
        }

        // Axial (linear)
        let u_local = u_i + xi * (u_j - u_i);

        // Transform back to global
        let base_x = node_ix + xi * (node_jx - node_ix);
        let base_y = node_iy + xi * (node_jy - node_iy);

        let dx = u_local * cos - v_local * sin;
        let dy = u_local * sin + v_local * cos;

        points.push(DeformedPoint {
            x: base_x + dx * scale,
            y: base_y + dy * scale,
        });
    }

    points
}
