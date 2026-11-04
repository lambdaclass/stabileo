//! Uniform h-refinement of a 3D model: every shell-type element split into four, for the
//! convergence study.
//!
//! * DKT triangles into four triangles (edge midpoints); MITC4 quads and curved shells into four
//!   quads (edge midpoints and a centre node); MITC9 quads into four MITC9 quads on the parent's
//!   own quadratic geometry; solid-shells into four in the plane, still one element through the
//!   thickness. Children keep the parent's node order sense, so normals and edge loads keep
//!   their direction.
//! * Geometry (`GeometryMode`). `Faceted` keeps the model exactly as drawn: new nodes on the
//!   straight edges and bilinear faces of the parents. `Smooth` treats the mesh as a sampling of
//!   a smooth surface: a new edge node sits on a quadratic surface fitted to the nodes around the
//!   edge ends (see `surface_point`), so a coarse faceted roof converges to the curved roof rather than to the polyhedron. Edges on a fold (normals
//!   more than `CREASE_ANGLE_DEG` apart), edges shared by three or more elements and edges that
//!   carry a frame member stay straight in both modes. MITC9 elements always use their own
//!   quadratic geometry.
//! * Frame members along a split edge are split at the same node (exact: a member split in two
//!   has the same stiffness and, with its loads split, the same fixed-end forces). Releases stay
//!   at the outer ends.
//! * Supports: a new node on an exterior edge (one element on it) between supported nodes gets
//!   the restraints they share, and prescribed displacements interpolated: a plate simply
//!   supported on its edges, however coarse, stays supported along them. Nodes on interior edges
//!   and element centres stay free: between two columns of a slab meshed one element per bay
//!   there is no supported line, and a wall under a slab drawn as a row of supported nodes is
//!   refined as that row of points. Supports added this way are counted (caveat
//!   `supportsInferred`): the rule cannot tell columns on a free edge from a coarse supported
//!   edge. Springs are not copied (caveat).
//! * Loads: element pressures, temperatures and self-weight go to every child; edge loads to the
//!   children on that edge; nodal loads stay on their nodes.
//!
//! Models with constraints, connectors or curved beams are refused: refining them needs choices
//! (which new nodes a diaphragm or a rigid link takes in) that are not the engine's to make.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::recovery::CREASE_ANGLE_DEG;
use super::samples::{add, cross3, dot, norm3, scale, sub};
use crate::types::*;

/// Where refinement puts new nodes (see the module documentation).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum GeometryMode {
    #[default]
    Smooth,
    Faceted,
}

/// A refined model and what the refinement could not carry over exactly.
#[derive(Debug, Clone)]
pub struct Refined {
    pub input: SolverInput3D,
    /// Codes: `springsNotDistributed`, `inclinedSupportsDropped`, `supportsInferred`.
    pub caveats: Vec<String>,
    /// New nodes given a support (exterior edges between supported nodes).
    pub supports_inferred: usize,
}

/// Why a model cannot be refined automatically, or Ok. Node references are checked here:
/// refinement indexes node coordinates before any solver validation runs.
pub fn check_refinable(input: &SolverInput3D) -> Result<(), String> {
    if !input.constraints.is_empty() {
        return Err("constraints".into());
    }
    if !input.connectors.is_empty() {
        return Err("connectors".into());
    }
    if !input.curved_beams.is_empty() {
        return Err("curvedBeams".into());
    }
    let shells = input.plates.len() + input.quads.len() + input.quad9s.len()
        + input.curved_shells.len() + input.solid_shells.len();
    if shells == 0 {
        return Err("noShellElements".into());
    }
    let nodes: HashSet<usize> = input.nodes.values().map(|n| n.id).collect();
    let check = |kind: &str, id: usize, ns: &[usize]| -> Result<(), String> {
        match ns.iter().find(|n| !nodes.contains(n)) {
            Some(n) => Err(format!("node {n} not found ({kind} {id})")),
            None => Ok(()),
        }
    };
    input.plates.values().try_for_each(|e| check("plate", e.id, &e.nodes))?;
    input.quads.values().try_for_each(|e| check("quad", e.id, &e.nodes))?;
    input.quad9s.values().try_for_each(|e| check("quad9", e.id, &e.nodes))?;
    input.curved_shells.values().try_for_each(|e| check("curvedShell", e.id, &e.nodes))?;
    input.solid_shells.values().try_for_each(|e| check("solidShell", e.id, &e.nodes))?;
    input.elements.values().try_for_each(|e| check("element", e.id, &[e.node_i, e.node_j]))?;
    Ok(())
}

