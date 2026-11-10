use dedaliano_engine::types::*;
use std::collections::HashMap;

pub const E_STEEL_MPA: f64 = 210_000.0;
pub use crate::common::STEEL_DENSITY_KG_M3;

pub fn steel_densities() -> HashMap<String, f64> {
    HashMap::from([("1".to_string(), STEEL_DENSITY_KG_M3)])
}

#[derive(Clone, Copy, Debug)]
pub struct FrameSpec {
    pub bays: usize,
    pub storeys: usize,
    pub bay_width: f64,
    pub storey_height: f64,
    pub subdivisions: usize,
    pub column: (f64, f64),
    pub beam: (f64, f64),
    pub lateral_kn: f64,
    pub gravity_kn: f64,
    pub pinned_bases: bool,
}

impl FrameSpec {
    pub const fn two_storey() -> Self {
        Self {
            bays: 1,
            storeys: 2,
            bay_width: 6.0,
            storey_height: 3.5,
            subdivisions: 2,
            column: (5.38e-3, 8.36e-5),
            beam: (6.26e-3, 1.17e-4),
            lateral_kn: 10.0,
            gravity_kn: 40.0,
            pinned_bases: false,
        }
    }

    pub fn variant(seed: u64) -> Self {
        let mut s = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let mut next = move || {
            s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((s >> 33) as f64) / ((1u64 << 31) as f64)
        };
        let col_i = 2e-5 * 10f64.powf(1.5 * next());
        let beam_i = 2e-5 * 10f64.powf(1.5 * next());
        Self {
            bays: 1 + (next() * 3.0) as usize,
            storeys: 1 + (next() * 4.0) as usize,
            bay_width: 4.0 + 5.0 * next(),
            storey_height: 2.8 + 1.7 * next(),
            subdivisions: 1 + (next() * 3.0) as usize,
            column: (col_i.sqrt() * 0.6, col_i),
            beam: (beam_i.sqrt() * 0.6, beam_i),
            lateral_kn: 2.0 + 20.0 * next(),
            gravity_kn: 10.0 + 60.0 * next(),
            pinned_bases: next() < 0.3,
        }
    }
}

pub struct Planar {
    pub nodes: Vec<(usize, f64, f64)>,
    pub members: Vec<(usize, usize, usize, usize)>,
    pub bases: Vec<usize>,
    pub roof: Vec<usize>,
    pub floors: Vec<Vec<usize>>,
}

/// Columns (section 1) and beams (section 2) of a regular plane frame in XZ, each
/// member split into `subdivisions` elements; bases at z = 0.
pub fn plane_frame(spec: &FrameSpec) -> Planar {
    let mut nodes = Vec::new();
    let mut grid = HashMap::new();
    let mut next_id = 1;
    for s in 0..=spec.storeys {
        for b in 0..=spec.bays {
            nodes.push((next_id, b as f64 * spec.bay_width, s as f64 * spec.storey_height));
            grid.insert((b, s), next_id);
            next_id += 1;
        }
    }
    let mut members = Vec::new();
    let mut eid = 1;
    let mut split = |nodes: &mut Vec<(usize, f64, f64)>, a: usize, b: usize, sec: usize, next_id: &mut usize| {
        let pa = nodes.iter().find(|n| n.0 == a).copied().unwrap();
        let pb = nodes.iter().find(|n| n.0 == b).copied().unwrap();
        let mut prev = a;
        for k in 1..=spec.subdivisions {
            let to = if k == spec.subdivisions {
                b
            } else {
                let t = k as f64 / spec.subdivisions as f64;
                nodes.push((*next_id, pa.1 + t * (pb.1 - pa.1), pa.2 + t * (pb.2 - pa.2)));
                *next_id += 1;
                *next_id - 1
            };
            members.push((eid, prev, to, sec));
            eid += 1;
            prev = to;
        }
    };
    for s in 0..spec.storeys {
        for b in 0..=spec.bays {
            split(&mut nodes, grid[&(b, s)], grid[&(b, s + 1)], 1, &mut next_id);
        }
        for b in 0..spec.bays {
            split(&mut nodes, grid[&(b, s + 1)], grid[&(b + 1, s + 1)], 2, &mut next_id);
        }
    }
    let floors = (1..=spec.storeys).map(|s| (0..=spec.bays).map(|b| grid[&(b, s)]).collect()).collect();
    Planar {
        bases: (0..=spec.bays).map(|b| grid[&(b, 0)]).collect(),
        roof: (0..=spec.bays).map(|b| grid[&(b, spec.storeys)]).collect(),
        floors,
        nodes,
        members,
    }
}

