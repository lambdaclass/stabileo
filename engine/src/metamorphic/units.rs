//! Consistent unit scaling: a physically similar model with every length
//! multiplied by λ, every force by φ and every time by τ.
//!
//! The engine's units are fixed (m, kN, s, E in MPa, density in kg/m³), so
//! "changing units" means building the similar model in those same units:
//! stress-like inputs (E, f_y, pressure) scale by φ/λ², areas by λ², second
//! moments by λ⁴, the warping constant by λ⁶, line loads by φ/λ, moments by
//! φ·λ, translational springs by φ/λ, rotational springs by φ·λ, mass density
//! by φ·τ²/λ⁴ (mass = force·time²/length), accelerations by λ/τ², time steps
//! by τ. Dimensionless inputs (ν, angles, temperatures, strains, the thermal
//! expansion coefficient) do not change.
//!
//! Results then obey the dimensional law: translations × λ, rotations × 1,
//! forces × φ, moments × φ·λ, stresses × φ/λ², frequencies × 1/τ, load
//! factors × 1, energies × φ·λ.
//!
//! Gravity is a constant inside the engine (self-weight from densities,
//! spectra in g), so the default similitude keeps g fixed: τ = √λ (Froude
//! scaling, λ/τ² = 1). Any λ and φ are allowed.

use crate::types::*;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Units {
    pub length: f64,
    pub force: f64,
    pub time: f64,
}

impl Units {
    /// Froude similitude: τ = √λ so accelerations (gravity) are unchanged.
    pub fn froude(length: f64, force: f64) -> Self {
        Units { length, force, time: length.sqrt() }
    }
    pub fn stress(&self) -> f64 {
        self.force / (self.length * self.length)
    }
    pub fn line_load(&self) -> f64 {
        self.force / self.length
    }
    pub fn moment(&self) -> f64 {
        self.force * self.length
    }
    pub fn trans_spring(&self) -> f64 {
        self.force / self.length
    }
    pub fn rot_spring(&self) -> f64 {
        self.force * self.length
    }
    pub fn density(&self) -> f64 {
        self.force * self.time * self.time / self.length.powi(4)
    }
    pub fn accel(&self) -> f64 {
        self.length / (self.time * self.time)
    }
    pub fn frequency(&self) -> f64 {
        1.0 / self.time
    }
}

fn opt(v: Option<f64>, k: f64) -> Option<f64> {
    v.map(|x| x * k)
}

fn scale_constraints(cs: &mut [Constraint], u: &Units, rot_dofs: &[usize]) {
    for c in cs.iter_mut() {
        match c {
            Constraint::EccentricConnection(ec) => {
                ec.offset_x *= u.length;
                ec.offset_y *= u.length;
                ec.offset_z *= u.length;
            }
            // Σ c_i·u_i = 0 mixes translations (× λ) and rotations (× 1):
            // translational coefficients scale by 1/λ to keep the same relation.
            Constraint::LinearMPC(m) => {
                for t in m.terms.iter_mut() {
                    if !rot_dofs.contains(&t.dof) {
                        t.coefficient /= u.length;
                    }
                }
            }
            Constraint::RigidLink(_) | Constraint::Diaphragm(_) | Constraint::EqualDOF(_) => {}
        }
    }
}

fn scale_connector(c: &mut ConnectorElement, u: &Units) {
    c.k_axial *= u.trans_spring();
    c.k_shear *= u.trans_spring();
    c.k_shear_z *= u.trans_spring();
    c.k_moment *= u.rot_spring();
    c.k_bend_y *= u.rot_spring();
    c.k_bend_z *= u.rot_spring();
}

pub fn scale_load_2d(l: &mut SolverLoad, u: &Units) {
    match l {
        SolverLoad::Nodal(n) => {
            n.fx *= u.force;
            n.fz *= u.force;
            n.my *= u.moment();
        }
        SolverLoad::Distributed(d) => {
            d.q_i *= u.line_load();
            d.q_j *= u.line_load();
            d.a = opt(d.a, u.length);
            d.b = opt(d.b, u.length);
        }
        SolverLoad::PointOnElement(p) => {
            p.a *= u.length;
            p.p *= u.force;
            p.px = opt(p.px, u.force);
            p.my = opt(p.my, u.moment());
        }
        SolverLoad::AxialDistributed(d) => {
            d.q_i *= u.line_load();
            d.q_j *= u.line_load();
            d.a = opt(d.a, u.length);
            d.b = opt(d.b, u.length);
        }
        // α is per °C and temperature is not rescaled; a stated depth is a length.
        SolverLoad::Thermal(t) => t.depth = opt(t.depth, u.length),
    }
}