struct Builder<'a> {
    input: &'a SolverInput3D,
    mode: GeometryMode,
    coords: HashMap<usize, [f64; 3]>,
    next_node: usize,
    next_elem: usize,
    /// Midpoint node of the segment between two nodes (key sorted).
    mids: HashMap<(usize, usize), usize>,
    /// Centre node of a quadrilateral face (key sorted).
    faces: HashMap<[usize; 4], usize>,
    /// Parent nodes of every new node (for supports).
    parents: Vec<(usize, Vec<usize>)>,
    /// Facets around each node: (facet index).
    node_facets: HashMap<usize, Vec<usize>>,
    /// Facets: corner nodes and the normal at each corner.
    facets: Vec<(Vec<usize>, Vec<[f64; 3]>)>,
    /// Facets sharing each edge.
    edge_facets: HashMap<(usize, usize), Vec<usize>>,
    frame_edges: HashSet<(usize, usize)>,
    new_nodes: Vec<SolverNode3D>,
}

fn key(a: usize, b: usize) -> (usize, usize) {
    if a < b { (a, b) } else { (b, a) }
}

fn unit(v: [f64; 3]) -> [f64; 3] {
    let l = norm3(&v);
    if l > 0.0 { scale(&v, 1.0 / l) } else { [0.0, 0.0, 1.0] }
}

fn quad_normal(c: &[[f64; 3]]) -> [f64; 3] {
    unit(cross3(&sub(&c[2], &c[0]), &sub(&c[3], &c[1])))
}

impl<'a> Builder<'a> {
    fn new(input: &'a SolverInput3D, mode: GeometryMode) -> Self {
        let coords: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
        let next_node = coords.keys().copied().max().unwrap_or(0) + 1;
        let max_elem = input.elements.values().map(|e| e.id)
            .chain(input.plates.values().map(|e| e.id))
            .chain(input.quads.values().map(|e| e.id))
            .chain(input.quad9s.values().map(|e| e.id))
            .chain(input.curved_shells.values().map(|e| e.id))
            .chain(input.solid_shells.values().map(|e| e.id))
            .max()
            .unwrap_or(0);
        let frame_edges = input.elements.values().map(|e| key(e.node_i, e.node_j)).collect();
        let mut b = Builder {
            input, mode, coords, next_node, next_elem: max_elem + 1,
            mids: HashMap::new(), faces: HashMap::new(), parents: Vec::new(),
            node_facets: HashMap::new(), facets: Vec::new(), edge_facets: HashMap::new(),
            frame_edges, new_nodes: Vec::new(),
        };
        b.build_facets();
        b
    }

    fn c(&self, id: usize) -> [f64; 3] {
        self.coords[&id]
    }

    fn add_facet(&mut self, nodes: Vec<usize>, normals: Vec<[f64; 3]>) {
        let fi = self.facets.len();
        for (i, &n) in nodes.iter().enumerate() {
            self.node_facets.entry(n).or_default().push(fi);
            let m = nodes[(i + 1) % nodes.len()];
            self.edge_facets.entry(key(n, m)).or_default().push(fi);
        }
        self.facets.push((nodes, normals));
    }

