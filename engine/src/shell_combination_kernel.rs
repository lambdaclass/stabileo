//! Shell superposition and governing envelopes in one WASM call. Case, factor,
//! element and combination ordering are retained, including first-wins ties.
use crate::types::{PlateStress, QuadStress};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;
struct Shells {
    id: i64,
    plate_stresses: Vec<PlateStress>,
    quad_stresses: Vec<QuadStress>,
}
struct Membrane {
    element_id: usize,
    sigma_xx: f64,
    sigma_yy: f64,
    tau_xy: f64,
    mx: f64,
    my: f64,
    mxy: f64,
    qx: Option<f64>,
    qy: Option<f64>,
}
struct Case {
    id: i64,
    plate_stresses: Vec<Membrane>,
    quad_stresses: Vec<Membrane>,
}
struct Factor {
    case_id: i64,
    factor: f64,
}
struct Combination {
    id: i64,
    factors: Vec<Factor>,
}
struct Input {
    cases: Vec<Case>,
    combinations: Vec<Combination>,
    thicknesses: Vec<(usize, f64)>,
    /// Existing combo order; only unmodified combos need their shell arrays.
    envelope_order: Vec<Shells>,
}
struct Output {
    combinations: Vec<Shells>,
    envelope_plates: Vec<(usize, usize)>,
    envelope_quads: Vec<(usize, usize)>,
}