pub fn scale_2d(input: &SolverInput, u: &Units) -> SolverInput {
    let mut m = input.clone();
    for n in m.nodes.values_mut() {
        n.x *= u.length;
        n.z *= u.length;
    }
    for x in m.materials.values_mut() {
        x.e *= u.stress();
    }
    for s in m.sections.values_mut() {
        s.a *= u.length.powi(2);
        s.iz *= u.length.powi(4);
        s.as_y = opt(s.as_y, u.length.powi(2));
    }
    for s in m.supports.values_mut() {
        s.kx = opt(s.kx, u.trans_spring());
        s.ky = opt(s.ky, u.trans_spring());
        s.kz = opt(s.kz, u.rot_spring());
        s.dx = opt(s.dx, u.length);
        s.dz = opt(s.dz, u.length);
    }
    for l in m.loads.iter_mut() {
        scale_load_2d(l, u);
    }
    scale_constraints(&mut m.constraints, u, &[2]);
    for c in m.connectors.values_mut() {
        scale_connector(c, u);
    }
    m
}

pub fn scale_nodal_3d(n: &mut SolverNodalLoad3D, u: &Units) {
    n.fx *= u.force;
    n.fy *= u.force;
    n.fz *= u.force;
    n.mx *= u.moment();
    n.my *= u.moment();
    n.mz *= u.moment();
    n.bw = opt(n.bw, u.moment() * u.length);
}

pub fn scale_load_3d(l: &mut SolverLoad3D, u: &Units) {
    use SolverLoad3D as L;
    match l {
        L::Nodal(n) => scale_nodal_3d(n, u),
        L::Distributed(d) => {
            for q in [&mut d.q_xi, &mut d.q_xj, &mut d.q_yi, &mut d.q_yj, &mut d.q_zi, &mut d.q_zj] {
                *q *= u.line_load();
            }
            d.a = opt(d.a, u.length);
            d.b = opt(d.b, u.length);
        }
        L::PointOnElement(p) => {
            p.a *= u.length;
            p.py *= u.force;
            p.pz *= u.force;
        }
        L::Thermal(t) => {
            t.depth_y = opt(t.depth_y, u.length);
            t.depth_z = opt(t.depth_z, u.length);
        }
        L::PlateThermal(_) | L::QuadThermal(_) | L::Quad9Thermal(_) | L::CurvedShellThermal(_) => {}
        L::Bimoment(b) => b.bimoment *= u.moment() * u.length,
        L::Pressure(p) | L::QuadPressure(p) | L::Quad9Pressure(p) | L::SolidShellPressure(p) | L::CurvedShellPressure(p) => {
            p.pressure *= u.stress()
        }
        L::QuadEdge(e) | L::Quad9Edge(e) | L::CurvedShellEdge(e) => {
            e.qn *= u.line_load();
            e.qt *= u.line_load();
        }
        L::QuadSelfWeight(w) | L::Quad9SelfWeight(w) | L::CurvedShellSelfWeight(w) => {
            w.density *= u.density();
            w.gx *= u.accel();
            w.gy *= u.accel();
            w.gz *= u.accel();
        }
        L::SolidShellSelfWeight(w) => {
            w.density *= u.density();
            w.gx *= u.accel();
            w.gy *= u.accel();
            w.gz *= u.accel();
        }
    }
}