    fn build_facets(&mut self) {
        let input = self.input;
        let mut plates: Vec<_> = input.plates.values().collect();
        plates.sort_by_key(|e| e.id);
        for p in plates {
            let c: Vec<_> = p.nodes.iter().map(|&n| self.c(n)).collect();
            let n = unit(cross3(&sub(&c[1], &c[0]), &sub(&c[2], &c[0])));
            self.add_facet(p.nodes.to_vec(), vec![n; 3]);
        }
        let mut quads: Vec<_> = input.quads.values().collect();
        quads.sort_by_key(|e| e.id);
        for q in quads {
            let c: Vec<_> = q.nodes.iter().map(|&n| self.c(n)).collect();
            self.add_facet(q.nodes.to_vec(), vec![quad_normal(&c); 4]);
        }
        let mut css: Vec<_> = input.curved_shells.values().collect();
        css.sort_by_key(|e| e.id);
        for cs in css {
            let c = [self.c(cs.nodes[0]), self.c(cs.nodes[1]), self.c(cs.nodes[2]), self.c(cs.nodes[3])];
            let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&c));
            self.add_facet(cs.nodes.to_vec(), dirs.iter().map(|d| unit(*d)).collect());
        }
        let mut sss: Vec<_> = input.solid_shells.values().collect();
        sss.sort_by_key(|e| e.id);
        for ss in sss {
            for face in [[0, 1, 2, 3], [4, 5, 6, 7]] {
                let nodes: Vec<usize> = face.iter().map(|&i| ss.nodes[i]).collect();
                let c: Vec<_> = nodes.iter().map(|&n| self.c(n)).collect();
                self.add_facet(nodes, vec![quad_normal(&c); 4]);
            }
        }
    }

    /// The point of the smooth surface over the middle of edge a–b: a quadratic
    /// z(x, y) = c0 + c1 x + c2 y + c3 x² + c4 xy + c5 y² fitted by least squares to the nodes of
    /// the facets around a and b, in a frame whose z is the edge's mean facet normal, evaluated
    /// at the chord midpoint. Only facets within the crease angle of the edge's facets take
    /// part. None (straight edge) on a fold, at a junction of three or more facets, or when the
    /// nodes cannot support the fit. A quadratic is fitted rather than a curve built from nodal
    /// normals because averaged normals are biased at free edges (they only see one side), and a
    /// one-sided quadratic is not.
    fn surface_point(&self, a: usize, b: usize) -> Option<[f64; 3]> {
        let fs = self.edge_facets.get(&key(a, b))?;
        let cos_c = CREASE_ANGLE_DEG.to_radians().cos();
        let nref = match fs.as_slice() {
            [f] => self.facet_normal(*f),
            [f, g] => {
                let (nf, ng) = (self.facet_normal(*f), self.facet_normal(*g));
                let d = dot(&nf, &ng);
                if d.abs() < cos_c { return None; }
                unit(add(&nf, &scale(&ng, d.signum())))
            }
            _ => return None,
        };
        let mut pts: Vec<[f64; 3]> = Vec::new();
        for &n in &[a, b] {
            for &g in &self.node_facets[&n] {
                if dot(&self.facet_normal(g), &nref).abs() < cos_c { continue; }
                for &m in &self.facets[g].0 {
                    let p = self.c(m);
                    if !pts.contains(&p) { pts.push(p); }
                }
            }
        }
        let (pa, pb) = (self.c(a), self.c(b));
        let mid = scale(&add(&pa, &pb), 0.5);
        // x along the edge (projected on the tangent plane), y across it.
        let e = sub(&pb, &pa);
        let t1 = unit(sub(&e, &scale(&nref, dot(&e, &nref))));
        let t2 = cross3(&nref, &t1);
        let h = norm3(&e).max(1e-300);
        let loc = |p: &[f64; 3]| { let d = sub(p, &mid); (dot(&d, &t1) / h, dot(&d, &t2) / h, dot(&d, &nref) / h) };
        // Full quadratic when the nodes support it, else curvature along the edge only.
        let fit = |terms: usize| -> Option<[f64; 6]> {
            if pts.len() < terms { return None; }
            let mut ata = [[0.0; 6]; 6];
            let mut atb = [0.0; 6];
            for (i, row) in ata.iter_mut().enumerate().skip(terms) { row[i] = 1.0; }
            for p in &pts {
                let (x, y, z) = loc(p);
                let full = [1.0, x, y, x * x, x * y, y * y];
                for i in 0..terms {
                    for j in 0..terms { ata[i][j] += full[i] * full[j]; }
                    atb[i] += full[i] * z;
                }
            }
            solve6(ata, atb)
        };
        let c = fit(6).or_else(|| fit(4))?;
        // z at the midpoint (x = y = 0) is c0; reject a fit that bends the edge implausibly.
        let dz = c[0];
        if !(dz.abs() < 0.25) { return None; }
        Some(add(&mid, &scale(&nref, dz * h)))
    }

    fn new_node(&mut self, pos: [f64; 3], parents: Vec<usize>) -> usize {
        let id = self.next_node;
        self.next_node += 1;
        self.coords.insert(id, pos);
        self.new_nodes.push(SolverNode3D { id, x: pos[0], y: pos[1], z: pos[2] });
        self.parents.push((id, parents));
        id
    }

    /// The (shared) node at the middle of shell edge a–b.
    fn edge_mid(&mut self, a: usize, b: usize) -> usize {
        if let Some(&m) = self.mids.get(&key(a, b)) {
            return m;
        }
        let (pa, pb) = (self.c(a), self.c(b));
        let lin = scale(&add(&pa, &pb), 0.5);
        let pos = if self.mode == GeometryMode::Faceted || self.frame_edges.contains(&key(a, b)) {
            lin
        } else {
            self.surface_point(a, b).unwrap_or(lin)
        };
        let m = self.new_node(pos, vec![a, b]);
        self.mids.insert(key(a, b), m);
        m
    }

    fn facet_normal(&self, fi: usize) -> [f64; 3] {
        let normals = &self.facets[fi].1;
        let mut acc = [0.0; 3];
        for v in normals {
            acc = add(&acc, v);
        }
        unit(acc)
    }

    /// Centre node of quadrilateral corners `c` with edge midpoints `m` (Coons patch; the
    /// bilinear centre in faceted mode).
    fn quad_centre(&mut self, c: [usize; 4], m: [usize; 4], shared: bool) -> usize {
        let mut k = c;
        k.sort_unstable();
        if shared {
            if let Some(&id) = self.faces.get(&k) {
                return id;
            }
        }
        let cs: [f64; 3] = c.iter().fold([0.0; 3], |a, &n| add(&a, &self.c(n)));
        let pos = if self.mode == GeometryMode::Faceted {
            scale(&cs, 0.25)
        } else {
            let ms: [f64; 3] = m.iter().fold([0.0; 3], |a, &n| add(&a, &self.c(n)));
            sub(&scale(&ms, 0.5), &scale(&cs, 0.25))
        };
        let id = self.new_node(pos, c.to_vec());
        if shared {
            self.faces.insert(k, id);
        }
        id
    }

    fn elem_id(&mut self) -> usize {
        let id = self.next_elem;
        self.next_elem += 1;
        id
    }
}

