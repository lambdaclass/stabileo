//! Steel connection design checks per AISC 360 (LRFD).
//!
//! Supports bolt group and fillet weld group capacity analysis
//! using the elastic method (instantaneous center for bolt groups).

use serde::{Deserialize, Serialize};

// ==================== Bolt Group Types ====================

/// A single bolt position in the group.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoltPosition {
    /// X coordinate from group centroid (m)
    pub x: f64,
    /// Y coordinate from group centroid (m)
    pub y: f64,
}

/// Bolt group connection data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoltGroupData {
    pub connection_id: usize,
    /// Bolt positions (coordinates relative to centroid)
    pub bolts: Vec<BoltPosition>,
    /// Nominal bolt shear strength per bolt Rn (N)
    pub rn_shear: f64,
    /// Nominal bolt bearing strength per bolt Rn (N)
    #[serde(default)]
    pub rn_bearing: Option<f64>,
    /// phi factor (default 0.75 for bolt shear)
    #[serde(default)]
    pub phi: Option<f64>,
}

/// Applied forces on a bolt group.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoltGroupForces {
    pub connection_id: usize,
    /// Shear in X direction (N)
    pub vx: f64,
    /// Shear in Y direction (N)
    pub vy: f64,
    /// Moment about centroid (N-m)
    #[serde(default)]
    pub m: Option<f64>,
}

/// Input for bolt group check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoltGroupInput {
    pub groups: Vec<BoltGroupData>,
    pub forces: Vec<BoltGroupForces>,
}

/// Result of bolt group check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoltGroupResult {
    pub connection_id: usize,
    /// Unity ratio (max bolt force / phi*Rn)
    pub unity_ratio: f64,
    /// Maximum bolt force (N)
    pub max_bolt_force: f64,
    /// Available strength per bolt phi*Rn (N)
    pub phi_rn: f64,
    /// Centroid X of bolt group (m)
    pub centroid_x: f64,
    /// Centroid Y of bolt group (m)
    pub centroid_y: f64,
    /// Polar moment of inertia of bolt group (m²)
    pub ip: f64,
    /// Index of most loaded bolt (0-based)
    pub critical_bolt: usize,
}

// ==================== Weld Group Types ====================

/// A fillet weld segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeldSegment {
    /// Start X (m)
    pub x1: f64,
    /// Start Y (m)
    pub y1: f64,
    /// End X (m)
    pub x2: f64,
    /// End Y (m)
    pub y2: f64,
    /// Weld leg size (m)
    pub size: f64,
    /// Whether the segment is an END-LOADED fillet — parallel to the force
    /// and at the end of a loaded member (AISC 360-22 J2.2b(d); CIRSOC
    /// 301-2018 §J.2.2(b), eq. J.2.1). Only end-loaded fillets get the
    /// effective-length reduction β.
    ///
    /// `None` is treated as end-loaded: the reduction is the conservative
    /// side (β ≤ 1), and a segment list cannot tell how the joint is
    /// loaded. Pass `Some(false)` for welds the code does not discount
    /// (e.g. web-to-flange welds of a girder, loaded along their length).
    #[serde(default)]
    pub end_loaded: Option<bool>,
}

/// Effective-length factor of an end-loaded fillet weld,
/// AISC 360-22 J2.2b(d) / CIRSOC 301-2018 §J.2.2(b):
///
/// * `l ≤ 100 w`: β = 1;
/// * `100 w < l ≤ 300 w`: β = 1.2 − 0.002·(l/w) ≤ 1.0   (AISC J2-1, CIRSOC J.2.1);
/// * `l > 300 w`: the effective length is 180 w, i.e. β = 180 w / l.
///
/// Returns 1 for a segment that is not end-loaded or has no size.
pub fn end_loaded_beta(length: f64, size: f64, end_loaded: bool) -> f64 {
    if !end_loaded || size <= 0.0 || length <= 0.0 {
        return 1.0;
    }
    let ratio = length / size;
    if ratio <= 100.0 {
        1.0
    } else if ratio <= 300.0 {
        (1.2 - 0.002 * ratio).min(1.0)
    } else {
        180.0 * size / length
    }
}

/// Weld group connection data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeldGroupData {
    pub connection_id: usize,
    pub segments: Vec<WeldSegment>,
    /// Electrode strength FEXX (Pa, e.g. 482e6 for E70XX)
    pub fexx: f64,
    /// phi factor (default 0.75)
    #[serde(default)]
    pub phi: Option<f64>,
}

/// Applied forces on a weld group.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeldGroupForces {
    pub connection_id: usize,
    pub vx: f64,
    pub vy: f64,
    #[serde(default)]
    pub m: Option<f64>,
}

