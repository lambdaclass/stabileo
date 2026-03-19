//! Cross-section property calculator.
//!
//! Computes geometric properties (area, centroid, moments of inertia, section moduli,
//! plastic moduli, torsion constant) from polygon vertices or compound sections.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// A single polygon region of a cross-section.
/// Vertices are ordered counter-clockwise for positive area.
/// Local section coordinates: Y = width/depth, Z = height (standard section convention).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionPolygon {
    /// Y-Z coordinate pairs of vertices (closed polygon, last vertex connects to first)
    pub vertices: Vec<[f64; 2]>,
    /// Material ID for compound sections (default: 0)
    #[serde(default)]
    pub material_id: usize,
    /// Whether this is a void (hole). Voids are subtracted from the section.
    #[serde(default)]
    pub is_void: bool,
}

/// Input for cross-section analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionInput {
    pub polygons: Vec<SectionPolygon>,
    /// Modular ratios for compound sections. Maps material_id -> ratio (relative to base material).
    /// Material 0 has ratio 1.0 by default.
    #[serde(default)]
    pub modular_ratios: std::collections::HashMap<usize, f64>,
}

/// Result of cross-section analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionProperties {
    /// Total area
    pub a: f64,
    /// Centroid Y coordinate
    pub yc: f64,
    /// Centroid Z coordinate
    pub zc: f64,
    /// Second moment of area about centroidal Y-axis (bending about Y → resistance to Z displacement)
    pub iy: f64,
    /// Second moment of area about centroidal Z-axis (bending about Z → resistance to Y displacement)
    pub iz: f64,
    /// Product of inertia about centroidal axes
    pub iyz: f64,
    /// Principal moment of inertia (maximum)
    pub i1: f64,
    /// Principal moment of inertia (minimum)
    pub i2: f64,
    /// Angle of principal axes from Y-axis (radians)
    pub theta_p: f64,
    /// Elastic section modulus about Y-axis (top fiber, max Z)
    pub sy_top: f64,
    /// Elastic section modulus about Y-axis (bottom fiber, min Z)
    pub sy_bot: f64,
    /// Elastic section modulus about Z-axis (left fiber, min Y)
    pub sz_left: f64,
    /// Elastic section modulus about Z-axis (right fiber, max Y)
    pub sz_right: f64,
    /// Plastic section modulus about Y-axis (if computable)
    pub zy: f64,
    /// Plastic section modulus about Z-axis (if computable)
    pub zz: f64,
    /// Radius of gyration about Y-axis
    pub ry: f64,
    /// Radius of gyration about Z-axis
    pub rz: f64,
    /// Approximate torsion constant (St. Venant's J for thin-walled open sections)
    pub j: f64,
    /// Bounding box: [y_min, z_min, y_max, z_max]
    pub bbox: [f64; 4],
    /// Perimeter
    pub perimeter: f64,
}

// ==================== Analysis ====================

