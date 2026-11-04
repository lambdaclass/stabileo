//! WASM boundary of the CIRSOC 201 section engine (`postprocess::cirsoc201_section`).
//!
//! The app builds one `Cirsoc201SectionKernel` per section and asks it many questions (a
//! diagram, a surface cut, a design search), so the outline and bars cross the boundary once.
//! Everything is numeric and SI (Pa, N, N·m, m, m²); every answer is the engine's: the code
//! provisions (β1, φ, the axial caps) are applied here, not by the caller.
use wasm_bindgen::prelude::*;

use crate::postprocess::cirsoc201_check::Cirsoc201Edition;
use crate::postprocess::cirsoc201_section::{Confinement, Ring, Section, SectionCode, SectionPoint, Utilisation};

/// Values per section state in the outputs: `[Pn, Mnx, Mny, εt, c, φ, φPn, φMnx, φMny]`.
pub const STATE_LEN: usize = 9;
/// Values per utilisation: `[ratio, φPn, φMn, c, εt, φ, nx, ny, axialOnly]`.
pub const UTIL_LEN: usize = 9;

pub(crate) fn edition_of(v: f64) -> Result<Cirsoc201Edition, &'static str> {
    if v == 2005.0 {
        Ok(Cirsoc201Edition::E2005)
    } else if v == 2025.0 {
        Ok(Cirsoc201Edition::E2025)
    } else {
        Err("CIRSOC 201 edition must be 2005 or 2025")
    }
}

pub(crate) fn confinement_of(v: f64) -> Result<Confinement, &'static str> {
    if v == 0.0 {
        Ok(Confinement::Ties)
    } else if v == 1.0 {
        Ok(Confinement::Spiral)
    } else {
        Err("confinement must be 0 (ties) or 1 (spiral)")
    }
}

fn push_state(out: &mut Vec<f64>, p: &SectionPoint) {
    let s = &p.s;
    out.extend_from_slice(&[s.pn, s.mnx, s.mny, s.eps_t, p.c, s.phi, s.phi_pn, s.phi_mnx, s.phi_mny]);
}

fn push_util(out: &mut Vec<f64>, u: &Utilisation) {
    out.extend_from_slice(&[u.ratio, u.phi_pn, u.phi_mn, u.c, u.eps_t, u.phi, u.nx, u.ny, u.axial_only as u8 as f64]);
}

/// Build a section from flat buffers: polygon rings (`points`, `offsets`), then exact circles
/// (`circles`: cx, cy, r each); the first ring of all is the outer boundary, the rest holes.
/// `params`: `[fc, fy, Es, edition, confinement, deduct]`.
pub fn section_from_buffers(points: &[f64], offsets: &[u32], circles: &[f64], bars: &[f64], params: &[f64]) -> Result<Section, &'static str> {
    if points.len() % 2 != 0
        || bars.len() % 3 != 0
        || circles.len() % 3 != 0
        || params.len() != 6
        || offsets.is_empty()
        || offsets.first() != Some(&0)
        || offsets.last().copied().map(|n| n as usize) != Some(points.len() / 2)
        || offsets.windows(2).any(|w| w[0] > w[1])
    {
        return Err("Invalid RC section buffers");
    }
    let mut rings: Vec<Ring> = offsets
        .windows(2)
        .map(|w| Ring::Polygon(points[w[0] as usize * 2..w[1] as usize * 2].chunks_exact(2).map(|p| [p[0], p[1]]).collect()))
        .collect();
    rings.extend(circles.chunks_exact(3).map(|c| Ring::Circle { c: [c[0], c[1]], r: c[2] }));
    let code = SectionCode {
        fc: params[0],
        fy: params[1],
        es: params[2],
        edition: edition_of(params[3])?,
        confinement: confinement_of(params[4])?,
        deduct_displaced_concrete: params[5] != 0.0,
    };
    if params.iter().any(|v| !v.is_finite()) {
        return Err("Invalid RC section buffers");
    }
    Section::with_rings(rings, bars.chunks_exact(3).map(|b| [b[0], b[1], b[2]]).collect(), code)
}

fn finite(values: &[f64]) -> Result<(), JsValue> {
    if values.iter().all(|v| v.is_finite()) { Ok(()) } else { Err(JsValue::from_str("Invalid RC section query")) }
}

#[wasm_bindgen]
pub struct Cirsoc201SectionKernel {
    s: Section,
}

#[wasm_bindgen]
impl Cirsoc201SectionKernel {
    /// `points`/`offsets`: polygon rings as x, y pairs; `circles`: exact circles as cx, cy, r;
    /// the first ring (polygons before circles) is the outer boundary, the rest are holes.
    /// `bars`: x, y, area triples; `params`: `[fc, fy, Es, edition, confinement, deduct]`.
    #[wasm_bindgen(constructor)]
    pub fn new(points: &[f64], offsets: &[u32], circles: &[f64], bars: &[f64], params: &[f64]) -> Result<Cirsoc201SectionKernel, JsValue> {
        section_from_buffers(points, offsets, circles, bars, params).map(|s| Cirsoc201SectionKernel { s }).map_err(JsValue::from_str)
    }

    /// `[Ag, Ast, Po, φPn,max, φPnt,max (negative), β1, centroid x, centroid y]`.
    pub fn info(&self) -> Vec<f64> {
        let c = self.s.centroid();
        vec![self.s.gross_area(), self.s.steel_area(), self.s.squash_load(), self.s.axial_cap(), self.s.tension_cap(), self.s.beta1(), c[0], c[1]]
    }