pub fn frame_2d(spec: &FrameSpec) -> SolverInput {
    let p = plane_frame(spec);
    let mut loads = Vec::new();
    for (level, floor) in p.floors.iter().enumerate() {
        let share = (level + 1) as f64 / spec.storeys as f64;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: floor[0], fx: spec.lateral_kn * share, fz: 0.0, my: 0.0 }));
        for &n in floor {
            loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: n, fx: 0.0, fz: -spec.gravity_kn, my: 0.0 }));
        }
    }
    let base = if spec.pinned_bases { "pinned" } else { "fixed" };
    crate::common::make_input(
        p.nodes,
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![(1, spec.column.0, spec.column.1), (2, spec.beam.0, spec.beam.1)],
        p.members.iter().map(|&(id, a, b, s)| (id, "frame", a, b, 1, s, false, false)).collect(),
        p.bases.iter().enumerate().map(|(i, &n)| (i + 1, n, base)).collect(),
        loads,
    )
}

/// A space frame: `spec`'s plane frame repeated on two lines y = 0 and y = depth,
/// joined at each floor by transverse beams (section 3), loaded in x, y and z.
pub fn space_frame_3d(spec: &FrameSpec, depth: f64) -> SolverInput3D {
    let p = plane_frame(spec);
    let offset = p.nodes.iter().map(|n| n.0).max().unwrap();
    let mut nodes: Vec<(usize, f64, f64, f64)> = p.nodes.iter().map(|&(id, x, z)| (id, x, 0.0, z)).collect();
    nodes.extend(p.nodes.iter().map(|&(id, x, z)| (id + offset, x, depth, z)));
    let mut elems: Vec<(usize, &str, usize, usize, usize, usize)> =
        p.members.iter().map(|&(id, a, b, s)| (id, "frame", a, b, 1, s)).collect();
    let eoff = elems.len();
    elems.extend(p.members.iter().map(|&(id, a, b, s)| (id + eoff, "frame", a + offset, b + offset, 1, s)));
    let mut eid = 2 * eoff + 1;
    for floor in &p.floors {
        for &n in floor {
            elems.push((eid, "frame", n, n + offset, 1, 3));
            eid += 1;
        }
    }
    let mut loads = Vec::new();
    for (level, floor) in p.floors.iter().enumerate() {
        let share = (level + 1) as f64 / spec.storeys as f64;
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: floor[0], fx: spec.lateral_kn * share, fy: 0.6 * spec.lateral_kn * share, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
        for &n in floor {
            for id in [n, n + offset] {
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id: id, fx: 0.0, fy: 0.0, fz: -spec.gravity_kn, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
                }));
            }
        }
    }
    let fixity = if spec.pinned_bases { vec![true, true, true, false, false, false] } else { vec![true; 6] };
    let (ca, ci) = spec.column;
    let (ba, bi) = spec.beam;
    crate::common::make_3d_input(
        nodes,
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![
            (1, ca, ci, 0.45 * ci, 0.02 * ci),
            (2, ba, bi, 0.3 * bi, 0.02 * bi),
            (3, 0.8 * ba, 0.7 * bi, 0.25 * bi, 0.02 * bi),
        ],
        elems,
        p.bases.iter().flat_map(|&n| [(n, fixity.clone()), (n + offset, fixity.clone())]).collect(),
        loads,
    )
}

pub fn beams(s: &SolverInput) -> Vec<usize> {
    let mut ids: Vec<usize> = s.elements.values().filter(|e| e.section_id == 2).map(|e| e.id).collect();
    ids.sort_unstable();
    ids
}

pub fn first_beam(s: &SolverInput) -> usize {
    beams(s)[0]
}