/// Children of a quad split [c0..c3] with edge midpoints m_k (edge k: c_k → c_{k+1}) and
/// centre: child k = [c_k, m_k, centre, m_{k−1}].
fn quad_children(c: [usize; 4], m: [usize; 4], centre: usize) -> [[usize; 4]; 4] {
    [0, 1, 2, 3].map(|k| [c[k], m[k], centre, m[(k + 3) % 4]])
}

/// Refine every shell-type element of `input` once.
pub fn refine_uniform(input: &SolverInput3D, mode: GeometryMode) -> Result<Refined, String> {
    check_refinable(input)?;
    let mut b = Builder::new(input, mode);
    let mut out = input.clone();
    out.plates.clear();
    out.quads.clear();
    out.quad9s.clear();
    out.curved_shells.clear();
    out.solid_shells.clear();
    // (family tag, parent id) → children; and for quads, parent edge → (child, child edge).
    let mut children: HashMap<(&'static str, usize), Vec<usize>> = HashMap::new();
    let mut edge_children: HashMap<(&'static str, usize, usize), Vec<(usize, usize)>> = HashMap::new();

    let mut plates: Vec<_> = input.plates.values().cloned().collect();
    plates.sort_by_key(|e| e.id);
    for p in plates {
        let [a, bb, c] = p.nodes;
        let (m0, m1, m2) = (b.edge_mid(a, bb), b.edge_mid(bb, c), b.edge_mid(c, a));
        let mut ids = Vec::new();
        for nodes in [[a, m0, m2], [m0, bb, m1], [m2, m1, c], [m0, m1, m2]] {
            let id = b.elem_id();
            out.plates.insert(id.to_string(), SolverPlateElement { id, nodes, ..p.clone() });
            ids.push(id);
        }
        children.insert(("plate", p.id), ids);
    }

    let mut quads: Vec<_> = input.quads.values().cloned().collect();
    quads.sort_by_key(|e| e.id);
    for q in quads {
        let c = q.nodes;
        let m = [0, 1, 2, 3].map(|k| b.edge_mid(c[k], c[(k + 1) % 4]));
        let centre = b.quad_centre(c, m, false);
        let mut ids = Vec::new();
        for nodes in quad_children(c, m, centre) {
            let id = b.elem_id();
            out.quads.insert(id.to_string(), SolverQuadElement { id, nodes, ..q.clone() });
            ids.push(id);
        }
        for e in 0..4 {
            edge_children.insert(("quad", q.id, e), vec![(ids[e], 0), (ids[(e + 1) % 4], 3)]);
        }
        children.insert(("quad", q.id), ids);
    }

    let mut css: Vec<_> = input.curved_shells.values().cloned().collect();
    css.sort_by_key(|e| e.id);
    for cs in css {
        let c = cs.nodes;
        let pc = [b.c(c[0]), b.c(c[1]), b.c(c[2]), b.c(c[3])];
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&pc));
        let m = [0, 1, 2, 3].map(|k| b.edge_mid(c[k], c[(k + 1) % 4]));
        let centre = b.quad_centre(c, m, false);
        // Directors at the parent's natural coordinates of each child node.
        let nat = |n: usize| -> (f64, f64) {
            if let Some(k) = c.iter().position(|&x| x == n) {
                return [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)][k];
            }
            if let Some(k) = m.iter().position(|&x| x == n) {
                return [(0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0)][k];
            }
            (0.0, 0.0)
        };
        let director = |n: usize| -> [f64; 3] {
            let (xi, eta) = nat(n);
            let w = [
                0.25 * (1.0 - xi) * (1.0 - eta),
                0.25 * (1.0 + xi) * (1.0 - eta),
                0.25 * (1.0 + xi) * (1.0 + eta),
                0.25 * (1.0 - xi) * (1.0 + eta),
            ];
            let mut d = [0.0; 3];
            for i in 0..4 {
                d = add(&d, &scale(&dirs[i], w[i]));
            }
            unit(d)
        };
        let mut ids = Vec::new();
        for nodes in quad_children(c, m, centre) {
            let id = b.elem_id();
            let normals = Some(nodes.map(director));
            out.curved_shells.insert(id.to_string(), SolverCurvedShellElement { id, nodes, normals, ..cs.clone() });
            ids.push(id);
        }
        for e in 0..4 {
            edge_children.insert(("curvedShell", cs.id, e), vec![(ids[e], 0), (ids[(e + 1) % 4], 3)]);
        }
        children.insert(("curvedShell", cs.id), ids);
    }

    let mut q9s: Vec<_> = input.quad9s.values().cloned().collect();
    q9s.sort_by_key(|e| e.id);
    for q in q9s {
        let pc: Vec<[f64; 3]> = q.nodes.iter().map(|&n| b.c(n)).collect();
        // Lattice (i, j), i, j ∈ 0..=4, at ξ = −1 + i/2, η = −1 + j/2.
        let mut lat = [[usize::MAX; 5]; 5];
        let even = [(0, 0, 0), (4, 0, 1), (4, 4, 2), (0, 4, 3), (2, 0, 4), (4, 2, 5), (2, 4, 6), (0, 2, 7), (2, 2, 8)];
        for (i, j, k) in even {
            lat[i][j] = q.nodes[k];
        }
        let place = |i: usize, j: usize| -> [f64; 3] {
            let n = crate::element::quad9::shape_functions_9(-1.0 + 0.5 * i as f64, -1.0 + 0.5 * j as f64);
            let mut p = [0.0; 3];
            for k in 0..9 {
                p = add(&p, &scale(&pc[k], n[k]));
            }
            p
        };
        for i in 0..5 {
            for j in 0..5 {
                if lat[i][j] != usize::MAX { continue; }
                let pos = place(i, j);
                lat[i][j] = if i % 2 == 1 && j % 2 == 0 {
                    q9_seg(&mut b, lat[i - 1][j], lat[i + 1][j], pos)
                } else if i % 2 == 0 && j % 2 == 1 {
                    q9_seg(&mut b, lat[i][j - 1], lat[i][j + 1], pos)
                } else {
                    let ps = vec![lat[i - 1][j - 1], lat[i + 1][j - 1], lat[i + 1][j + 1], lat[i - 1][j + 1]];
                    b.new_node(pos, ps)
                };
            }
        }
        let mut ids = Vec::new();
        for (ci, cj) in [(0, 0), (2, 0), (2, 2), (0, 2)] {
            let at = |di: usize, dj: usize| lat[ci + di][cj + dj];
            let nodes = [at(0, 0), at(2, 0), at(2, 2), at(0, 2), at(1, 0), at(2, 1), at(1, 2), at(0, 1), at(1, 1)];
            let id = b.elem_id();
            out.quad9s.insert(id.to_string(), SolverQuad9Element { id, nodes, ..q.clone() });
            ids.push(id);
        }
        // Parent edge e lies on children (e, e+1) of the quadrant order, on their edge e.
        for e in 0..4 {
            edge_children.insert(("quad9", q.id, e), vec![(ids[e], e), (ids[(e + 1) % 4], e)]);
        }
        children.insert(("quad9", q.id), ids);
    }

    let mut sss: Vec<_> = input.solid_shells.values().cloned().collect();
    sss.sort_by_key(|e| e.id);
    for ss in sss {
        let bot = [ss.nodes[0], ss.nodes[1], ss.nodes[2], ss.nodes[3]];
        let top = [ss.nodes[4], ss.nodes[5], ss.nodes[6], ss.nodes[7]];
        let mb = [0, 1, 2, 3].map(|k| b.edge_mid(bot[k], bot[(k + 1) % 4]));
        let mt = [0, 1, 2, 3].map(|k| b.edge_mid(top[k], top[(k + 1) % 4]));
        let cb = b.quad_centre(bot, mb, true);
        let ct = b.quad_centre(top, mt, true);
        let (kb, kt) = (quad_children(bot, mb, cb), quad_children(top, mt, ct));
        let mut ids = Vec::new();
        for k in 0..4 {
            let id = b.elem_id();
            let nodes = [kb[k][0], kb[k][1], kb[k][2], kb[k][3], kt[k][0], kt[k][1], kt[k][2], kt[k][3]];
            out.solid_shells.insert(id.to_string(), SolverSolidShellElement { id, nodes, ..ss.clone() });
            ids.push(id);
        }
        children.insert(("solidShell", ss.id), ids);
    }

    // Frames along split edges.
    let mut frame_halves: HashMap<usize, (usize, usize, f64)> = HashMap::new(); // parent → (child1, child2, L1/L)
    let mut frames: Vec<_> = input.elements.values().cloned().collect();
    frames.sort_by_key(|e| e.id);
    for f in frames {
        let Some(&m) = b.mids.get(&key(f.node_i, f.node_j)) else { continue };
        out.elements.remove(&f.id.to_string());
        let (pi, pj, pm) = (b.c(f.node_i), b.c(f.node_j), b.c(m));
        let (l1, l2) = (norm3(&sub(&pm, &pi)), norm3(&sub(&pj, &pm)));
        let (id1, id2) = (b.elem_id(), b.elem_id());
        out.elements.insert(id1.to_string(), SolverElement3D {
            id: id1, node_j: m, release_my_end: false, release_mz_end: false, release_t_end: false, ..f.clone()
        });
        out.elements.insert(id2.to_string(), SolverElement3D {
            id: id2, node_i: m, release_my_start: false, release_mz_start: false, release_t_start: false, ..f.clone()
        });
        frame_halves.insert(f.id, (id1, id2, l1 / (l1 + l2)));
    }

    // Loads.
    let frames_by_id: HashMap<usize, &SolverElement3D> = input.elements.values().map(|e| (e.id, e)).collect();
    let mut loads = Vec::with_capacity(input.loads.len());
    let fam_of = |l: &SolverLoad3D| -> Option<(&'static str, usize)> {
        Some(match l {
            SolverLoad3D::Pressure(p) => ("plate", p.element_id),
            SolverLoad3D::PlateThermal(t) => ("plate", t.element_id),
            SolverLoad3D::QuadPressure(p) => ("quad", p.element_id),
            SolverLoad3D::QuadThermal(t) => ("quad", t.element_id),
            SolverLoad3D::QuadSelfWeight(s) => ("quad", s.element_id),
            SolverLoad3D::Quad9Pressure(p) => ("quad9", p.element_id),
            SolverLoad3D::Quad9Thermal(t) => ("quad9", t.element_id),
            SolverLoad3D::Quad9SelfWeight(s) => ("quad9", s.element_id),
            SolverLoad3D::SolidShellPressure(p) => ("solidShell", p.element_id),
            SolverLoad3D::SolidShellSelfWeight(s) => ("solidShell", s.element_id),
            SolverLoad3D::CurvedShellPressure(p) => ("curvedShell", p.element_id),
            SolverLoad3D::CurvedShellThermal(t) => ("curvedShell", t.element_id),
            SolverLoad3D::CurvedShellSelfWeight(s) => ("curvedShell", s.element_id),
            _ => return None,
        })
    };
    for load in &input.loads {
        if let Some(k) = fam_of(load) {
            let kids = children.get(&k).ok_or_else(|| format!("load on unknown {} {}", k.0, k.1))?;
            for &child in kids {
                let mut l = load.clone();
                set_element_id(&mut l, child);
                loads.push(l);
            }
            continue;
        }
        match load {
            SolverLoad3D::QuadEdge(el) | SolverLoad3D::Quad9Edge(el) | SolverLoad3D::CurvedShellEdge(el) => {
                let tag = match load {
                    SolverLoad3D::QuadEdge(_) => "quad",
                    SolverLoad3D::Quad9Edge(_) => "quad9",
                    _ => "curvedShell",
                };
                let parts = edge_children
                    .get(&(tag, el.element_id, el.edge))
                    .ok_or_else(|| format!("edge load on unknown {tag} {} edge {}", el.element_id, el.edge))?;
                for &(child, edge) in parts {
                    let ne = SolverQuadEdgeLoad { element_id: child, edge, ..el.clone() };
                    loads.push(match load {
                        SolverLoad3D::QuadEdge(_) => SolverLoad3D::QuadEdge(ne),
                        SolverLoad3D::Quad9Edge(_) => SolverLoad3D::Quad9Edge(ne),
                        _ => SolverLoad3D::CurvedShellEdge(ne),
                    });
                }
            }
            SolverLoad3D::Distributed(dl) if frame_halves.contains_key(&dl.element_id) => {
                let (c1, c2, r) = frame_halves[&dl.element_id];
                let f = frames_by_id[&dl.element_id];
                let l = norm3(&sub(&b.c(f.node_j), &b.c(f.node_i)));
                loads.extend(split_distributed(dl, l, r, c1, c2, &b, f));
            }
            SolverLoad3D::PointOnElement(pl) if frame_halves.contains_key(&pl.element_id) => {
                let (c1, c2, r) = frame_halves[&pl.element_id];
                let f = frames_by_id[&pl.element_id];
                let l = norm3(&sub(&b.c(f.node_j), &b.c(f.node_i)));
                let (l1, l2) = half_lengths(&b, f);
                let s = pl.a / l;
                let np = if s <= r {
                    SolverPointLoad3D { element_id: c1, a: s / r * l1, ..pl.clone() }
                } else {
                    SolverPointLoad3D { element_id: c2, a: (s - r) / (1.0 - r) * l2, ..pl.clone() }
                };
                loads.push(SolverLoad3D::PointOnElement(np));
            }
            SolverLoad3D::Thermal(tl) if frame_halves.contains_key(&tl.element_id) => {
                let (c1, c2, _) = frame_halves[&tl.element_id];
                for c in [c1, c2] {
                    loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: c, ..tl.clone() }));
                }
            }
            other => loads.push(other.clone()),
        }
    }
    out.loads = loads;

    // Supports at new nodes.
    let mut caveats = Vec::new();
    let sup_by_node: HashMap<usize, &SolverSupport3D> = input.supports.values().map(|s| (s.node_id, s)).collect();
    let mut next_sup = input.supports.keys().filter_map(|k| k.parse::<usize>().ok()).max().unwrap_or(0) + 1;
    // Element boundary segments and how many elements share each: one is an exterior edge.
    let mut seg_count: HashMap<(usize, usize), usize> = HashMap::new();
    let mut ring = |ns: &[usize]| {
        for k in 0..ns.len() {
            *seg_count.entry(key(ns[k], ns[(k + 1) % ns.len()])).or_default() += 1;
        }
    };
    input.plates.values().for_each(|e| ring(&e.nodes));
    input.quads.values().for_each(|e| ring(&e.nodes));
    input.curved_shells.values().for_each(|e| ring(&e.nodes));
    for e in input.quad9s.values() {
        let n = e.nodes;
        ring(&[n[0], n[4], n[1], n[5], n[2], n[6], n[3], n[7]]);
    }
    for e in input.solid_shells.values() {
        ring(&e.nodes[..4]);
        ring(&e.nodes[4..]);
    }
    let mut supports_inferred = 0;
    for (nid, ps) in &b.parents {
        // Only a node on an exterior edge between two supported nodes (see the module docs).
        let [p, q] = ps.as_slice() else { continue };
        if seg_count.get(&key(*p, *q)) != Some(&1) {
            continue;
        }
        let (Some(&sp), Some(&sq)) = (sup_by_node.get(p), sup_by_node.get(q)) else { continue };
        let sups = [sp, sq];
        if sups.iter().any(|s| [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz].iter().any(|k| k.is_some_and(|v| v != 0.0))) {
            push_once(&mut caveats, "springsNotDistributed");
        }
        let inclined = |s: &SolverSupport3D| s.is_inclined == Some(true);
        if sups.iter().any(|s| inclined(s)) {
            let same = sups.iter().all(|s| inclined(s) && s.normal_x == sups[0].normal_x && s.normal_y == sups[0].normal_y && s.normal_z == sups[0].normal_z);
            if !same {
                push_once(&mut caveats, "inclinedSupportsDropped");
                continue;
            }
        }
        let all = |f: fn(&SolverSupport3D) -> bool| sups.iter().all(|s| f(s));
        let avg = |f: fn(&SolverSupport3D) -> Option<f64>, on: bool| -> Option<f64> {
            if !on { return None; }
            let v: f64 = sups.iter().map(|s| f(s).unwrap_or(0.0)).sum::<f64>() / sups.len() as f64;
            if sups.iter().any(|s| f(s).is_some()) { Some(v) } else { None }
        };
        let (rx, ry, rz) = (all(|s| s.rx), all(|s| s.ry), all(|s| s.rz));
        let (rrx, rry, rrz) = (all(|s| s.rrx), all(|s| s.rry), all(|s| s.rrz));
        if !(rx || ry || rz || rrx || rry || rrz) {
            continue;
        }
        let s0 = sups[0];
        supports_inferred += 1;
        out.supports.insert(next_sup.to_string(), SolverSupport3D {
            node_id: *nid, rx, ry, rz, rrx, rry, rrz,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: avg(|s| s.dx, rx), dy: avg(|s| s.dy, ry), dz: avg(|s| s.dz, rz),
            drx: avg(|s| s.drx, rrx), dry: avg(|s| s.dry, rry), drz: avg(|s| s.drz, rrz),
            rw: None, kw: None,
            normal_x: s0.normal_x, normal_y: s0.normal_y, normal_z: s0.normal_z,
            is_inclined: s0.is_inclined,
        });
        next_sup += 1;
    }

    if supports_inferred > 0 {
        push_once(&mut caveats, "supportsInferred");
    }
    for n in b.new_nodes.drain(..) {
        out.nodes.insert(n.id.to_string(), n);
    }
    Ok(Refined { input: out, caveats, supports_inferred })
}