/// Compute section properties from polygon geometry.
pub fn analyze_section(input: &SectionInput) -> Result<SectionProperties, String> {
    if input.polygons.is_empty() {
        return Err("No polygons defined".into());
    }

    // First pass: compute total area and centroid (weighted by modular ratios)
    let mut total_a = 0.0;
    let mut total_ay = 0.0;
    let mut total_az = 0.0;

    let mut poly_props: Vec<PolygonBasicProps> = Vec::new();

    for poly in &input.polygons {
        if poly.vertices.len() < 3 {
            return Err("Polygon must have at least 3 vertices".into());
        }
        let props = polygon_basic_properties(&poly.vertices);
        let n = modular_ratio(input, poly.material_id);
        let sign = if poly.is_void { -1.0 } else { 1.0 };

        total_a += sign * n * props.area;
        total_ay += sign * n * props.area * props.yc;
        total_az += sign * n * props.area * props.zc;

        poly_props.push(props);
    }

    if total_a.abs() < 1e-20 {
        return Err("Section has zero area".into());
    }

    let yc = total_ay / total_a;
    let zc = total_az / total_a;

    // Second pass: compute moments of inertia about centroid (parallel axis theorem)
    let mut iy = 0.0;
    let mut iz = 0.0;
    let mut iyz = 0.0;

    for (i, poly) in input.polygons.iter().enumerate() {
        let props = &poly_props[i];
        let n = modular_ratio(input, poly.material_id);
        let sign = if poly.is_void { -1.0 } else { 1.0 };

        // Centroidal inertias of this polygon
        let iy_c = polygon_inertia_y(&poly.vertices, props.yc, props.zc);
        let iz_c = polygon_inertia_z(&poly.vertices, props.yc, props.zc);
        let iyz_c = polygon_product_inertia(&poly.vertices, props.yc, props.zc);

        // Parallel axis theorem to global centroid
        let dy = props.yc - yc;
        let dz = props.zc - zc;

        iy += sign * n * (iy_c + props.area * dz * dz);
        iz += sign * n * (iz_c + props.area * dy * dy);
        iyz += sign * n * (iyz_c + props.area * dy * dz);
    }

    // Principal moments of inertia
    let avg = (iy + iz) / 2.0;
    let diff = (iy - iz) / 2.0;
    let r = (diff * diff + iyz * iyz).sqrt();
    let i1 = avg + r;
    let i2 = avg - r;
    let theta_p = if iyz.abs() < 1e-15 && diff.abs() < 1e-15 {
        0.0
    } else {
        0.5 * (-2.0 * iyz).atan2(iy - iz)
    };

    // Bounding box (from all solid polygons)
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    let mut z_min = f64::INFINITY;
    let mut z_max = f64::NEG_INFINITY;

    for (i, poly) in input.polygons.iter().enumerate() {
        if poly.is_void { continue; }
        let props = &poly_props[i];
        if props.y_min < y_min { y_min = props.y_min; }
        if props.y_max > y_max { y_max = props.y_max; }
        if props.z_min < z_min { z_min = props.z_min; }
        if props.z_max > z_max { z_max = props.z_max; }
    }

    // Section moduli
    let dist_z_top = z_max - zc;
    let dist_z_bot = zc - z_min;
    let dist_y_right = y_max - yc;
    let dist_y_left = yc - y_min;

    let sy_top = if dist_z_top > 1e-15 { iy / dist_z_top } else { 0.0 };
    let sy_bot = if dist_z_bot > 1e-15 { iy / dist_z_bot } else { 0.0 };
    let sz_right = if dist_y_right > 1e-15 { iz / dist_y_right } else { 0.0 };
    let sz_left = if dist_y_left > 1e-15 { iz / dist_y_left } else { 0.0 };

    // Radii of gyration
    let ry = (iy / total_a).sqrt();
    let rz = (iz / total_a).sqrt();

    // Plastic section moduli (approximate using equal-area axis)
    let zy = compute_plastic_modulus_y(&input.polygons, &poly_props, zc, input);
    let zz = compute_plastic_modulus_z(&input.polygons, &poly_props, yc, input);

    // Torsion constant J (thin-walled approximation)
    let j = compute_torsion_constant(&input.polygons, &poly_props);

    // Perimeter
    let perimeter: f64 = input.polygons.iter()
        .filter(|p| !p.is_void)
        .map(|p| polygon_perimeter(&p.vertices))
        .sum();

    Ok(SectionProperties {
        a: total_a,
        yc, zc,
        iy, iz, iyz,
        i1, i2, theta_p,
        sy_top, sy_bot, sz_left, sz_right,
        zy, zz,
        ry, rz,
        j,
        bbox: [y_min, z_min, y_max, z_max],
        perimeter,
    })
}

// ==================== Polygon Geometry Helpers ====================

struct PolygonBasicProps {
    area: f64,
    yc: f64,
    zc: f64,
    y_min: f64,
    y_max: f64,
    z_min: f64,
    z_max: f64,
}

/// Compute area and centroid of a polygon using the shoelace formula.
fn polygon_basic_properties(verts: &[[f64; 2]]) -> PolygonBasicProps {
    let n = verts.len();
    let mut area = 0.0;
    let mut cy = 0.0;
    let mut cz = 0.0;
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    let mut z_min = f64::INFINITY;
    let mut z_max = f64::NEG_INFINITY;

    for i in 0..n {
        let j = (i + 1) % n;
        let yi = verts[i][0];
        let zi = verts[i][1];
        let yj = verts[j][0];
        let zj = verts[j][1];

        let cross = yi * zj - yj * zi;
        area += cross;
        cy += (yi + yj) * cross;
        cz += (zi + zj) * cross;

        if yi < y_min { y_min = yi; }
        if yi > y_max { y_max = yi; }
        if zi < z_min { z_min = zi; }
        if zi > z_max { z_max = zi; }
    }

    area *= 0.5;
    let a_abs = area.abs();

    let (yc, zc) = if a_abs > 1e-20 {
        (cy / (6.0 * area), cz / (6.0 * area))
    } else {
        (0.0, 0.0)
    };

    PolygonBasicProps {
        area: a_abs,
        yc, zc,
        y_min, y_max, z_min, z_max,
    }
}