/// Input for weld group check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeldGroupInput {
    pub groups: Vec<WeldGroupData>,
    pub forces: Vec<WeldGroupForces>,
}

/// Result of weld group check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeldGroupResult {
    pub connection_id: usize,
    /// Unity ratio (max stress / phi*Fnw)
    pub unity_ratio: f64,
    /// Maximum weld stress (Pa)
    pub max_weld_stress: f64,
    /// Available weld strength phi*Fnw (Pa)
    pub phi_fnw: f64,
    /// Total weld length (m)
    pub total_length: f64,
    /// Total EFFECTIVE throat area (m²): Σ 0.707·w·β·l.
    pub total_throat_area: f64,
    /// Smallest end-loaded length factor β over the segments
    /// (J2.2b(d)); 1 when no segment is long enough to be reduced.
    #[serde(default = "one")]
    pub min_beta: f64,
}

fn one() -> f64 {
    1.0
}

// ==================== Bolt Group Elastic Method ====================

/// Check bolt groups using the elastic method.
pub fn check_bolt_groups(input: &BoltGroupInput) -> Vec<BoltGroupResult> {
    let mut results = Vec::new();

    for group in &input.groups {
        let forces = input
            .forces
            .iter()
            .find(|f| f.connection_id == group.connection_id);
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_bolt_group(group, forces));
    }

    results.sort_by_key(|r| r.connection_id);
    results
}

fn check_single_bolt_group(group: &BoltGroupData, forces: &BoltGroupForces) -> BoltGroupResult {
    let n = group.bolts.len();
    let phi = group.phi.unwrap_or(0.75);

    if n == 0 {
        return BoltGroupResult {
            connection_id: group.connection_id,
            unity_ratio: 0.0,
            max_bolt_force: 0.0,
            phi_rn: phi * group.rn_shear,
            centroid_x: 0.0,
            centroid_y: 0.0,
            ip: 0.0,
            critical_bolt: 0,
        };
    }

    // Centroid (bolts are already relative to centroid, but verify)
    let cx: f64 = group.bolts.iter().map(|b| b.x).sum::<f64>() / n as f64;
    let cy: f64 = group.bolts.iter().map(|b| b.y).sum::<f64>() / n as f64;

    // Polar moment of inertia about centroid
    let ip: f64 = group
        .bolts
        .iter()
        .map(|b| {
            let dx = b.x - cx;
            let dy = b.y - cy;
            dx * dx + dy * dy
        })
        .sum();

    let phi_rn = phi * group.rn_shear.min(group.rn_bearing.unwrap_or(f64::INFINITY));
    let m = forces.m.unwrap_or(0.0);

    // Find most loaded bolt
    let mut max_force = 0.0_f64;
    let mut critical = 0;

    for (i, bolt) in group.bolts.iter().enumerate() {
        let dx = bolt.x - cx;
        let dy = bolt.y - cy;

        // Direct shear component (shared equally)
        let fx_direct = forces.vx / n as f64;
        let fy_direct = forces.vy / n as f64;

        // Moment-induced component (proportional to distance from centroid)
        let (fx_moment, fy_moment) = if ip > 0.0 {
            // Force perpendicular to radius, magnitude = M * r / Ip
            let fx_m = -m * dy / ip;
            let fy_m = m * dx / ip;
            (fx_m, fy_m)
        } else {
            (0.0, 0.0)
        };

        let fx_total = fx_direct + fx_moment;
        let fy_total = fy_direct + fy_moment;
        let force = (fx_total * fx_total + fy_total * fy_total).sqrt();

        if force > max_force {
            max_force = force;
            critical = i;
        }
    }

    let unity_ratio = if phi_rn > 0.0 {
        max_force / phi_rn
    } else {
        0.0
    };

    BoltGroupResult {
        connection_id: group.connection_id,
        unity_ratio,
        max_bolt_force: max_force,
        phi_rn,
        centroid_x: cx,
        centroid_y: cy,
        ip,
        critical_bolt: critical,
    }
}

// ==================== Weld Group Elastic Method ====================

/// Check weld groups using the elastic method.
pub fn check_weld_groups(input: &WeldGroupInput) -> Vec<WeldGroupResult> {
    let mut results = Vec::new();

    for group in &input.groups {
        let forces = input
            .forces
            .iter()
            .find(|f| f.connection_id == group.connection_id);
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_weld_group(group, forces));
    }

    results.sort_by_key(|r| r.connection_id);
    results
}