/// Small dense solve with partial pivoting; None when (nearly) singular.
fn solve6(mut a: [[f64; 6]; 6], mut b: [f64; 6]) -> Option<[f64; 6]> {
    let scale = (0..6).map(|i| a[i][i].abs()).fold(0.0, f64::max);
    for col in 0..6 {
        let piv = (col..6).max_by(|&i, &j| a[i][col].abs().total_cmp(&a[j][col].abs()))?;
        if !(a[piv][col].abs() > 1e-10 * scale) { return None; }
        a.swap(col, piv);
        b.swap(col, piv);
        for r in col + 1..6 {
            let f = a[r][col] / a[col][col];
            for k in col..6 { a[r][k] -= f * a[col][k]; }
            b[r] -= f * b[col];
        }
    }
    let mut x = [0.0; 6];
    for r in (0..6).rev() {
        let mut v = b[r];
        for k in r + 1..6 { v -= a[r][k] * x[k]; }
        x[r] = v / a[r][r];
    }
    x.iter().all(|v| v.is_finite()).then_some(x)
}

fn push_once(v: &mut Vec<String>, s: &str) {
    if !v.iter().any(|x| x == s) {
        v.push(s.to_string());
    }
}

fn q9_seg(b: &mut Builder, a: usize, c: usize, pos: [f64; 3]) -> usize {
    if let Some(&m) = b.mids.get(&key(a, c)) {
        return m;
    }
    let m = b.new_node(pos, vec![a, c]);
    b.mids.insert(key(a, c), m);
    m
}

