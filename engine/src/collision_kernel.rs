//! Collision spatial index and narrow phase. Curve sampling and pair policies stay in TS.
//! Repair sessions update only changed bars; full sweeps copy geometry once.
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

type Point = [f64; 3];
#[derive(Clone, Copy)]
struct Bounds {
    lo: Point,
    hi: Point,
}
impl Bounds {
    fn segment(p: Point, q: Point) -> Self {
        Self {
            lo: std::array::from_fn(|k| p[k].min(q[k])),
            hi: std::array::from_fn(|k| p[k].max(q[k])),
        }
    }
    fn gap(self, b: Self) -> f64 {
        let d: Point =
            std::array::from_fn(|k| 0.0_f64.max(self.lo[k] - b.hi[k]).max(b.lo[k] - self.hi[k]));
        dot(d, d)
    }
}
struct Bar {
    points: Vec<Point>,
    boxes: Vec<Bounds>,
    bounds: Bounds,
}
fn dot(a: Point, b: Point) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn sub(a: Point, b: Point) -> Point {
    std::array::from_fn(|k| a[k] - b[k])
}
// As the reference's Math.max(0, Math.min(1, v)): a zero comes back +0, never the −0 that
// f64::clamp keeps, so the closest point is the same to the sign of its zeros. NaN stays NaN.
fn clamp(v: f64) -> f64 {
    if v > 0.0 {
        v.min(1.0)
    } else if v.is_nan() {
        v
    } else {
        0.0
    }
}
// Scaled compensated norm, matching the JS reference's Math.hypot without overflow.
fn norm(v: Point) -> f64 {
    let scale = v[0].abs().max(v[1].abs()).max(v[2].abs());
    if scale == 0.0 {
        return 0.0;
    }
    let (mut sum, mut correction) = (0.0, 0.0);
    for x in v {
        let q = x.abs() / scale;
        let y = q * q - correction;
        let next = sum + y;
        correction = (next - sum) - y;
        sum = next;
    }
    sum.sqrt() * scale
}
fn distance(p: Point, q: Point, r: Point, t: Point) -> (f64, Point) {
    let d1 = sub(q, p);
    let d2 = sub(t, r);
    let delta = sub(p, r);
    let a = dot(d1, d1);
    let e = dot(d2, d2);
    let f = dot(d2, delta);
    let (mut s, mut u) = (0.0, 0.0);
    if a <= 1e-12 && e <= 1e-12 {
    } else if a <= 1e-12 {
        u = clamp(f / e);
    } else {
        let c = dot(d1, delta);
        if e <= 1e-12 {
            s = clamp(-c / a);
        } else {
            let b = dot(d1, d2);
            let denom = a * e - b * b;
            s = if denom > 1e-12 {
                clamp((b * f - c * e) / denom)
            } else {
                0.0
            };
            u = (b * s + f) / e;
            if u < 0.0 {
                u = 0.0;
                s = clamp(-c / a);
            } else if u > 1.0 {
                u = 1.0;
                s = clamp((b - c) / a);
            }
        }
    }
    let c1: Point = std::array::from_fn(|k| p[k] + d1[k] * s);
    let c2: Point = std::array::from_fn(|k| r[k] + d2[k] * u);
    (
        norm(sub(c1, c2)),
        std::array::from_fn(|k| (c1[k] + c2[k]) / 2.0),
    )
}

