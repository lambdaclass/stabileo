//! Renumbering and reordering: every id (nodes, elements, supports,
//! materials, sections, connectors, shells) is replaced through a random
//! bijection onto a sparse, non-contiguous id set, every map is rebuilt in a
//! fresh insertion order, and the load list is permuted. Nothing physical
//! changes, so every result — read back through the same bijection — must be
//! identical up to round-off.

use super::Rng;
use crate::types::*;
use std::collections::{BTreeMap, HashMap};

/// Old id → new id, per entity kind.
#[derive(Debug, Clone, Default)]
pub struct Relabel {
    pub node: BTreeMap<usize, usize>,
    pub element: BTreeMap<usize, usize>,
    pub support: BTreeMap<usize, usize>,
    pub material: BTreeMap<usize, usize>,
    pub section: BTreeMap<usize, usize>,
    pub connector: BTreeMap<usize, usize>,
    pub plate: BTreeMap<usize, usize>,
    pub quad: BTreeMap<usize, usize>,
    pub quad9: BTreeMap<usize, usize>,
    pub solid_shell: BTreeMap<usize, usize>,
    pub curved_shell: BTreeMap<usize, usize>,
    /// New position k of the load list holds old load `load_order[k]`.
    pub load_order: Vec<usize>,
}

/// A random bijection of `ids` onto distinct ids in [1, 50·n + 1000), not
/// sorted the same way as the originals.
fn bijection(ids: impl Iterator<Item = usize>, rng: &mut Rng) -> BTreeMap<usize, usize> {
    let ids: Vec<usize> = ids.collect();
    let span = 50 * ids.len() + 1000;
    let mut pool = std::collections::BTreeSet::new();
    while pool.len() < ids.len() {
        pool.insert(1 + rng.below(span));
    }
    let mut new: Vec<usize> = pool.into_iter().collect();
    rng.shuffle(&mut new);
    ids.into_iter().zip(new).collect()
}

fn get(m: &BTreeMap<usize, usize>, id: usize) -> usize {
    *m.get(&id).unwrap_or(&id)
}

/// Rebuild a keyed map with new ids as keys, inserted in a shuffled order.
fn rekey<T: Clone>(src: &HashMap<String, T>, rng: &mut Rng, f: impl Fn(&T) -> (usize, T)) -> HashMap<String, T> {
    let mut items: Vec<(usize, T)> = src.values().map(&f).collect();
    rng.shuffle(&mut items);
    items.into_iter().map(|(id, v)| (id.to_string(), v)).collect()
}

impl Relabel {
    pub fn random_2d(input: &SolverInput, seed: u64) -> Self {
        let mut rng = Rng::new(seed);
        let mut order: Vec<usize> = (0..input.loads.len()).collect();
        rng.shuffle(&mut order);
        Relabel {
            node: bijection(crate::ordered::values(&input.nodes).map(|n| n.id), &mut rng),
            element: bijection(crate::ordered::values(&input.elements).map(|e| e.id), &mut rng),
            support: bijection(crate::ordered::values(&input.supports).map(|s| s.id), &mut rng),
            material: bijection(crate::ordered::values(&input.materials).map(|m| m.id), &mut rng),
            section: bijection(crate::ordered::values(&input.sections).map(|s| s.id), &mut rng),
            connector: bijection(crate::ordered::values(&input.connectors).map(|c| c.id), &mut rng),
            load_order: order,
            ..Default::default()
        }
    }