/// Second moment of area about the polygon's own centroidal Y-axis.
fn polygon_inertia_y(verts: &[[f64; 2]], _yc: f64, zc: f64) -> f64 {
    let n = verts.len();
    let mut iy = 0.0;

    for i in 0..n {
        let j = (i + 1) % n;
        let zi = verts[i][1] - zc;
        let zj = verts[j][1] - zc;
        let yi = verts[i][0];
        let yj = verts[j][0];
        let cross = yi * verts[j][1] - yj * verts[i][1];

        iy += cross * (zi * zi + zi * zj + zj * zj);
    }

    (iy / 12.0).abs()
}

/// Second moment of area about the polygon's own centroidal Z-axis.
fn polygon_inertia_z(verts: &[[f64; 2]], yc: f64, _zc: f64) -> f64 {
    let n = verts.len();
    let mut iz = 0.0;

    for i in 0..n {
        let j = (i + 1) % n;
        let yi = verts[i][0] - yc;
        let yj = verts[j][0] - yc;
        let zi = verts[i][1];
        let zj = verts[j][1];
        let cross = verts[i][0] * zj - verts[j][0] * zi;

        iz += cross * (yi * yi + yi * yj + yj * yj);
    }

    (iz / 12.0).abs()
}

/// Product of inertia about the polygon's own centroid.
fn polygon_product_inertia(verts: &[[f64; 2]], yc: f64, zc: f64) -> f64 {
    let n = verts.len();
    let mut iyz = 0.0;

    for i in 0..n {
        let j = (i + 1) % n;
        let yi = verts[i][0] - yc;
        let zi = verts[i][1] - zc;
        let yj = verts[j][0] - yc;
        let zj = verts[j][1] - zc;
        let cross = verts[i][0] * verts[j][1] - verts[j][0] * verts[i][1];

        iyz += cross * (yi * zj + 2.0 * yi * zi + 2.0 * yj * zj + yj * zi);
    }

    iyz / 24.0
}

/// Perimeter of a polygon.
fn polygon_perimeter(verts: &[[f64; 2]]) -> f64 {
    let n = verts.len();
    let mut p = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        let dy = verts[j][0] - verts[i][0];
        let dz = verts[j][1] - verts[i][1];
        p += (dy * dy + dz * dz).sqrt();
    }
    p
}

fn modular_ratio(input: &SectionInput, material_id: usize) -> f64 {
    if material_id == 0 { return 1.0; }
    input.modular_ratios.get(&material_id).copied().unwrap_or(1.0)
}

// ==================== Plastic Section Modulus ====================

/// Compute plastic section modulus about Y-axis (equal area axis parallel to Y).
/// Zy = A_top * d_top + A_bot * d_bot where equal area axis splits section in half.
fn compute_plastic_modulus_y(
    polygons: &[SectionPolygon],
    props: &[PolygonBasicProps],
    _zc: f64,
    input: &SectionInput,
) -> f64 {
    // Approximate by sampling horizontal strips
    let mut z_min = f64::INFINITY;
    let mut z_max = f64::NEG_INFINITY;
    for (i, poly) in polygons.iter().enumerate() {
        if poly.is_void { continue; }
        if props[i].z_min < z_min { z_min = props[i].z_min; }
        if props[i].z_max > z_max { z_max = props[i].z_max; }
    }

    if (z_max - z_min) < 1e-15 { return 0.0; }

    // Compute total area
    let total_a: f64 = polygons.iter().enumerate()
        .map(|(i, poly)| {
            let n = modular_ratio(input, poly.material_id);
            let sign = if poly.is_void { -1.0 } else { 1.0 };
            sign * n * props[i].area
        })
        .sum();

    let half_a = total_a / 2.0;

    // Find the equal-area axis (PNA) using bisection
    let n_strips = 200;
    let dz = (z_max - z_min) / n_strips as f64;
    let mut cumulative_area = 0.0;
    let mut pna_z = z_min;

    for s in 0..n_strips {
        let z_lo = z_min + s as f64 * dz;
        let z_hi = z_lo + dz;

        let strip_area: f64 = polygons.iter().enumerate()
            .map(|(_, poly)| {
                let n = modular_ratio(input, poly.material_id);
                let sign = if poly.is_void { -1.0 } else { 1.0 };
                sign * n * polygon_strip_area(&poly.vertices, z_lo, z_hi)
            })
            .sum();

        if cumulative_area + strip_area >= half_a {
            // PNA is within this strip - interpolate
            let frac = if strip_area > 1e-20 {
                (half_a - cumulative_area) / strip_area
            } else {
                0.5
            };
            pna_z = z_lo + frac * dz;
            break;
        }
        cumulative_area += strip_area;
        pna_z = z_hi;
    }

    // Compute first moments about the PNA
    let mut zy = 0.0;
    let n_fine = 500;
    let dz_fine = (z_max - z_min) / n_fine as f64;

    for s in 0..n_fine {
        let z_lo = z_min + s as f64 * dz_fine;
        let z_hi = z_lo + dz_fine;
        let z_mid = (z_lo + z_hi) / 2.0;

        let strip_area: f64 = polygons.iter()
            .map(|poly| {
                let n = modular_ratio(input, poly.material_id);
                let sign = if poly.is_void { -1.0 } else { 1.0 };
                sign * n * polygon_strip_area(&poly.vertices, z_lo, z_hi)
            })
            .sum();

        zy += strip_area * (z_mid - pna_z).abs();
    }

    zy
}