// Same wrapping 32-bit keys, sample order and bucket stamps as the TS reference.
struct Bucket {
    indices: Vec<u32>,
    last_query: Option<u64>,
}
struct SpatialHash {
    points: Vec<Vec<Point>>,
    cells: HashMap<u32, Bucket>,
    cell: f64,
    deduplicate: bool,
    scans: f64,
    seen: Vec<Option<u64>>,
    next_query: u32,
    query_stamp: u64,
}
fn cell_key(c: Point) -> u32 {
    let ints: [u32; 3] = std::array::from_fn(|k| {
        // Ordinary model coordinates need no floating-point remainder. Retain
        // JS ToInt32 wrapping for very large translated models as well.
        if c[k] >= i32::MIN as f64 && c[k] <= i32::MAX as f64 {
            c[k] as i32 as u32
        } else {
            c[k].rem_euclid(4294967296.0) as u32
        }
    });
    ints[0].wrapping_mul(73856093) ^ ints[1].wrapping_mul(19349663) ^ ints[2].wrapping_mul(83492791)
}
impl SpatialHash {
    fn new(bars: &[Bar], cell: f64, deduplicate: bool) -> Result<Self, &'static str> {
        if !cell.is_finite() || cell <= 0.0 {
            return Err("Invalid collision cell size");
        }
        let mut hash = Self {
            points: Vec::with_capacity(bars.len()),
            cells: HashMap::new(),
            cell,
            deduplicate,
            scans: 0.0,
            seen: vec![None; bars.len()],
            next_query: 0,
            query_stamp: 0,
        };
        for (i, bar) in bars.iter().enumerate() {
            let samples = Self::samples(&bar.points, cell)?;
            for p in &samples {
                let c = std::array::from_fn(|k| (p[k] / cell).floor());
                let bucket = hash.cells.entry(cell_key(c)).or_insert_with(|| Bucket {
                    indices: Vec::new(),
                    last_query: None,
                });
                if bucket.indices.last().copied() != Some(i as u32) {
                    bucket.indices.push(i as u32);
                }
            }
            hash.points.push(samples);
        }
        Ok(hash)
    }
    fn samples(points: &[Point], cell: f64) -> Result<Vec<Point>, &'static str> {
        let mut samples = Vec::new();
        if let Some(&p) = points.first() {
            samples.push(p);
        }
        for pair in points.windows(2) {
            let delta = sub(pair[1], pair[0]);
            let count = (norm(delta) / (cell / 2.0)).ceil().max(1.0);
            // Bound work for invalid/extreme geometry instead of allocating forever.
            if !count.is_finite() || count > 10_000_000.0 {
                return Err("Collision segment exceeds hash sampling limit");
            }
            for k in 1..=count as usize {
                let t = k as f64 / count;
                samples.push(std::array::from_fn(|axis| pair[0][axis] + delta[axis] * t));
            }
        }
        Ok(samples)
    }
    fn replace(&mut self, index: u32, samples: Vec<Point>) {
        // A bar may occupy the same bucket many times, including hash collisions.
        let keys = |points: &[Point]| -> HashSet<u32> {
            points
                .iter()
                .map(|p| cell_key(std::array::from_fn(|k| (p[k] / self.cell).floor())))
                .collect()
        };
        let old = keys(&self.points[index as usize]);
        let new = keys(&samples);
        for key in old.difference(&new) {
            if let Some(bucket) = self.cells.get_mut(key) {
                bucket.indices.retain(|&i| i != index);
                if bucket.indices.is_empty() {
                    self.cells.remove(key);
                }
            }
        }
        for key in new.difference(&old) {
            let bucket = self.cells.entry(*key).or_insert_with(|| Bucket {
                indices: Vec::new(),
                last_query: None,
            });
            // Keep the initial sweep's ordering even when a lower-index bar moves in.
            let position = bucket.indices.binary_search(&index).unwrap_err();
            bucket.indices.insert(position, index);
        }
        self.points[index as usize] = samples;
    }
    fn candidates(&mut self, index: u32) -> Vec<u32> {
        self.neighbors(index, false)
    }
    fn neighbors(&mut self, index: u32, both_sides: bool) -> Vec<u32> {
        if self.query_stamp == u64::MAX {
            self.seen.fill(None);
            for bucket in self.cells.values_mut() {
                bucket.last_query = None;
            }
            self.query_stamp = 0;
        }
        self.query_stamp += 1;
        let stamp = self.query_stamp;
        let mut previous: Option<Point> = None;
        let mut out = Vec::new();
        for p in &self.points[index as usize] {
            let c: Point = std::array::from_fn(|k| (p[k] / self.cell).floor());
            let old = previous;
            previous = if self.deduplicate { Some(c) } else { None };
            if old == Some(c) {
                continue;
            }
            for dx in -1..=1 {
                for dy in -1..=1 {
                    for dz in -1..=1 {
                        let n = [c[0] + dx as f64, c[1] + dy as f64, c[2] + dz as f64];
                        if old.is_some_and(|last| {
                            (n[0] - last[0]).abs() <= 1.0
                                && (n[1] - last[1]).abs() <= 1.0
                                && (n[2] - last[2]).abs() <= 1.0
                        }) {
                            continue;
                        }
                        if let Some(bucket) = self.cells.get_mut(&cell_key(n)) {
                            if self.deduplicate && bucket.last_query == Some(stamp) {
                                continue;
                            }
                            bucket.last_query = Some(stamp);
                            self.scans += 1.0;
                            for &j in &bucket.indices {
                                if j == index
                                    || (!both_sides && j < index)
                                    || self.seen[j as usize] == Some(stamp)
                                {
                                    continue;
                                }
                                self.seen[j as usize] = Some(stamp);
                                out.push(j);
                            }
                        }
                    }
                }
            }
        }
        out
    }
}