    /// Curved beams are expanded first (their generated node and element ids
    /// depend on the largest existing id), so relabel the expanded model.
    pub fn random_3d(input: &SolverInput3D, seed: u64) -> Self {
        let input = &crate::solver::linear::expand_curved_beams_3d(input);
        let mut rng = Rng::new(seed);
        let mut order: Vec<usize> = (0..input.loads.len()).collect();
        rng.shuffle(&mut order);
        Relabel {
            node: bijection(crate::ordered::values(&input.nodes).map(|n| n.id), &mut rng),
            element: bijection(crate::ordered::values(&input.elements).map(|e| e.id), &mut rng),
            support: BTreeMap::new(),
            material: bijection(crate::ordered::values(&input.materials).map(|m| m.id), &mut rng),
            section: bijection(crate::ordered::values(&input.sections).map(|s| s.id), &mut rng),
            connector: bijection(crate::ordered::values(&input.connectors).map(|c| c.id), &mut rng),
            plate: bijection(crate::ordered::values(&input.plates).map(|p| p.id), &mut rng),
            quad: bijection(crate::ordered::values(&input.quads).map(|p| p.id), &mut rng),
            quad9: bijection(crate::ordered::values(&input.quad9s).map(|p| p.id), &mut rng),
            solid_shell: bijection(crate::ordered::values(&input.solid_shells).map(|p| p.id), &mut rng),
            curved_shell: bijection(crate::ordered::values(&input.curved_shells).map(|p| p.id), &mut rng),
            load_order: order,
        }
    }

    pub fn n(&self, id: usize) -> usize {
        get(&self.node, id)
    }
    pub fn e(&self, id: usize) -> usize {
        get(&self.element, id)
    }
    pub fn mat(&self, id: usize) -> usize {
        get(&self.material, id)
    }
    pub fn sec(&self, id: usize) -> usize {
        get(&self.section, id)
    }
    pub fn sup(&self, id: usize) -> usize {
        get(&self.support, id)
    }
    /// New index of old load `i`.
    pub fn load_index(&self, i: usize) -> usize {
        self.load_order.iter().position(|&k| k == i).unwrap_or(i)
    }
    /// Re-key a map keyed by old material ids (densities, material models).
    pub fn material_keyed<T: Clone>(&self, m: &HashMap<String, T>) -> HashMap<String, T> {
        m.iter().map(|(k, v)| (k.parse().map(|id| self.mat(id).to_string()).unwrap_or_else(|_| k.clone()), v.clone())).collect()
    }
    /// Re-key a map keyed by old section ids (plastic data, capacities).
    pub fn section_keyed<T: Clone>(&self, m: &HashMap<String, T>) -> HashMap<String, T> {
        m.iter().map(|(k, v)| (k.parse().map(|id| self.sec(id).to_string()).unwrap_or_else(|_| k.clone()), v.clone())).collect()
    }
    /// Re-key a map keyed by old element ids.
    pub fn element_keyed<T: Clone>(&self, m: &HashMap<String, T>) -> HashMap<String, T> {
        m.iter().map(|(k, v)| (k.parse().map(|id| self.e(id).to_string()).unwrap_or_else(|_| k.clone()), v.clone())).collect()
    }

    fn constraints(&self, cs: &[Constraint]) -> Vec<Constraint> {
        cs.iter()
            .map(|c| match c {
                Constraint::RigidLink(x) => {
                    let mut y = x.clone();
                    (y.master_node, y.slave_node) = (self.n(x.master_node), self.n(x.slave_node));
                    Constraint::RigidLink(y)
                }
                Constraint::Diaphragm(x) => {
                    let mut y = x.clone();
                    y.master_node = self.n(x.master_node);
                    y.slave_nodes = x.slave_nodes.iter().map(|&s| self.n(s)).collect();
                    Constraint::Diaphragm(y)
                }
                Constraint::EqualDOF(x) => {
                    let mut y = x.clone();
                    (y.master_node, y.slave_node) = (self.n(x.master_node), self.n(x.slave_node));
                    Constraint::EqualDOF(y)
                }
                Constraint::EccentricConnection(x) => {
                    let mut y = x.clone();
                    (y.master_node, y.slave_node) = (self.n(x.master_node), self.n(x.slave_node));
                    Constraint::EccentricConnection(y)
                }
                Constraint::LinearMPC(x) => Constraint::LinearMPC(LinearMPCConstraint {
                    terms: x.terms.iter().map(|t| MPCTerm { node_id: self.n(t.node_id), ..t.clone() }).collect(),
                }),
            })
            .collect()
    }

    fn connectors(&self, c: &HashMap<String, ConnectorElement>, rng: &mut Rng) -> HashMap<String, ConnectorElement> {
        rekey(c, rng, |x| {
            let id = get(&self.connector, x.id);
            (id, ConnectorElement { id, node_i: self.n(x.node_i), node_j: self.n(x.node_j), ..x.clone() })
        })
    }