fn half_lengths(b: &Builder, f: &SolverElement3D) -> (f64, f64) {
    let m = b.mids[&key(f.node_i, f.node_j)];
    (norm3(&sub(&b.c(m), &b.c(f.node_i))), norm3(&sub(&b.c(f.node_j), &b.c(m))))
}

/// Split a linearly varying member load on [a, b] of a member of length `l` at the parameter
/// `r` (fraction of the length), positions rescaled to each half's own length.
fn split_distributed(dl: &SolverDistributedLoad3D, l: f64, r: f64, c1: usize, c2: usize, b: &Builder, f: &SolverElement3D) -> Vec<SolverLoad3D> {
    let (l1, l2) = half_lengths(b, f);
    let (a, bb) = (dl.a.unwrap_or(0.0) / l, dl.b.unwrap_or(l) / l);
    let lerp = |q0: f64, q1: f64, s: f64| if bb > a { q0 + (q1 - q0) * (s - a) / (bb - a) } else { q0 };
    let mut out = Vec::new();
    for (lo, hi, child, len) in [(0.0, r, c1, l1), (r, 1.0, c2, l2)] {
        let (s0, s1) = (a.max(lo), bb.min(hi));
        if s1 - s0 <= 1e-12 {
            continue;
        }
        let map = |s: f64| (s - lo) / (hi - lo) * len;
        out.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: child,
            q_xi: lerp(dl.q_xi, dl.q_xj, s0), q_xj: lerp(dl.q_xi, dl.q_xj, s1),
            q_yi: lerp(dl.q_yi, dl.q_yj, s0), q_yj: lerp(dl.q_yi, dl.q_yj, s1),
            q_zi: lerp(dl.q_zi, dl.q_zj, s0), q_zj: lerp(dl.q_zi, dl.q_zj, s1),
            a: Some(map(s0)), b: Some(map(s1)),
        }));
    }
    out
}

fn set_element_id(l: &mut SolverLoad3D, id: usize) {
    match l {
        SolverLoad3D::Pressure(p) | SolverLoad3D::QuadPressure(p) | SolverLoad3D::Quad9Pressure(p)
        | SolverLoad3D::SolidShellPressure(p) | SolverLoad3D::CurvedShellPressure(p) => p.element_id = id,
        SolverLoad3D::PlateThermal(t) | SolverLoad3D::QuadThermal(t) | SolverLoad3D::Quad9Thermal(t)
        | SolverLoad3D::CurvedShellThermal(t) => t.element_id = id,
        SolverLoad3D::QuadSelfWeight(s) | SolverLoad3D::Quad9SelfWeight(s) | SolverLoad3D::CurvedShellSelfWeight(s) => s.element_id = id,
        SolverLoad3D::SolidShellSelfWeight(s) => s.element_id = id,
        _ => {}
    }
}