#[wasm_bindgen]
pub struct CollisionGeometry {
    bars: Vec<Bar>,
    radii: Vec<f64>,
    hash: Option<SpatialHash>,
}
impl CollisionGeometry {
    fn checked(points: &[f64], offsets: &[u32], radii: &[f64]) -> Result<Self, &'static str> {
        if points.len() % 3 != 0
            || offsets.len() != radii.len() + 1
            || offsets.first() != Some(&0)
            || offsets.last().copied().map(|n| n as usize) != Some(points.len() / 3)
            || offsets.windows(2).any(|w| w[0] > w[1])
            || points.iter().any(|v| !v.is_finite())
            || radii.iter().any(|v| !v.is_finite() || *v < 0.0)
        {
            return Err("Invalid collision geometry");
        }
        let bars = offsets
            .windows(2)
            .map(|w| {
                let pts: Vec<Point> = points[w[0] as usize * 3..w[1] as usize * 3]
                    .chunks_exact(3)
                    .map(|p| [p[0], p[1], p[2]])
                    .collect();
                let boxes: Vec<_> = pts
                    .windows(2)
                    .map(|p| Bounds::segment(p[0], p[1]))
                    .collect();
                let p = pts.first().copied().unwrap_or([0.0; 3]);
                let mut bounds = Bounds::segment(p, p);
                for b in &boxes {
                    for k in 0..3 {
                        bounds.lo[k] = bounds.lo[k].min(b.lo[k]);
                        bounds.hi[k] = bounds.hi[k].max(b.hi[k]);
                    }
                }
                Bar {
                    points: pts,
                    boxes,
                    bounds,
                }
            })
            .collect();
        Ok(Self {
            bars,
            radii: radii.to_vec(),
            hash: None,
        })
    }
}
#[wasm_bindgen]
impl CollisionGeometry {
    #[wasm_bindgen(constructor)]
    pub fn new(
        points: &[f64],
        offsets: &[u32],
        radii: &[f64],
    ) -> Result<CollisionGeometry, JsValue> {
        Self::checked(points, offsets, radii).map_err(JsValue::from_str)
    }
    /// Build once; queries must visit each bar once, in increasing index order.
    pub fn build_hash(&mut self, cell: f64, deduplicate: bool) -> Result<(), JsValue> {
        self.hash =
            Some(SpatialHash::new(&self.bars, cell, deduplicate).map_err(JsValue::from_str)?);
        Ok(())
    }
    pub fn candidates(&mut self, index: u32) -> Result<Vec<u32>, JsValue> {
        if index as usize >= self.bars.len() {
            return Err(JsValue::from_str("Invalid collision bar index"));
        }
        let hash = self
            .hash
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Collision hash is not initialized"))?;
        if hash.next_query != index {
            return Err(JsValue::from_str(
                "Collision bars must be queried once in increasing order",
            ));
        }
        hash.next_query += 1;
        Ok(hash.candidates(index))
    }
    /// Replace one bar without rebuilding the other bars or their spatial buckets.
    /// Radius and index remain fixed throughout a repair session.
    pub fn update_bar(&mut self, index: u32, points: &[f64]) -> Result<(), JsValue> {
        if index as usize >= self.bars.len() {
            return Err(JsValue::from_str("Invalid collision bar index"));
        }
        let mut replacement = Self::checked(
            points,
            &[0, (points.len() / 3) as u32],
            &[self.radii[index as usize]],
        )
        .map_err(JsValue::from_str)?;
        let bar = replacement.bars.remove(0);
        if let Some(hash) = self.hash.as_mut() {
            // Validate before mutating the index, so rejected updates leave it intact.
            let samples =
                SpatialHash::samples(&bar.points, hash.cell).map_err(JsValue::from_str)?;
            hash.replace(index, samples);
        }
        self.bars[index as usize] = bar;
        Ok(())
    }
    /// Canonical index pairs touching changed bars, including newly encountered neighbors.
    /// Only changed bars query the index. Unchanged pair results belong to the caller.
    pub fn changed_pairs(&mut self, changed: &[u32]) -> Result<Vec<u32>, JsValue> {
        if changed.iter().any(|&i| i as usize >= self.bars.len()) {
            return Err(JsValue::from_str("Invalid collision bar index"));
        }
        let hash = self
            .hash
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Collision hash is not initialized"))?;
        hash.scans = 0.0;
        let mut pairs = Vec::new();
        for &i in changed {
            for j in hash.neighbors(i, true) {
                pairs.push((i.min(j), i.max(j)));
            }
        }
        pairs.sort_unstable();
        pairs.dedup();
        Ok(pairs.into_iter().flat_map(|(i, j)| [i, j]).collect())
    }
    pub fn bucket_scans(&self) -> f64 {
        self.hash.as_ref().map_or(0.0, |hash| hash.scans)
    }
    /// Eight doubles per candidate: surface, clearance, midpoint xyz, segment indices,
    /// and number of measured segment pairs. Segment -1 denotes no surviving segment.
    pub fn measure(
        &self,
        index: u32,
        candidates: &[u32],
        placement: f64,
        max_clear: f64,
        prune: bool,
    ) -> Result<Vec<f64>, JsValue> {
        if index as usize >= self.bars.len()
            || candidates.iter().any(|j| *j as usize >= self.bars.len())
            || !placement.is_finite()
            || !max_clear.is_finite()
        {
            return Err(JsValue::from_str("Invalid collision query"));
        }
        let i = index as usize;
        let a = &self.bars[i];
        let mut out = Vec::with_capacity(candidates.len() * 8);
        for &j in candidates {
            let j = j as usize;
            let b = &self.bars[j];
            let cutoff = max_clear + placement + self.radii[i] + self.radii[j];
            let cutoff_sq = cutoff * cutoff;
            let mut best = [0.0, 0.0, 0.0, 0.0, 0.0, -1.0, -1.0, 0.0];
            if !prune || a.bounds.gap(b.bounds) <= cutoff_sq {
                for (m, ap) in a.points.windows(2).enumerate() {
                    if prune && a.boxes[m].gap(b.bounds) > cutoff_sq {
                        continue;
                    }
                    for (n, bp) in b.points.windows(2).enumerate() {
                        if prune && a.boxes[m].gap(b.boxes[n]) > cutoff_sq {
                            continue;
                        }
                        best[7] += 1.0;
                        let (d, at) = distance(ap[0], ap[1], bp[0], bp[1]);
                        let surface = d - self.radii[i] - self.radii[j];
                        let clearance = surface - placement;
                        if best[5] < 0.0 || clearance < best[1] {
                            best[..7].copy_from_slice(&[
                                surface, clearance, at[0], at[1], at[2], m as f64, n as f64,
                            ]);
                        }
                    }
                }
            }
            out.extend_from_slice(&best);
        }
        Ok(out)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hash_wraps_negative_cells_and_preserves_candidate_order() {
        assert_eq!(
            cell_key([-1.0, 0.0, 0.0]),
            cell_key([4294967295.0, 0.0, 0.0])
        );
        let geometry = CollisionGeometry::checked(
            &[-1., 0., 0., 1., 0., 0., -1., 0.02, 0., 1., 0.02, 0.],
            &[0, 2, 4],
            &[0.008, 0.008],
        )
        .unwrap();
        let mut fast = SpatialHash::new(&geometry.bars, 0.3, true).unwrap();
        let mut repeated = SpatialHash::new(&geometry.bars, 0.3, false).unwrap();
        assert_eq!(fast.candidates(0), vec![1]);
        assert_eq!(repeated.candidates(0), vec![1]);
        assert!(fast.candidates(1).is_empty());
        assert!(fast.scans < repeated.scans);
    }
    #[test]
    fn updated_hash_matches_rebuild_with_wrap_collisions_and_repeated_queries() {
        let mut geometry = CollisionGeometry::checked(
            &[
                -1., 0., 0., 1., 0., 0., -1., 0.02, 0., 1., 0.02, 0., -1., 1., 0., 1., 1., 0., -1.,
                -1., 0., 1., -1., 0.,
            ],
            &[0, 2, 4, 6, 8],
            &[0.01; 4],
        )
        .unwrap();
        geometry.build_hash(0.25, true).unwrap();
        for (i, y) in [(3, 0.0), (0, 1.02), (3, -1.0), (1, 1073741824.0), (0, 0.0)] {
            geometry.update_bar(i, &[-1., y, 0., 1., y, 0.]).unwrap();
            let mut rebuilt = SpatialHash::new(&geometry.bars, 0.25, true).unwrap();
            let updated = geometry.hash.as_mut().unwrap();
            for j in 0..4 {
                assert_eq!(updated.neighbors(j, true), rebuilt.neighbors(j, true));
                // Query stamps must be independent of both bar index and repair pass.
                assert_eq!(updated.neighbors(j, true), rebuilt.neighbors(j, true));
            }
            assert!(updated.cells.values().all(|b| !b.indices.is_empty()));
        }
        let hash = geometry.hash.as_mut().unwrap();
        hash.query_stamp = u64::MAX;
        let mut rebuilt = SpatialHash::new(&geometry.bars, 0.25, true).unwrap();
        assert_eq!(hash.neighbors(0, true), rebuilt.neighbors(0, true));
    }
    #[test]
    fn changed_pairs_are_unique_canonical_and_reset_diagnostics() {
        let mut geometry = CollisionGeometry::checked(
            &[
                0., 0., 0., 1., 0., 0., 0., 0.02, 0., 1., 0.02, 0., 0., 0.03, 0., 1., 0.03, 0.,
            ],
            &[0, 2, 4, 6],
            &[0.01; 3],
        )
        .unwrap();
        geometry.build_hash(0.25, true).unwrap();
        assert_eq!(
            geometry.changed_pairs(&[2, 1, 2]).unwrap(),
            vec![0, 1, 0, 2, 1, 2]
        );
        assert!(geometry.bucket_scans() > 0.0);
        assert!(geometry.changed_pairs(&[]).unwrap().is_empty());
        assert_eq!(geometry.bucket_scans(), 0.0);
    }
    #[test]
    fn clamp_gives_positive_zero_like_math_max() {
        assert!(clamp(-0.0).is_sign_positive());
        assert!(clamp(-1e-300).is_sign_positive() && clamp(-1e-300) == 0.0);
        assert_eq!(clamp(0.25), 0.25);
        assert_eq!(clamp(7.0), 1.0);
        assert!(clamp(f64::NAN).is_nan());
    }
    #[test]
    fn rejects_bad_buffers() {
        assert!(CollisionGeometry::checked(&[0.0; 6], &[0, 3, 2], &[0.01; 2]).is_err());
        assert!(CollisionGeometry::checked(&[f64::NAN; 3], &[0, 1], &[0.01]).is_err());
        assert!(CollisionGeometry::checked(&[], &[0], &[]).is_ok());
    }
    #[test]
    fn crossing_and_degenerate() {
        let (d, at) = distance([-1., 0., 0.], [1., 0., 0.], [0., -1., 0.], [0., 1., 0.]);
        assert_eq!(d, 0.);
        assert_eq!(at, [0.; 3]);
        assert_eq!(distance([0.; 3], [0.; 3], [0., 3., 4.], [0., 3., 4.]).0, 5.);
    }
}