    pub fn apply_2d(&self, input: &SolverInput, seed: u64) -> SolverInput {
        let mut rng = Rng::new(seed ^ 0x5151);
        SolverInput {
            nodes: rekey(&input.nodes, &mut rng, |n| (self.n(n.id), SolverNode { id: self.n(n.id), ..n.clone() })),
            materials: rekey(&input.materials, &mut rng, |m| (self.mat(m.id), SolverMaterial { id: self.mat(m.id), ..m.clone() })),
            sections: rekey(&input.sections, &mut rng, |s| (self.sec(s.id), SolverSection { id: self.sec(s.id), ..s.clone() })),
            elements: rekey(&input.elements, &mut rng, |e| {
                let id = self.e(e.id);
                (
                    id,
                    SolverElement {
                        id,
                        node_i: self.n(e.node_i),
                        node_j: self.n(e.node_j),
                        material_id: self.mat(e.material_id),
                        section_id: self.sec(e.section_id),
                        ..e.clone()
                    },
                )
            }),
            supports: rekey(&input.supports, &mut rng, |s| {
                let id = self.sup(s.id);
                (id, SolverSupport { id, node_id: self.n(s.node_id), ..s.clone() })
            }),
            loads: self.load_order.iter().map(|&i| self.load_2d(&input.loads[i])).collect(),
            constraints: self.constraints(&input.constraints),
            connectors: self.connectors(&input.connectors, &mut rng),
            solver_options: input.solver_options.clone(),
            masses: MassInput {
                nodal: input.masses.nodal.iter().map(|m| NodalMass { node_id: self.n(m.node_id), ..m.clone() }).collect(),
                line: input.masses.line.iter().map(|m| LineMass { element_id: self.e(m.element_id), ..m.clone() }).collect(),
            },
        }
    }

    /// Nodal, line and area masses, on the relabelled nodes and elements (an
    /// area mass's `kind` says which shell family its id names).
    fn masses_3d(&self, m: &MassInput3D) -> MassInput3D {
        MassInput3D {
            nodal: m.nodal.iter().map(|x| NodalMass3D { node_id: self.n(x.node_id), ..x.clone() }).collect(),
            line: m.line.iter().map(|x| LineMass { element_id: self.e(x.element_id), ..x.clone() }).collect(),
            area: m
                .area
                .iter()
                .map(|x| {
                    let map = match x.kind.as_str() {
                        "plate" => &self.plate,
                        "quad9" => &self.quad9,
                        "curvedShell" => &self.curved_shell,
                        _ => &self.quad,
                    };
                    AreaMass { element_id: get(map, x.element_id), ..x.clone() }
                })
                .collect(),
        }
    }

