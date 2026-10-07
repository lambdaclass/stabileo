//! Prepared polygon/strain integration. Code provisions (beta, phi, axial cap and
//! material constants) remain owned by the TS CIRSOC basis module.
use wasm_bindgen::prelude::*;
type Point = [f64; 2];

#[wasm_bindgen]
pub struct RcSectionGeometry {
    rings: Vec<Vec<Point>>,
    bars: Vec<[f64; 3]>,
    // Concrete strength (kPa), steel yield stress and modulus (MPa), ultimate strain, beta1.
    constants: [f64; 5],
    deduct: bool,
}
fn zone(ring: &[Point], nx: f64, ny: f64, d: f64, cut: &mut Vec<Point>) -> [f64; 3] {
    cut.clear();
    if ring.is_empty() {
        return [0.; 3];
    }
    let mut a = ring[ring.len() - 1];
    for &b in ring {
        let sa = nx * a[0] + ny * a[1] - d;
        let sb = nx * b[0] + ny * b[1] - d;
        if (sa >= 0.) != (sb >= 0.) {
            let t = sa / (sa - sb);
            cut.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        }
        if sb >= 0. {
            cut.push(b);
        }
        a = b;
    }
    if cut.len() < 3 {
        return [0.; 3];
    }
    let (mut area, mut mx, mut my) = (0., 0., 0.);
    let mut a = cut[cut.len() - 1];
    for &b in cut.iter() {
        let cross = a[0] * b[1] - b[0] * a[1];
        area += cross;
        mx += (a[0] + b[0]) * cross;
        my += (a[1] + b[1]) * cross;
        a = b;
    }
    area /= 2.;
    if area.abs() < 1e-14 {
        return [0.; 3];
    }
    // Keep the same operation order as polygonAreaCentroid + compressedZone.
    [
        area.abs(),
        area.abs() * (mx / (6. * area)),
        area.abs() * (my / (6. * area)),
    ]
}
impl RcSectionGeometry {
    fn checked(
        points: &[f64],
        offsets: &[u32],
        bars: &[f64],
        constants: &[f64],
        deduct: bool,
    ) -> Result<Self, &'static str> {
        if points.len() % 2 != 0
            || bars.len() % 3 != 0
            || constants.len() != 5
            || offsets.len() < 2
            || offsets.first() != Some(&0)
            || offsets.last().copied().map(|n| n as usize) != Some(points.len() / 2)
            || offsets.windows(2).any(|w| w[0] > w[1])
            || points
                .iter()
                .chain(bars)
                .chain(constants)
                .any(|v| !v.is_finite())
        {
            return Err("Invalid RC section buffers");
        }
        let rings = offsets
            .windows(2)
            .map(|w| {
                points[w[0] as usize * 2..w[1] as usize * 2]
                    .chunks_exact(2)
                    .map(|p| [p[0], p[1]])
                    .collect()
            })
            .collect();
        Ok(Self {
            rings,
            bars: bars.chunks_exact(3).map(|b| [b[0], b[1], b[2]]).collect(),
            constants: constants.try_into().unwrap(),
            deduct,
        })
    }
}
#[wasm_bindgen]
impl RcSectionGeometry {
    #[wasm_bindgen(constructor)]
    pub fn new(
        points: &[f64],
        offsets: &[u32],
        bars: &[f64],
        constants: &[f64],
        deduct: bool,
    ) -> Result<RcSectionGeometry, JsValue> {
        Self::checked(points, offsets, bars, constants, deduct).map_err(JsValue::from_str)
    }
    /// Five doubles per depth: nominal axial force, moments x/y, tensile strain, c.
    pub fn evaluate(&self, nx: f64, ny: f64, depths: &[f64]) -> Result<Vec<f64>, JsValue> {
        if !nx.is_finite() || !ny.is_finite() || depths.iter().any(|v| !v.is_finite()) {
            return Err(JsValue::from_str("Invalid RC section query"));
        }
        let (mut max, mut min) = (f64::NEG_INFINITY, f64::INFINITY);
        for p in &self.rings[0] {
            let s = nx * p[0] + ny * p[1];
            max = max.max(s);
            min = min.min(s);
        }
        let [fc, fy, es, ecu, beta] = self.constants;
        let stress = 0.85 * fc;
        let fy_kpa = fy * 1000.0;
        let mut cut = Vec::new();
        let mut out = Vec::with_capacity(depths.len() * 5);
        for &c in depths {
            let a = (beta * c).min(max - min).max(0.);
            let mut z = [0.; 3];
            for (i, ring) in self.rings.iter().enumerate() {
                let part = zone(ring, nx, ny, max - a, &mut cut);
                let sign = if i == 0 { 1. } else { -1. };
                for k in 0..3 {
                    z[k] += sign * part[k];
                }
            }
            let (mut pn, mut mx, mut my) = (stress * z[0].max(0.), -stress * z[2], stress * z[1]);
            let mut epsilon = 0.0_f64;
            for bar in &self.bars {
                let s = nx * bar[0] + ny * bar[1];
                let strain = if c > 1e-9 {
                    ecu * (s - (max - c)) / c
                } else {
                    -10. * (fy / es)
                };
                let fs = (strain * es * 1000.0).max(-fy_kpa).min(fy_kpa);
                let mut force = bar[2] * fs;
                if self.deduct && strain > 0. && s >= max - a {
                    force -= bar[2] * 0.85 * fc;
                }
                pn += force;
                mx += -force * bar[1];
                my += force * bar[0];
                epsilon = epsilon.min(strain);
            }
            out.extend_from_slice(&[pn, mx, my, epsilon.min(0.).abs(), c]);
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clips_both_windings_and_empty_zone() {
        let r = vec![[-1., -1.], [1., -1.], [1., 1.], [-1., 1.]];
        let mut cut = vec![];
        assert_eq!(zone(&r, 0., 1., 0., &mut cut), [2., 0., 1.]);
        let reverse: Vec<_> = r.iter().copied().rev().collect();
        assert_eq!(zone(&reverse, 0., 1., 0., &mut cut), [2., 0., 1.]);
        assert_eq!(zone(&r, 0., 1., 2., &mut cut), [0.; 3]);
    }
    #[test]
    fn rejects_invalid_offsets() {
        assert!(RcSectionGeometry::checked(&[0.; 8], &[0, 5, 4], &[], &[1.; 5], true).is_err());
    }
}