/// Compute plastic section modulus about Z-axis.
fn compute_plastic_modulus_z(
    polygons: &[SectionPolygon],
    props: &[PolygonBasicProps],
    _yc: f64,
    input: &SectionInput,
) -> f64 {
    let mut y_min = f64::INFINITY;
    let mut y_max = f64::NEG_INFINITY;
    for (i, poly) in polygons.iter().enumerate() {
        if poly.is_void { continue; }
        if props[i].y_min < y_min { y_min = props[i].y_min; }
        if props[i].y_max > y_max { y_max = props[i].y_max; }
    }

    if (y_max - y_min) < 1e-15 { return 0.0; }

    let total_a: f64 = polygons.iter().enumerate()
        .map(|(i, poly)| {
            let n = modular_ratio(input, poly.material_id);
            let sign = if poly.is_void { -1.0 } else { 1.0 };
            sign * n * props[i].area
        })
        .sum();

    let half_a = total_a / 2.0;

    // Find PNA using vertical strips
    let n_strips = 200;
    let dy = (y_max - y_min) / n_strips as f64;
    let mut cumulative_area = 0.0;
    let mut pna_y = y_min;

    for s in 0..n_strips {
        let y_lo = y_min + s as f64 * dy;
        let y_hi = y_lo + dy;

        let strip_area: f64 = polygons.iter()
            .map(|poly| {
                let n = modular_ratio(input, poly.material_id);
                let sign = if poly.is_void { -1.0 } else { 1.0 };
                sign * n * polygon_strip_area_vertical(&poly.vertices, y_lo, y_hi)
            })
            .sum();

        if cumulative_area + strip_area >= half_a {
            let frac = if strip_area > 1e-20 {
                (half_a - cumulative_area) / strip_area
            } else {
                0.5
            };
            pna_y = y_lo + frac * dy;
            break;
        }
        cumulative_area += strip_area;
        pna_y = y_hi;
    }

    // Compute first moments about the PNA
    let mut zz = 0.0;
    let n_fine = 500;
    let dy_fine = (y_max - y_min) / n_fine as f64;

    for s in 0..n_fine {
        let y_lo = y_min + s as f64 * dy_fine;
        let y_hi = y_lo + dy_fine;
        let y_mid = (y_lo + y_hi) / 2.0;

        let strip_area: f64 = polygons.iter()
            .map(|poly| {
                let n = modular_ratio(input, poly.material_id);
                let sign = if poly.is_void { -1.0 } else { 1.0 };
                sign * n * polygon_strip_area_vertical(&poly.vertices, y_lo, y_hi)
            })
            .sum();

        zz += strip_area * (y_mid - pna_y).abs();
    }

    zz
}

/// Approximate area of a polygon clipped to a horizontal strip [z_lo, z_hi].
fn polygon_strip_area(verts: &[[f64; 2]], z_lo: f64, z_hi: f64) -> f64 {
    // Quick check: if entire polygon is outside the strip
    let z_min = verts.iter().map(|v| v[1]).fold(f64::INFINITY, f64::min);
    let z_max = verts.iter().map(|v| v[1]).fold(f64::NEG_INFINITY, f64::max);
    if z_max <= z_lo || z_min >= z_hi { return 0.0; }

    // Approximate: find Y-extent at mid-height of strip using scanline
    let z_mid = (z_lo + z_hi) / 2.0;
    let width = scanline_width(verts, z_mid);
    width * (z_hi - z_lo)
}