    pub fn load_2d(&self, l: &SolverLoad) -> SolverLoad {
        match l {
            SolverLoad::Nodal(x) => SolverLoad::Nodal(SolverNodalLoad { node_id: self.n(x.node_id), ..x.clone() }),
            SolverLoad::Distributed(x) => SolverLoad::Distributed(SolverDistributedLoad { element_id: self.e(x.element_id), ..x.clone() }),
            SolverLoad::PointOnElement(x) => SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: self.e(x.element_id), ..x.clone() }),
            SolverLoad::Thermal(x) => SolverLoad::Thermal(SolverThermalLoad { element_id: self.e(x.element_id), ..x.clone() }),
            SolverLoad::AxialDistributed(x) => SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: self.e(x.element_id), ..x.clone() }),
        }
    }

    pub fn load_3d(&self, l: &SolverLoad3D) -> SolverLoad3D {
        use SolverLoad3D as L;
        let pr = |x: &SolverPressureLoad, m: &BTreeMap<usize, usize>| SolverPressureLoad { element_id: get(m, x.element_id), ..x.clone() };
        let th = |x: &SolverPlateThermalLoad, m: &BTreeMap<usize, usize>| SolverPlateThermalLoad { element_id: get(m, x.element_id), ..x.clone() };
        let ed = |x: &SolverQuadEdgeLoad, m: &BTreeMap<usize, usize>| SolverQuadEdgeLoad { element_id: get(m, x.element_id), ..x.clone() };
        let sw = |x: &SolverQuadSelfWeightLoad, m: &BTreeMap<usize, usize>| SolverQuadSelfWeightLoad { element_id: get(m, x.element_id), ..x.clone() };
        match l {
            L::Nodal(x) => L::Nodal(SolverNodalLoad3D { node_id: self.n(x.node_id), ..x.clone() }),
            L::Distributed(x) => L::Distributed(SolverDistributedLoad3D { element_id: self.e(x.element_id), ..x.clone() }),
            L::PointOnElement(x) => L::PointOnElement(SolverPointLoad3D { element_id: self.e(x.element_id), ..x.clone() }),
            L::Thermal(x) => L::Thermal(SolverThermalLoad3D { element_id: self.e(x.element_id), ..x.clone() }),
            L::Bimoment(x) => L::Bimoment(SolverBimomentLoad { node_id: self.n(x.node_id), ..x.clone() }),
            L::Pressure(x) => L::Pressure(pr(x, &self.plate)),
            L::PlateThermal(x) => L::PlateThermal(th(x, &self.plate)),
            L::QuadPressure(x) => L::QuadPressure(pr(x, &self.quad)),
            L::QuadThermal(x) => L::QuadThermal(th(x, &self.quad)),
            L::QuadEdge(x) => L::QuadEdge(ed(x, &self.quad)),
            L::QuadSelfWeight(x) => L::QuadSelfWeight(sw(x, &self.quad)),
            L::Quad9Pressure(x) => L::Quad9Pressure(pr(x, &self.quad9)),
            L::Quad9Thermal(x) => L::Quad9Thermal(th(x, &self.quad9)),
            L::Quad9Edge(x) => L::Quad9Edge(ed(x, &self.quad9)),
            L::Quad9SelfWeight(x) => L::Quad9SelfWeight(sw(x, &self.quad9)),
            L::SolidShellPressure(x) => L::SolidShellPressure(pr(x, &self.solid_shell)),
            L::SolidShellSelfWeight(x) => {
                L::SolidShellSelfWeight(SolverSolidShellSelfWeightLoad { element_id: get(&self.solid_shell, x.element_id), ..x.clone() })
            }
            L::CurvedShellPressure(x) => L::CurvedShellPressure(pr(x, &self.curved_shell)),
            L::CurvedShellThermal(x) => L::CurvedShellThermal(th(x, &self.curved_shell)),
            L::CurvedShellEdge(x) => L::CurvedShellEdge(ed(x, &self.curved_shell)),
            L::CurvedShellSelfWeight(x) => L::CurvedShellSelfWeight(sw(x, &self.curved_shell)),
        }
    }

    pub fn apply_3d(&self, input: &SolverInput3D, seed: u64) -> SolverInput3D {
        let input = &crate::solver::linear::expand_curved_beams_3d(input);
        let mut rng = Rng::new(seed ^ 0x3d3d);
        let nn = |ids: &[usize]| -> Vec<usize> { ids.iter().map(|&i| self.n(i)).collect() };
        SolverInput3D {
            nodes: rekey(&input.nodes, &mut rng, |n| (self.n(n.id), SolverNode3D { id: self.n(n.id), ..n.clone() })),
            materials: rekey(&input.materials, &mut rng, |m| (self.mat(m.id), SolverMaterial { id: self.mat(m.id), ..m.clone() })),
            sections: rekey(&input.sections, &mut rng, |s| (self.sec(s.id), SolverSection3D { id: self.sec(s.id), ..s.clone() })),
            elements: rekey(&input.elements, &mut rng, |e| {
                let id = self.e(e.id);
                (
                    id,
                    SolverElement3D {
                        id,
                        node_i: self.n(e.node_i),
                        node_j: self.n(e.node_j),
                        material_id: self.mat(e.material_id),
                        section_id: self.sec(e.section_id),
                        ..e.clone()
                    },
                )
            }),
            // 3D supports carry no id; their key is the id staged analysis
            // refers to them by (a number), so re-key them with fresh numbers.
            supports: {
                let mut v: Vec<SolverSupport3D> = crate::ordered::values(&input.supports).map(|s| SolverSupport3D { node_id: self.n(s.node_id), ..s.clone() }).collect();
                rng.shuffle(&mut v);
                v.into_iter().enumerate().map(|(k, s)| ((7 * k + 3).to_string(), s)).collect()
            },
            loads: self.load_order.iter().map(|&i| self.load_3d(&input.loads[i])).collect(),
            constraints: self.constraints(&input.constraints),
            left_hand: input.left_hand,
            plates: rekey(&input.plates, &mut rng, |p| {
                let id = get(&self.plate, p.id);
                (id, SolverPlateElement { id, nodes: nn(&p.nodes).try_into().unwrap(), material_id: self.mat(p.material_id), ..p.clone() })
            }),
            quads: rekey(&input.quads, &mut rng, |p| {
                let id = get(&self.quad, p.id);
                (id, SolverQuadElement { id, nodes: nn(&p.nodes).try_into().unwrap(), material_id: self.mat(p.material_id), ..p.clone() })
            }),
            quad9s: rekey(&input.quad9s, &mut rng, |p| {
                let id = get(&self.quad9, p.id);
                (id, SolverQuad9Element { id, nodes: nn(&p.nodes).try_into().unwrap(), material_id: self.mat(p.material_id), ..p.clone() })
            }),
            solid_shells: rekey(&input.solid_shells, &mut rng, |p| {
                let id = get(&self.solid_shell, p.id);
                (id, SolverSolidShellElement { id, nodes: nn(&p.nodes).try_into().unwrap(), material_id: self.mat(p.material_id) })
            }),
            curved_shells: rekey(&input.curved_shells, &mut rng, |p| {
                let id = get(&self.curved_shell, p.id);
                (id, SolverCurvedShellElement { id, nodes: nn(&p.nodes).try_into().unwrap(), material_id: self.mat(p.material_id), ..p.clone() })
            }),
            curved_beams: input
                .curved_beams
                .iter()
                .map(|c| CurvedBeamInput {
                    node_start: self.n(c.node_start),
                    node_mid: self.n(c.node_mid),
                    node_end: self.n(c.node_end),
                    material_id: self.mat(c.material_id),
                    section_id: self.sec(c.section_id),
                    ..c.clone()
                })
                .collect(),
            connectors: self.connectors(&input.connectors, &mut rng),
            solver_options: input.solver_options.clone(),
            masses: self.masses_3d(&input.masses),
        }
    }

    /// Results of the original model, re-expressed with the new ids (what a
    /// correct solver returns for the relabelled model), sorted by new id.
    pub fn map_results_2d(&self, r: &AnalysisResults) -> AnalysisResults {
        let mut o = r.clone();
        for d in o.displacements.iter_mut() {
            d.node_id = self.n(d.node_id);
        }
        for x in o.reactions.iter_mut() {
            x.node_id = self.n(x.node_id);
        }
        for e in o.element_forces.iter_mut() {
            e.element_id = self.e(e.element_id);
        }
        o
    }

    pub fn map_results_3d(&self, r: &AnalysisResults3D) -> AnalysisResults3D {
        let mut o = r.clone();
        for d in o.displacements.iter_mut() {
            d.node_id = self.n(d.node_id);
        }
        for x in o.reactions.iter_mut() {
            x.node_id = self.n(x.node_id);
        }
        for e in o.element_forces.iter_mut() {
            e.element_id = self.e(e.element_id);
        }
        // Shell stresses are keyed by shell id, but the four shell families
        // share the field; map through whichever table holds the id.
        for p in o.plate_stresses.iter_mut() {
            p.element_id = get(&self.plate, p.element_id);
        }
        for q in o.quad_stresses.iter_mut() {
            let id = q.element_id;
            q.element_id = [&self.quad, &self.quad9, &self.solid_shell, &self.curved_shell]
                .iter()
                .find_map(|t| t.get(&id))
                .copied()
                .unwrap_or(id);
        }
        o
    }
}