fn vm(x: f64, y: f64, xy: f64) -> f64 {
    (x * x - x * y + y * y + 3. * xy * xy).max(0.).sqrt()
}
fn principal(x: f64, y: f64, xy: f64) -> (f64, f64) {
    let avg = (x + y) / 2.;
    let diff = (x - y) / 2.;
    let r = (diff * diff + xy * xy).sqrt();
    (avg + r, avg - r)
}
#[derive(Clone)]
struct Sum {
    values: [f64; 6],
    qx: Option<f64>,
    qy: Option<f64>,
    contributed: bool,
}
fn sum_tensors(
    count: usize,
    factors: &[Factor],
    cases: &HashMap<i64, Vec<(usize, &Membrane)>>,
) -> Vec<Sum> {
    let mut out = vec![
        Sum {
            values: [0.; 6],
            qx: Some(0.),
            qy: Some(0.),
            contributed: false
        };
        count
    ];
    // Factor order is unchanged for each element, including duplicate factors.
    for f in factors {
        if let Some(rows) = cases.get(&f.case_id) {
            for &(slot, p) in rows {
                let sum = &mut out[slot];
                sum.contributed = true;
                for (a, b) in sum
                    .values
                    .iter_mut()
                    .zip([p.sigma_xx, p.sigma_yy, p.tau_xy, p.mx, p.my, p.mxy])
                {
                    *a += f.factor * b;
                }
                sum.qx = sum.qx.zip(p.qx).map(|(a, b)| a + f.factor * b);
                sum.qy = sum.qy.zip(p.qy).map(|(a, b)| a + f.factor * b);
            }
        }
    }
    out
}
fn combine(input: Input) -> Output {
    let mut plate_ids = Vec::new();
    let mut quad_ids = Vec::new();
    let mut seen_p = HashSet::new();
    let mut seen_q = HashSet::new();
    let mut cases_p = HashMap::new();
    let mut cases_q = HashMap::new();
    for c in &input.cases {
        for p in &c.plate_stresses {
            if seen_p.insert(p.element_id) {
                plate_ids.push(p.element_id);
            }
        }
        for q in &c.quad_stresses {
            if seen_q.insert(q.element_id) {
                quad_ids.push(q.element_id);
            }
        }
        cases_p.insert(
            c.id,
            c.plate_stresses
                .iter()
                .map(|p| (p.element_id, p))
                .collect::<HashMap<_, _>>(),
        );
        cases_q.insert(
            c.id,
            c.quad_stresses
                .iter()
                .map(|q| (q.element_id, q))
                .collect::<HashMap<_, _>>(),
        );
    }
    // Resolve sparse IDs once, retaining only rows actually present in each
    // case. Memory stays linear in input size, even for disjoint case meshes.
    let slots_p: HashMap<_, _> = plate_ids
        .iter()
        .enumerate()
        .map(|(i, &id)| (id, i))
        .collect();
    let slots_q: HashMap<_, _> = quad_ids
        .iter()
        .enumerate()
        .map(|(i, &id)| (id, i))
        .collect();
    let cases_p: HashMap<_, Vec<_>> = cases_p
        .into_iter()
        .map(|(id, rows)| {
            (
                id,
                rows.into_iter()
                    .map(|(id, row)| (slots_p[&id], row))
                    .collect(),
            )
        })
        .collect();
    let cases_q: HashMap<_, Vec<_>> = cases_q
        .into_iter()
        .map(|(id, rows)| {
            (
                id,
                rows.into_iter()
                    .map(|(id, row)| (slots_q[&id], row))
                    .collect(),
            )
        })
        .collect();
    let thickness: HashMap<_, _> = input.thicknesses.into_iter().collect();
    let mut combinations = Vec::new();
    for combo in input.combinations {
        let mut plates = Vec::new();
        let mut quads = Vec::new();
        let summed_p = sum_tensors(plate_ids.len(), &combo.factors, &cases_p);
        let summed_q = sum_tensors(quad_ids.len(), &combo.factors, &cases_q);
        for (&id, sum) in plate_ids.iter().zip(summed_p) {
            if !sum.contributed {
                continue;
            }
            let v = sum.values;
            let t = thickness.get(&id).copied().unwrap_or(0.);
            let (x, y, xy, worst) = if t > 0. {
                let k = 6. / (t * t);
                let top = [v[0] + k * v[3], v[1] + k * v[4], v[2] + k * v[5]];
                let bottom = [v[0] - k * v[3], v[1] - k * v[4], v[2] - k * v[5]];
                let vt = vm(top[0], top[1], top[2]);
                let vb = vm(bottom[0], bottom[1], bottom[2]);
                let face = if vt >= vb { top } else { bottom };
                (face[0], face[1], face[2], vt.max(vb))
            } else {
                (v[0], v[1], v[2], vm(v[0], v[1], v[2]))
            };
            let (sigma_1, sigma_2) = principal(x, y, xy);
            plates.push(PlateStress {
                element_id: id,
                sigma_xx: v[0],
                sigma_yy: v[1],
                tau_xy: v[2],
                mx: v[3],
                my: v[4],
                mxy: v[5],
                sigma_1,
                sigma_2,
                von_mises: worst,
                nodal_von_mises: vec![],
                qx: None,
                qy: None,
            });
        }
        for (&id, sum) in quad_ids.iter().zip(summed_q) {
            if !sum.contributed {
                continue;
            }
            let v = sum.values;
            let (mut qx, mut qy) = (sum.qx, sum.qy);
            if qx.is_none() || qy.is_none() {
                qx = None;
                qy = None;
            }
            quads.push(QuadStress {
                element_id: id,
                sigma_xx: v[0],
                sigma_yy: v[1],
                tau_xy: v[2],
                mx: v[3],
                my: v[4],
                mxy: v[5],
                von_mises: vm(v[0], v[1], v[2]),
                nodal_von_mises: vec![],
                qx,
                qy,
            });
        }
        combinations.push(Shells {
            id: combo.id,
            plate_stresses: plates,
            quad_stresses: quads,
        });
    }
    let updated: HashMap<_, _> = combinations.iter().map(|c| (c.id, c)).collect();
    let mut envelope_plates = Vec::new();
    let mut envelope_quads = Vec::new();
    let mut slot_p = HashMap::new();
    let mut slot_q = HashMap::new();
    for (combo_index, old) in input.envelope_order.iter().enumerate() {
        let c = updated.get(&old.id).copied().unwrap_or(old);
        for (stress_index, p) in c.plate_stresses.iter().enumerate() {
            let slot = *slot_p.entry(p.element_id).or_insert_with(|| {
                envelope_plates.push((combo_index, stress_index));
                (envelope_plates.len() - 1, p.von_mises)
            });
            if p.von_mises > slot.1 {
                envelope_plates[slot.0] = (combo_index, stress_index);
                slot_p.insert(p.element_id, (slot.0, p.von_mises));
            }
        }
        for (stress_index, q) in c.quad_stresses.iter().enumerate() {
            let slot = *slot_q.entry(q.element_id).or_insert_with(|| {
                envelope_quads.push((combo_index, stress_index));
                (envelope_quads.len() - 1, q.von_mises)
            });
            if q.von_mises > slot.1 {
                envelope_quads[slot.0] = (combo_index, stress_index);
                slot_q.insert(q.element_id, (slot.0, q.von_mises));
            }
        }
    }
    Output {
        combinations,
        envelope_plates,
        envelope_quads,
    }
}