/// Approximate area of a polygon clipped to a vertical strip [y_lo, y_hi].
fn polygon_strip_area_vertical(verts: &[[f64; 2]], y_lo: f64, y_hi: f64) -> f64 {
    let y_min = verts.iter().map(|v| v[0]).fold(f64::INFINITY, f64::min);
    let y_max = verts.iter().map(|v| v[0]).fold(f64::NEG_INFINITY, f64::max);
    if y_max <= y_lo || y_min >= y_hi { return 0.0; }

    let y_mid = (y_lo + y_hi) / 2.0;
    let height = scanline_height(verts, y_mid);
    height * (y_hi - y_lo)
}

/// Width of polygon at height z (scanline intersection).
fn scanline_width(verts: &[[f64; 2]], z: f64) -> f64 {
    let n = verts.len();
    let mut intersections: Vec<f64> = Vec::new();

    for i in 0..n {
        let j = (i + 1) % n;
        let zi = verts[i][1];
        let zj = verts[j][1];

        if (zi <= z && zj > z) || (zj <= z && zi > z) {
            let t = (z - zi) / (zj - zi);
            let y = verts[i][0] + t * (verts[j][0] - verts[i][0]);
            intersections.push(y);
        }
    }

    intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let mut width = 0.0;
    let mut k = 0;
    while k + 1 < intersections.len() {
        width += intersections[k + 1] - intersections[k];
        k += 2;
    }
    width
}

/// Height of polygon at horizontal position y (scanline intersection in Y direction).
fn scanline_height(verts: &[[f64; 2]], y: f64) -> f64 {
    let n = verts.len();
    let mut intersections: Vec<f64> = Vec::new();

    for i in 0..n {
        let j = (i + 1) % n;
        let yi = verts[i][0];
        let yj = verts[j][0];

        if (yi <= y && yj > y) || (yj <= y && yi > y) {
            let t = (y - yi) / (yj - yi);
            let z = verts[i][1] + t * (verts[j][1] - verts[i][1]);
            intersections.push(z);
        }
    }

    intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let mut height = 0.0;
    let mut k = 0;
    while k + 1 < intersections.len() {
        height += intersections[k + 1] - intersections[k];
        k += 2;
    }
    height
}

// ==================== Torsion Constant ====================

/// Approximate torsion constant J.
/// For thin-walled open sections: J ≈ Σ (1/3) * b * t³
/// For solid/thick sections: approximate using J = A⁴ / (4π² * Ip) (Routh's rule)
fn compute_torsion_constant(
    polygons: &[SectionPolygon],
    props: &[PolygonBasicProps],
) -> f64 {
    // Use Routh's approximation: J ≈ A⁴ / (4π² Ip)
    // where Ip = Iy + Iz (polar moment of inertia)
    // This is exact for circle, ellipse, and reasonable for compact sections.
    let total_a: f64 = polygons.iter().enumerate()
        .map(|(i, poly)| {
            let sign = if poly.is_void { -1.0 } else { 1.0 };
            sign * props[i].area
        })
        .sum();

    if total_a.abs() < 1e-20 { return 0.0; }

    // Simple centroid for J calculation
    let yc: f64 = polygons.iter().enumerate()
        .filter(|(_, p)| !p.is_void)
        .map(|(i, _)| props[i].area * props[i].yc)
        .sum::<f64>() / total_a;
    let zc: f64 = polygons.iter().enumerate()
        .filter(|(_, p)| !p.is_void)
        .map(|(i, _)| props[i].area * props[i].zc)
        .sum::<f64>() / total_a;

    let mut ip = 0.0;
    for (i, poly) in polygons.iter().enumerate() {
        let sign = if poly.is_void { -1.0 } else { 1.0 };
        let iy = polygon_inertia_y(&poly.vertices, props[i].yc, props[i].zc);
        let iz = polygon_inertia_z(&poly.vertices, props[i].yc, props[i].zc);
        let dy = props[i].yc - yc;
        let dz = props[i].zc - zc;
        ip += sign * (iy + iz + props[i].area * (dy * dy + dz * dz));
    }

    if ip < 1e-20 { return 0.0; }

    let a4 = total_a * total_a * total_a * total_a;
    a4 / (4.0 * std::f64::consts::PI * std::f64::consts::PI * ip)
}