    /// `[depth, dt]` along the direction: the section's depth and that of the farthest bar.
    pub fn depths(&self, nx: f64, ny: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny])?;
        let (d, dt) = self.s.depths(nx, ny);
        Ok(vec![d, dt])
    }

    /// One state per depth (`STATE_LEN` values each).
    pub fn points(&self, nx: f64, ny: f64, depths: &[f64]) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny])?;
        finite(depths)?;
        let mut out = Vec::with_capacity(depths.len() * STATE_LEN);
        for &c in depths {
            push_state(&mut out, &self.s.point(nx, ny, c));
        }
        Ok(out)
    }

    /// The sampled interaction curve (`STATE_LEN` values per point).
    pub fn curve(&self, nx: f64, ny: f64, n: u32) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny])?;
        if n == 0 {
            return Err(JsValue::from_str("curve needs at least one step"));
        }
        let mut out = Vec::new();
        for p in self.s.curve(nx, ny, n as usize) {
            push_state(&mut out, &p);
        }
        Ok(out)
    }

    /// The state where φPn = Pu, or NaNs when the section cannot carry Pu in that direction.
    #[wasm_bindgen(js_name = atAxial)]
    pub fn at_axial(&self, nx: f64, ny: f64, pu: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny, pu])?;
        Ok(match self.s.at_axial(nx, ny, pu) {
            Some(p) => {
                let mut out = Vec::with_capacity(STATE_LEN);
                push_state(&mut out, &p);
                out
            }
            None => vec![f64::NAN; STATE_LEN],
        })
    }

    /// Uniaxial check about x along the ray through (Mu, Pu) (`UTIL_LEN` values).
    pub fn ray(&self, pu: f64, mu: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[pu, mu])?;
        let mut out = Vec::with_capacity(UTIL_LEN);
        push_util(&mut out, &self.s.ray(pu, mu));
        Ok(out)
    }

    /// The axial limit on the demand's side (`UTIL_LEN` values).
    #[wasm_bindgen(js_name = axialLimit)]
    pub fn axial_limit(&self, nx: f64, ny: f64, pu: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny, pu])?;
        let mut out = Vec::with_capacity(UTIL_LEN);
        push_util(&mut out, &self.s.axial_limit(nx, ny, pu));
        Ok(out)
    }

    /// Biaxial check at the demand's axial force (`UTIL_LEN` values).
    pub fn biaxial(&self, pu: f64, mx: f64, my: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[pu, mx, my])?;
        let mut out = Vec::with_capacity(UTIL_LEN);
        push_util(&mut out, &self.s.biaxial(pu, mx, my));
        Ok(out)
    }

    /// The biaxial check with the verifier's search settings: the curve sampled in 10 steps,
    /// regula falsi on the neutral axis and on the moment direction, to 1e-6 rad (`UTIL_LEN` values).
    #[wasm_bindgen(js_name = biaxialFast)]
    pub fn biaxial_fast(&self, pu: f64, mx: f64, my: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[pu, mx, my])?;
        let mut out = Vec::with_capacity(UTIL_LEN);
        push_util(&mut out, &self.s.biaxial_with(pu, mx, my, 10, 1e-6));
        Ok(out)
    }

    /// `[φMn, φMnx, φMny (sheet signs), fi, …state]`, or NaNs when Pu is out of reach.
    #[wasm_bindgen(js_name = momentCapacityAtAxial)]
    pub fn moment_capacity_at_axial(&self, pu: f64, mx: f64, my: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[pu, mx, my])?;
        Ok(match self.s.moment_capacity_at_axial(pu, mx, my) {
            Some(m) => {
                let mut out = vec![m.phi_mn, m.phi_mnx, m.phi_mny, m.fi];
                push_state(&mut out, &m.point);
                out.extend_from_slice(&[m.point.nx, m.point.ny]);
                out
            }
            None => vec![f64::NAN; 4 + STATE_LEN + 2],
        })
    }

    /// The six characteristic points, `[φMn (sheet sign), φPn, φ, εt]` each.
    #[wasm_bindgen(js_name = characteristicPoints)]
    pub fn characteristic_points(&self, nx: f64, ny: f64) -> Result<Vec<f64>, JsValue> {
        finite(&[nx, ny])?;
        Ok(self.s.characteristic_points(nx, ny).iter().flatten().copied().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_buffers() {
        let params = [25e6, 420e6, 200e9, 2025.0, 0.0, 1.0];
        assert!(section_from_buffers(&[0.; 8], &[0, 5, 4], &[], &[], &params).is_err());
        assert!(section_from_buffers(&[0.; 8], &[0, 4], &[], &[], &params[..5]).is_err());
        let square = [-0.15, -0.15, 0.15, -0.15, 0.15, 0.15, -0.15, 0.15];
        assert!(section_from_buffers(&square, &[0, 4], &[], &[], &[25e6, 420e6, 200e9, 2019.0, 0.0, 1.0]).is_err());
        assert!(section_from_buffers(&square, &[0, 4], &[], &[], &[25e6, 420e6, 200e9, 2025.0, 2.0, 1.0]).is_err());
        let s = section_from_buffers(&square, &[0, 4], &[], &[0.0, 0.1, 3e-4], &params).unwrap();
        assert!((s.gross_area() - 0.09).abs() < 1e-15);
        let c = section_from_buffers(&[], &[0], &[0.0, 0.0, 0.25], &[], &params).unwrap();
        assert!((c.gross_area() - std::f64::consts::PI * 0.0625).abs() < 1e-15);
        assert!(section_from_buffers(&[], &[0], &[0.0, 0.0, -0.25], &[], &params).is_err());
        assert!(section_from_buffers(&[], &[0], &[], &[], &params).is_err());
    }
}