pub fn scale_3d(input: &SolverInput3D, u: &Units) -> SolverInput3D {
    let mut m = input.clone();
    let l = u.length;
    for n in m.nodes.values_mut() {
        n.x *= l;
        n.y *= l;
        n.z *= l;
    }
    for x in m.materials.values_mut() {
        x.e *= u.stress();
    }
    for s in m.sections.values_mut() {
        s.a *= l.powi(2);
        s.iy *= l.powi(4);
        s.iz *= l.powi(4);
        s.j *= l.powi(4);
        s.cw = opt(s.cw, l.powi(6));
        s.as_y = opt(s.as_y, l.powi(2));
        s.as_z = opt(s.as_z, l.powi(2));
    }
    for s in m.supports.values_mut() {
        s.kx = opt(s.kx, u.trans_spring());
        s.ky = opt(s.ky, u.trans_spring());
        s.kz = opt(s.kz, u.trans_spring());
        s.krx = opt(s.krx, u.rot_spring());
        s.kry = opt(s.kry, u.rot_spring());
        s.krz = opt(s.krz, u.rot_spring());
        // Warping spring: bimoment (F·L²) per unit warping (1/L).
        s.kw = opt(s.kw, u.force * l.powi(3));
        s.dx = opt(s.dx, l);
        s.dy = opt(s.dy, l);
        s.dz = opt(s.dz, l);
    }
    for x in m.loads.iter_mut() {
        scale_load_3d(x, u);
    }
    for p in m.plates.values_mut() {
        p.thickness *= l;
    }
    for p in m.quads.values_mut() {
        p.thickness *= l;
    }
    for p in m.quad9s.values_mut() {
        p.thickness *= l;
    }
    for p in m.curved_shells.values_mut() {
        p.thickness *= l;
    }
    scale_constraints(&mut m.constraints, u, &[3, 4, 5]);
    for c in m.connectors.values_mut() {
        scale_connector(c, u);
    }
    m
}

/// Scale a mass-density map (kg/m³ keyed by material id).
pub fn scale_densities(d: &std::collections::HashMap<String, f64>, u: &Units) -> std::collections::HashMap<String, f64> {
    d.iter().map(|(k, v)| (k.clone(), v * u.density())).collect()
}

/// Results of the original model scaled by the dimensional law.
pub fn scale_results_2d(r: &AnalysisResults, u: &Units) -> AnalysisResults {
    let mut o = r.clone();
    for d in o.displacements.iter_mut() {
        d.ux *= u.length;
        d.uz *= u.length;
    }
    for x in o.reactions.iter_mut() {
        x.rx *= u.force;
        x.rz *= u.force;
        x.my *= u.moment();
    }
    for e in o.element_forces.iter_mut() {
        for f in [&mut e.n_start, &mut e.n_end, &mut e.v_start, &mut e.v_end] {
            *f *= u.force;
        }
        e.m_start *= u.moment();
        e.m_end *= u.moment();
        e.length *= u.length;
    }
    o
}

pub fn scale_results_3d(r: &AnalysisResults3D, u: &Units) -> AnalysisResults3D {
    let mut o = r.clone();
    for d in o.displacements.iter_mut() {
        d.ux *= u.length;
        d.uy *= u.length;
        d.uz *= u.length;
        d.warping = d.warping.map(|w| w / u.length);
    }
    for x in o.reactions.iter_mut() {
        x.fx *= u.force;
        x.fy *= u.force;
        x.fz *= u.force;
        x.mx *= u.moment();
        x.my *= u.moment();
        x.mz *= u.moment();
        x.bimoment = x.bimoment.map(|b| b * u.moment() * u.length);
    }
    for e in o.element_forces.iter_mut() {
        for f in [&mut e.n_start, &mut e.n_end, &mut e.vy_start, &mut e.vy_end, &mut e.vz_start, &mut e.vz_end] {
            *f *= u.force;
        }
        for m in [&mut e.mx_start, &mut e.mx_end, &mut e.my_start, &mut e.my_end, &mut e.mz_start, &mut e.mz_end] {
            *m *= u.moment();
        }
        e.length *= u.length;
    }
    for p in o.plate_stresses.iter_mut() {
        for s in [&mut p.sigma_xx, &mut p.sigma_yy, &mut p.tau_xy, &mut p.sigma_1, &mut p.sigma_2, &mut p.von_mises] {
            *s *= u.stress();
        }
        for m in [&mut p.mx, &mut p.my, &mut p.mxy] {
            *m *= u.force;
        }
        for v in p.nodal_von_mises.iter_mut() {
            *v *= u.stress();
        }
    }
    for q in o.quad_stresses.iter_mut() {
        for s in [&mut q.sigma_xx, &mut q.sigma_yy, &mut q.tau_xy, &mut q.von_mises] {
            *s *= u.stress();
        }
        for m in [&mut q.mx, &mut q.my, &mut q.mxy] {
            *m *= u.force;
        }
        for v in q.nodal_von_mises.iter_mut() {
            *v *= u.stress();
        }
    }
    o
}