fn check_single_weld_group(group: &WeldGroupData, forces: &WeldGroupForces) -> WeldGroupResult {
    let phi = group.phi.unwrap_or(0.75);

    // AISC J2.4: Fnw = 0.60 * FEXX for fillet welds
    let fnw = 0.60 * group.fexx;
    let phi_fnw = phi * fnw;

    // Compute weld properties
    let mut total_length = 0.0_f64;
    let mut total_throat_area = 0.0_f64;
    let mut weld_cx = 0.0_f64;
    let mut weld_cy = 0.0_f64;

    // Throat = 0.707 * leg size for equal-leg fillet welds
    struct SegProps {
        length: f64,
        /// Effective throat (0.707·w·β): β of J2.2b(d) reduces the
        /// effective length, which for the elastic method is the same as
        /// thinning the segment's throat uniformly — its area, centroid
        /// weight and inertia all scale by β, and the stress computed on
        /// the reduced area is checked against φ·Fnw unchanged.
        throat: f64,
        throat_area: f64,
        mid_x: f64,
        mid_y: f64,
    }

    let seg_props: Vec<SegProps> = group
        .segments
        .iter()
        .map(|s| {
            let dx = s.x2 - s.x1;
            let dy = s.y2 - s.y1;
            let length = (dx * dx + dy * dy).sqrt();
            let beta = end_loaded_beta(length, s.size, s.end_loaded.unwrap_or(true));
            let throat = 0.707 * s.size * beta;
            let throat_area = throat * length;
            let mid_x = (s.x1 + s.x2) / 2.0;
            let mid_y = (s.y1 + s.y2) / 2.0;
            SegProps {
                length,
                throat,
                throat_area,
                mid_x,
                mid_y,
            }
        })
        .collect();

    for sp in &seg_props {
        total_length += sp.length;
        total_throat_area += sp.throat_area;
        weld_cx += sp.throat_area * sp.mid_x;
        weld_cy += sp.throat_area * sp.mid_y;
    }

    let min_beta = group
        .segments
        .iter()
        .zip(&seg_props)
        .map(|(s, sp)| end_loaded_beta(sp.length, s.size, s.end_loaded.unwrap_or(true)))
        .fold(1.0_f64, f64::min);

    if total_throat_area <= 0.0 {
        return WeldGroupResult {
            connection_id: group.connection_id,
            unity_ratio: 0.0,
            max_weld_stress: 0.0,
            phi_fnw,
            total_length,
            total_throat_area,
            min_beta,
        };
    }

    weld_cx /= total_throat_area;
    weld_cy /= total_throat_area;

    // Polar moment of weld group about centroid (using line property: Ip = sum(A_i * r_i²))
    let mut ip = 0.0_f64;
    for (i, sp) in seg_props.iter().enumerate() {
        let seg = &group.segments[i];
        let throat = sp.throat;

        // Use segment midpoint for simplicity (elastic method approximation)
        let dx = sp.mid_x - weld_cx;
        let dy = sp.mid_y - weld_cy;
        ip += sp.throat_area * (dx * dx + dy * dy);

        // Add self-inertia of segment (Ix + Iy about its own centroid)
        let seg_dx = seg.x2 - seg.x1;
        let seg_dy = seg.y2 - seg.y1;
        let self_ix = throat * sp.length * sp.length * sp.length / 12.0;
        let _norm = sp.length;
        if sp.length > 0.0 {
            // Project self-inertia
            let cos_a = seg_dx / sp.length;
            let sin_a = seg_dy / sp.length;
            ip += self_ix * (sin_a * sin_a + cos_a * cos_a); // = self_ix always
        }
    }

    let m = forces.m.unwrap_or(0.0);

    // Direct stress
    let fx_direct = forces.vx / total_throat_area;
    let fy_direct = forces.vy / total_throat_area;

    // Find max stress point (check segment endpoints)
    let mut max_stress = 0.0_f64;

    for seg in &group.segments {
        for (px, py) in [(seg.x1, seg.y1), (seg.x2, seg.y2)] {
            let dx = px - weld_cx;
            let dy = py - weld_cy;

            let (fx_m, fy_m) = if ip > 0.0 {
                (-m * dy / ip, m * dx / ip)
            } else {
                (0.0, 0.0)
            };

            let fx = fx_direct + fx_m;
            let fy = fy_direct + fy_m;
            let stress = (fx * fx + fy * fy).sqrt();
            max_stress = max_stress.max(stress);
        }
    }

    let unity_ratio = if phi_fnw > 0.0 {
        max_stress / phi_fnw
    } else {
        0.0
    };

    WeldGroupResult {
        connection_id: group.connection_id,
        unity_ratio,
        max_weld_stress: max_stress,
        phi_fnw,
        total_length,
        total_throat_area,
        min_beta,
    }
}
