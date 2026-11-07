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
    envelope_order: Vec<Source>,
}
struct Output {
    combinations: Vec<Shells>,
    envelope: Envelope,
}
#[derive(Clone, Copy)]
struct Row {
    element_id: usize,
    values: [f64; ROW],
}
struct Source {
    id: i64,
    plates: Vec<Row>,
    quads: Vec<Row>,
}
const ROW: usize = 11;
const KEYS: usize = 17;
#[derive(Clone, Copy)]
struct Extreme {
    max: f64,
    max_source: usize,
    min: f64,
    min_source: usize,
}
struct EnvelopeRow {
    element_id: usize,
    extremes: [Option<Extreme>; KEYS],
}
struct Envelope {
    plates: Vec<EnvelopeRow>,
    quads: Vec<EnvelopeRow>,
}

fn vm(x: f64, y: f64, xy: f64) -> f64 {
    let squared = x * x - x * y + y * y + 3. * xy * xy;
    // f64::max ignores NaN; JavaScript's Math.max propagates it. Never turn
    // arithmetic overflow into an apparently safe zero Von Mises stress.
    if squared.is_nan() {
        squared
    } else {
        squared.max(0.).sqrt()
    }
}
fn principal(x: f64, y: f64, xy: f64) -> (f64, f64) {
    let avg = (x + y) / 2.;
    let diff = (x - y) / 2.;
    let r = (diff * diff + xy * xy).sqrt();
    (avg + r, avg - r)
}
fn wood_armer(mx: f64, my: f64, mxy: f64) -> [f64; 4] {
    let a = mxy.abs();
    let face = |px: f64, py: f64| -> (f64, f64) {
        let dx = px + a;
        let dy = py + a;
        if dx >= 0. && dy >= 0. {
            return (dx, dy);
        }
        if dx < 0. && dy < 0. {
            return (0., 0.);
        }
        if dx < 0. {
            let dy = py + if a > 0. { mxy * mxy / px.abs() } else { 0. };
            (0., dy.max(0.))
        } else {
            let dx = px + if a > 0. { mxy * mxy / py.abs() } else { 0. };
            (dx.max(0.), 0.)
        }
    };
    let (bottom_x, bottom_y) = face(mx, my);
    let (top_x, top_y) = face(-mx, -my);
    [bottom_x, bottom_y, top_x, top_y]
}
fn envelope_keys(r: &[f64; ROW]) -> [f64; KEYS] {
    let (sigma_1, sigma_2) = principal(r[0], r[1], r[2]);
    let wa = wood_armer(r[3], r[4], r[5]);
    [
        r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], sigma_1, sigma_2, wa[0], wa[1], wa[2],
        wa[3], r[9], r[10],
    ]
}
fn plate_row(p: &PlateStress) -> Row {
    Row {
        element_id: p.element_id,
        values: [
            p.sigma_xx,
            p.sigma_yy,
            p.tau_xy,
            p.mx,
            p.my,
            p.mxy,
            p.qx.unwrap_or(f64::NAN),
            p.qy.unwrap_or(f64::NAN),
            p.von_mises,
            p.sigma_1,
            p.sigma_2,
        ],
    }
}
fn quad_row(q: &QuadStress) -> Row {
    Row {
        element_id: q.element_id,
        values: [
            q.sigma_xx,
            q.sigma_yy,
            q.tau_xy,
            q.mx,
            q.my,
            q.mxy,
            q.qx.unwrap_or(f64::NAN),
            q.qy.unwrap_or(f64::NAN),
            q.von_mises,
            f64::NAN,
            f64::NAN,
        ],
    }
}
fn envelope_of<'a>(sources: impl Iterator<Item = (usize, &'a [Row])>) -> Vec<EnvelopeRow> {
    let mut out: Vec<EnvelopeRow> = Vec::new();
    let mut absent: Vec<[bool; KEYS]> = Vec::new();
    let mut seen_in: Vec<(usize, Option<usize>)> = Vec::new();
    let mut slot = HashMap::new();
    let mut source_count = 0;
    for (source, rows) in sources {
        source_count += 1;
        for row in rows {
            let i = *slot.entry(row.element_id).or_insert_with(|| {
                out.push(EnvelopeRow {
                    element_id: row.element_id,
                    extremes: [None; KEYS],
                });
                absent.push([false; KEYS]);
                seen_in.push((0, None));
                out.len() - 1
            });
            if seen_in[i].1 != Some(source) {
                seen_in[i] = (seen_in[i].0 + 1, Some(source));
            }
            for (k, v) in envelope_keys(&row.values).into_iter().enumerate() {
                if v.is_nan() {
                    absent[i][k] = true;
                    continue;
                }
                let e = out[i].extremes[k].get_or_insert(Extreme {
                    max: v,
                    max_source: source,
                    min: v,
                    min_source: source,
                });
                if v > e.max {
                    e.max = v;
                    e.max_source = source;
                }
                if v < e.min {
                    e.min = v;
                    e.min_source = source;
                }
            }
        }
    }
    for ((row, gaps), (seen, _)) in out.iter_mut().zip(absent).zip(seen_in) {
        for (k, gap) in gaps.into_iter().enumerate() {
            if gap || seen < source_count {
                row.extremes[k] = None;
            }
        }
    }
    out
}
fn envelope(sources: &[Source]) -> Envelope {
    Envelope {
        plates: envelope_of(sources.iter().enumerate().map(|(i, s)| (i, s.plates.as_slice()))),
        quads: envelope_of(sources.iter().enumerate().map(|(i, s)| (i, s.quads.as_slice()))),
    }
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
    let sources: Vec<Source> = input
        .envelope_order
        .into_iter()
        .map(|old| match updated.get(&old.id) {
            Some(c) => Source {
                id: old.id,
                plates: c.plate_stresses.iter().map(plate_row).collect(),
                quads: c.quad_stresses.iter().map(quad_row).collect(),
            },
            None => old,
        })
        .collect();
    Output {
        envelope: envelope(&sources),
        combinations,
    }
}