// A single f64 slice avoids serde property accesses for every shell of every
// combination. Counts precede variable-length blocks; see the TS adapter.
struct Reader<'a> {
    data: &'a [f64],
    pos: usize,
}
impl Reader<'_> {
    fn raw(&mut self) -> Result<f64, String> {
        let v = *self.data.get(self.pos).ok_or("Truncated shell batch")?;
        self.pos += 1;
        Ok(v)
    }
    fn number(&mut self) -> Result<f64, String> {
        let v = self.raw()?;
        if !v.is_finite() {
            return Err("Non-finite shell batch value".into());
        }
        Ok(v)
    }
    fn id(&mut self) -> Result<i64, String> {
        let v = self.number()?;
        if v.fract() != 0. || v.abs() > 9_007_199_254_740_991. {
            return Err("Invalid shell batch id".into());
        }
        Ok(v as i64)
    }
    fn element_id(&mut self) -> Result<usize, String> {
        usize::try_from(self.id()?).map_err(|_| "Invalid shell element id".into())
    }
    fn count(&mut self) -> Result<usize, String> {
        let n = self.element_id()?;
        if n > self.data.len() - self.pos {
            return Err("Invalid shell batch count".into());
        }
        Ok(n)
    }
    fn optional(&mut self) -> Result<Option<f64>, String> {
        let v = self.raw()?;
        if v.is_nan() {
            Ok(None)
        } else if v.is_finite() {
            Ok(Some(v))
        } else {
            Err("Non-finite shell shear".into())
        }
    }
    fn membrane(&mut self) -> Result<Membrane, String> {
        Ok(Membrane {
            element_id: self.element_id()?,
            sigma_xx: self.number()?,
            sigma_yy: self.number()?,
            tau_xy: self.number()?,
            mx: self.number()?,
            my: self.number()?,
            mxy: self.number()?,
            qx: self.optional()?,
            qy: self.optional()?,
        })
    }
}
fn decode(data: &[f64]) -> Result<Input, String> {
    let mut r = Reader { data, pos: 0 };
    let mut cases = Vec::new();
    for _ in 0..r.count()? {
        let id = r.id()?;
        let np = r.count()?;
        let nq = r.count()?;
        let mut plate_stresses = Vec::new();
        let mut quad_stresses = Vec::new();
        for _ in 0..np {
            plate_stresses.push(r.membrane()?);
        }
        for _ in 0..nq {
            quad_stresses.push(r.membrane()?);
        }
        cases.push(Case {
            id,
            plate_stresses,
            quad_stresses,
        });
    }
    let mut combinations = Vec::new();
    for _ in 0..r.count()? {
        let id = r.id()?;
        let mut factors = Vec::new();
        for _ in 0..r.count()? {
            factors.push(Factor {
                case_id: r.id()?,
                factor: r.number()?,
            });
        }
        combinations.push(Combination { id, factors });
    }
    let mut thicknesses = Vec::new();
    for _ in 0..r.count()? {
        thicknesses.push((r.element_id()?, r.number()?));
    }
    let mut envelope_order = Vec::new();
    for _ in 0..r.count()? {
        let id = r.id()?;
        let np = r.count()?;
        let nq = r.count()?;
        let mut plate_stresses = Vec::new();
        let mut quad_stresses = Vec::new();
        // Only id and VM are needed to select a retained combination's row.
        for _ in 0..np {
            plate_stresses.push(PlateStress {
                element_id: r.element_id()?,
                von_mises: r.number()?,
                sigma_xx: 0.,
                sigma_yy: 0.,
                tau_xy: 0.,
                mx: 0.,
                my: 0.,
                mxy: 0.,
                sigma_1: 0.,
                sigma_2: 0.,
                nodal_von_mises: vec![],
                qx: None,
                qy: None,
            });
        }
        for _ in 0..nq {
            quad_stresses.push(QuadStress {
                element_id: r.element_id()?,
                von_mises: r.number()?,
                sigma_xx: 0.,
                sigma_yy: 0.,
                tau_xy: 0.,
                mx: 0.,
                my: 0.,
                mxy: 0.,
                nodal_von_mises: vec![],
                qx: None,
                qy: None,
            });
        }
        envelope_order.push(Shells {
            id,
            plate_stresses,
            quad_stresses,
        });
    }
    if r.pos != data.len() {
        return Err("Trailing shell batch data".into());
    }
    Ok(Input {
        cases,
        combinations,
        thicknesses,
        envelope_order,
    })
}
fn encode(output: Output) -> Vec<f64> {
    let mut data = vec![output.combinations.len() as f64];
    for c in output.combinations {
        data.extend([
            c.id as f64,
            c.plate_stresses.len() as f64,
            c.quad_stresses.len() as f64,
        ]);
        for p in c.plate_stresses {
            data.extend([
                p.element_id as f64,
                p.sigma_xx,
                p.sigma_yy,
                p.tau_xy,
                p.mx,
                p.my,
                p.mxy,
                p.sigma_1,
                p.sigma_2,
                p.von_mises,
            ]);
        }
        for q in c.quad_stresses {
            data.extend([
                q.element_id as f64,
                q.sigma_xx,
                q.sigma_yy,
                q.tau_xy,
                q.mx,
                q.my,
                q.mxy,
                q.von_mises,
                q.qx.unwrap_or(f64::NAN),
                q.qy.unwrap_or(f64::NAN),
            ]);
        }
    }
    for rows in [output.envelope_plates, output.envelope_quads] {
        data.push(rows.len() as f64);
        for (c, s) in rows {
            data.extend([c as f64, s as f64]);
        }
    }
    data
}
#[wasm_bindgen]
pub fn combine_shell_stresses(data: &[f64]) -> Result<Vec<f64>, JsValue> {
    let input = decode(data).map_err(|e| JsValue::from_str(&e))?;
    Ok(encode(combine(input)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packed_batch_rejects_truncation_invalid_counts_and_nonfinite_tensors() {
        // One quad case, one combination, no thicknesses, one envelope entry.
        let valid = vec![
            1.,
            7.,
            0.,
            1.,
            42.,
            10.,
            2.,
            3.,
            4.,
            5.,
            6.,
            f64::NAN,
            f64::NAN,
            1.,
            9.,
            1.,
            7.,
            2.,
            0.,
            1.,
            9.,
            0.,
            0.,
        ];
        assert!(decode(&valid).is_ok());
        for end in 0..valid.len() {
            assert!(decode(&valid[..end]).is_err(), "length {end}");
        }
        for bad in [-1., 0.5, f64::INFINITY, f64::NAN, 1e20] {
            let mut data = valid.clone();
            data[0] = bad;
            assert!(decode(&data).is_err());
        }
        for bad in [f64::INFINITY, f64::NAN] {
            let mut data = valid.clone();
            data[5] = bad;
            assert!(decode(&data).is_err());
        }
        let mut trailing = valid;
        trailing.push(0.);
        assert!(decode(&trailing).is_err());
    }

    #[test]
    fn packed_result_preserves_absent_shear_and_governing_row() {
        let data = vec![
            1.,
            7.,
            0.,
            1.,
            42.,
            10.,
            2.,
            3.,
            4.,
            5.,
            6.,
            f64::NAN,
            f64::NAN,
            1.,
            9.,
            1.,
            7.,
            2.,
            0.,
            1.,
            9.,
            0.,
            0.,
        ];
        let result = combine(decode(&data).unwrap());
        assert_eq!(result.combinations[0].quad_stresses[0].sigma_xx, 20.);
        assert_eq!(result.envelope_quads, vec![(0, 0)]);
        let encoded = encode(result);
        assert!(encoded[12].is_nan());
        assert!(encoded[13].is_nan());
        assert_eq!(&encoded[14..], &[0., 1., 0., 0.]);
    }
}