fn unique_ids(ids: impl Iterator<Item = usize>) -> Result<(), String> {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            return Err(format!(
                "Shell element {id} appears twice in one result set: shell families number their ids independently, so its stresses cannot be told apart"
            ));
        }
    }
    Ok(())
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
    fn row(&mut self, plate: bool) -> Result<Row, String> {
        let element_id = self.element_id()?;
        let mut values = [0.; ROW];
        for v in values.iter_mut().take(6) {
            *v = self.number()?;
        }
        values[6] = self.optional()?.unwrap_or(f64::NAN);
        values[7] = self.optional()?.unwrap_or(f64::NAN);
        values[8] = self.number()?;
        values[9] = self.raw()?;
        values[10] = self.raw()?;
        if plate && !(values[9].is_finite() && values[10].is_finite()) {
            return Err("Non-finite plate principal stress".into());
        }
        if values[6].is_nan() != values[7].is_nan() {
            return Err("A shell shear needs both components".into());
        }
        if !plate {
            values[9] = f64::NAN;
            values[10] = f64::NAN;
        }
        Ok(Row { element_id, values })
    }
    fn sources(&mut self) -> Result<Vec<Source>, String> {
        let mut sources = Vec::new();
        for _ in 0..self.count()? {
            let id = self.id()?;
            let np = self.count()?;
            let nq = self.count()?;
            let mut plates = Vec::new();
            let mut quads = Vec::new();
            for _ in 0..np {
                plates.push(self.row(true)?);
            }
            for _ in 0..nq {
                quads.push(self.row(false)?);
            }
            unique_ids(plates.iter().map(|r| r.element_id))?;
            unique_ids(quads.iter().map(|r| r.element_id))?;
            sources.push(Source { id, plates, quads });
        }
        Ok(sources)
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
        unique_ids(plate_stresses.iter().map(|m| m.element_id))?;
        unique_ids(quad_stresses.iter().map(|m| m.element_id))?;
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
    let envelope_order = r.sources()?;
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
    encode_envelope(&output.envelope, &mut data);
    data
}
fn encode_envelope(envelope: &Envelope, data: &mut Vec<f64>) {
    for rows in [&envelope.plates, &envelope.quads] {
        data.push(rows.len() as f64);
        for row in rows {
            data.push(row.element_id as f64);
            for e in row.extremes {
                match e {
                    Some(e) => data.extend([e.max, e.max_source as f64, e.min, e.min_source as f64]),
                    None => data.extend([f64::NAN; 4]),
                }
            }
        }
    }
}
fn finite_envelope(envelope: &Envelope) -> bool {
    [&envelope.plates, &envelope.quads].iter().all(|rows| {
        rows.iter().all(|r| r.extremes.iter().flatten().all(|e| e.max.is_finite() && e.min.is_finite()))
    })
}
/// The extremes of every shell component over result sets given in full: per element and
/// component, the largest and smallest value and the position of the set each comes from.
#[wasm_bindgen]
pub fn envelope_shell_stresses(data: &[f64]) -> Result<Vec<f64>, JsValue> {
    let mut r = Reader { data, pos: 0 };
    let sources = r.sources().map_err(|e| JsValue::from_str(&e))?;
    if r.pos != data.len() {
        return Err(JsValue::from_str("Trailing shell batch data"));
    }
    let envelope = envelope(&sources);
    if !finite_envelope(&envelope) {
        return Err(JsValue::from_str("Non-finite shell envelope"));
    }
    let mut out = Vec::new();
    encode_envelope(&envelope, &mut out);
    Ok(out)
}
#[wasm_bindgen]
pub fn combine_shell_stresses(data: &[f64]) -> Result<Vec<f64>, JsValue> {
    let input = decode(data).map_err(|e| JsValue::from_str(&e))?;
    let output = combine(input);
    for c in &output.combinations {
        let invalid_plate = c.plate_stresses.iter().any(|p| {
            [
                p.sigma_xx,
                p.sigma_yy,
                p.tau_xy,
                p.mx,
                p.my,
                p.mxy,
                p.sigma_1,
                p.sigma_2,
                p.von_mises,
            ]
            .iter()
            .any(|v| !v.is_finite())
        });
        let invalid_quad = c.quad_stresses.iter().any(|q| {
            [
                q.sigma_xx,
                q.sigma_yy,
                q.tau_xy,
                q.mx,
                q.my,
                q.mxy,
                q.von_mises,
            ]
            .iter()
            .any(|v| !v.is_finite())
                || q.qx.is_some_and(|v| !v.is_finite())
                || q.qy.is_some_and(|v| !v.is_finite())
        });
        if invalid_plate || invalid_quad {
            return Err(JsValue::from_str("Non-finite combined shell stress"));
        }
    }
    if !finite_envelope(&output.envelope) {
        return Err(JsValue::from_str("Non-finite shell envelope"));
    }
    Ok(encode(output))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn packed_batch_rejects_truncation_invalid_counts_and_nonfinite_tensors() {
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

    fn mitc4_and_mitc9_both_numbered_7(shells_per_set: usize) -> Vec<f64> {
        let mitc4 = [7., 10., 0., 0., 2., 0., 0., 1., 1.];
        let mitc9 = [7., 1000., 0., 0., 200., 0., 0., f64::NAN, f64::NAN];
        let mut data = vec![1., 1., 0., 2.];
        data.extend(mitc4);
        data.extend(mitc9);
        data.extend([1., 10., 1., 1., 1.5, 0.]);
        data.extend([1., 20., 0., shells_per_set as f64]);
        for row in [mitc4, mitc9].iter().take(shells_per_set) {
            data.extend(row);
            data.extend([row[1].abs(), f64::NAN, f64::NAN]);
        }
        data
    }

    #[test]
    fn shells_of_two_families_with_one_id_are_refused_not_combined_into_one() {
        let one_retained = mitc4_and_mitc9_both_numbered_7(1);
        let err = decode(&one_retained).err().expect("a MITC4 and a MITC9 numbered 7 in one case");
        assert!(err.contains("Shell element 7 appears twice"), "{err}");
        let mut distinct = one_retained.clone();
        distinct[13] = 8.;
        let combined = combine(decode(&distinct).unwrap());
        let quads = &combined.combinations[0].quad_stresses;
        assert_eq!(quads.iter().map(|q| (q.element_id, q.sigma_xx)).collect::<Vec<_>>(), vec![(7, 15.), (8, 1500.)]);
    }

    #[test]
    fn an_enveloped_set_with_two_shells_numbered_alike_is_refused() {
        let data = mitc4_and_mitc9_both_numbered_7(2);
        let sources_at = data.len() - 1 - 3 - 2 * 12;
        let mut r = Reader { data: &data[sources_at..], pos: 0 };
        let err = r.sources().err().expect("a MITC4 and a MITC9 numbered 7 in one set");
        assert!(err.contains("Shell element 7 appears twice"), "{err}");
    }

    fn quad(element_id: usize, values: [f64; 9]) -> Row {
        let mut v = [f64::NAN; ROW];
        v[..9].copy_from_slice(&values);
        Row { element_id, values: v }
    }

    fn source(quads: Vec<Row>) -> Source {
        Source { id: 0, plates: vec![], quads }
    }

    #[test]
    fn packed_result_preserves_absent_shear_and_envelopes_the_combination() {
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
        let e = &result.envelope.quads[0];
        assert_eq!(e.element_id, 42);
        let sxx = e.extremes[0].unwrap();
        assert_eq!((sxx.max, sxx.max_source, sxx.min, sxx.min_source), (20., 0, 20., 0));
        assert!(e.extremes[6].is_none() && e.extremes[7].is_none());
        let encoded = encode(result);
        assert!(encoded[12].is_nan());
        assert!(encoded[13].is_nan());
        assert_eq!(encoded[14], 0.);
        assert_eq!(encoded[15], 1.);
        assert_eq!(encoded[16], 42.);
        assert_eq!(&encoded[17..21], &[20., 0., 20., 0.]);
        assert_eq!(encoded.len(), 17 + 4 * KEYS);
    }

    #[test]
    fn mat_foundation_e10_takes_each_component_from_its_own_combination() {
        let c1 = quad(10, [0., 0., 0., 77.94113167, 95.86955112, -24.09088352, -67.08721732, -61.37306338, 0.]);
        let c2 = quad(10, [0., 0., 0., 90.93132028, 111.8478096, -28.10603077, -78.2684202, -71.60190728, 0.]);
        let env = envelope(&[source(vec![c1]), source(vec![c2]), source(vec![c1])]);
        let e = &env.quads[0];
        let mx = e.extremes[3].unwrap();
        assert_eq!((mx.max, mx.max_source, mx.min, mx.min_source), (90.93132028, 1, 77.94113167, 0));
        let mxy = e.extremes[5].unwrap();
        assert_eq!((mxy.max, mxy.max_source, mxy.min, mxy.min_source), (-24.09088352, 0, -28.10603077, 1));
        let qx = e.extremes[6].unwrap();
        assert_eq!((qx.min, qx.min_source), (-78.2684202, 1));
    }

    #[test]
    fn a_shear_missing_from_one_set_has_no_envelope() {
        let with = quad(3, [0., 0., 0., 0., 0., 0., 5., 1., 0.]);
        let without = quad(3, [0., 0., 0., 0., 0., 0., f64::NAN, f64::NAN, 0.]);
        let env = envelope(&[source(vec![with]), source(vec![without])]);
        assert!(env.quads[0].extremes[6].is_none());
        assert!(env.quads[0].extremes[7].is_none());
        assert!(env.quads[0].extremes[3].is_some());
    }

    #[test]
    fn an_element_missing_from_one_set_has_no_envelope() {
        let both = quad(1, [10., 0., 0., 4., 0., 0., 1., 1., 10.]);
        let only_first = quad(2, [10., 0., 0., 4., 0., 0., 1., 1., 10.]);
        let env = envelope(&[source(vec![both, only_first]), source(vec![both])]);
        let row = |id: usize| env.quads.iter().find(|r| r.element_id == id).unwrap();
        assert!(row(1).extremes[3].is_some() && row(1).extremes[0].is_some());
        assert!(row(2).extremes.iter().all(Option::is_none));
    }

    #[test]
    fn an_element_twice_in_one_set_and_missing_from_another_has_no_envelope() {
        let row = quad(1, [10., 0., 0., 4., 0., 0., 1., 1., 10.]);
        let env = envelope(&[source(vec![row, row]), source(vec![])]);
        assert!(env.quads[0].extremes.iter().all(Option::is_none));
    }

    #[test]
    fn wood_armer_design_moments_match_the_slab_formula() {
        assert_eq!(wood_armer(10., 4., 2.), [12., 6., 0., 0.]);
        assert_eq!(wood_armer(-10., -4., 2.), [0., 0., 12., 6.]);
        assert_eq!(wood_armer(1., -4., 2.), [2., 0., 1., 6.]);
    }

    #[test]
    fn wood_armer_design_moments_scale_with_the_moments() {
        for scale in [1e-12, 1e-6, 1.0, 1e6] {
            let [bx, by, tx, ty] = wood_armer(-4. * scale, scale, 2. * scale);
            let [ex, ey, fx, fy] = wood_armer(-4., 1., 2.);
            for (got, unit) in [(bx, ex), (by, ey), (tx, fx), (ty, fy)] {
                assert!((got - unit * scale).abs() <= 1e-12 * unit.abs().max(1.) * scale, "scale {scale:e}: {got:e} vs {:e}", unit * scale);
            }
        }
    }

    fn row_strategy() -> impl Strategy<Value = [f64; 9]> {
        (proptest::array::uniform8(-1e3..1e3f64), 0.0..1e3f64, any::<bool>()).prop_map(|(v, vm, shear)| {
            let mut r = [0.; 9];
            r[..8].copy_from_slice(&v);
            if !shear {
                r[6] = f64::NAN;
                r[7] = f64::NAN;
            }
            r[8] = vm;
            r
        })
    }

    proptest! {
        #[test]
        fn every_enveloped_component_bounds_every_set_and_names_one_that_reaches_it(
            sets in proptest::collection::vec(proptest::collection::vec(row_strategy(), 1..4), 1..6)
        ) {
            let sources: Vec<Source> = sets.iter().map(|rows| {
                source(rows.iter().enumerate().map(|(e, r)| quad(e + 1, *r)).collect())
            }).collect();
            let env = envelope(&sources);
            for e in &env.quads {
                let rows: Vec<(usize, [f64; KEYS])> = sources.iter().enumerate()
                    .filter_map(|(i, s)| s.quads.iter().find(|r| r.element_id == e.element_id).map(|r| (i, envelope_keys(&r.values))))
                    .collect();
                for k in 0..KEYS {
                    let present: Vec<(usize, f64)> = rows.iter().map(|(i, v)| (*i, v[k])).collect();
                    match e.extremes[k] {
                        None => prop_assert!(present.len() < sources.len() || present.iter().any(|(_, v)| v.is_nan())),
                        Some(x) => {
                            prop_assert_eq!(present.len(), sources.len());
                            for &(_, v) in &present {
                                prop_assert!(!v.is_nan());
                                prop_assert!(x.max >= v && x.min <= v);
                            }
                            prop_assert!(present.iter().any(|&(i, v)| i == x.max_source && v == x.max));
                            prop_assert!(present.iter().any(|&(i, v)| i == x.min_source && v == x.min));
                        }
                    }
                }
            }
        }
    }
}
