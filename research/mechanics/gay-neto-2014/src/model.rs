use crate::band::Band;
use crate::beam::{self, Beam, Section, GAUSS};
use crate::contact::{History, NodeToSurface, Triangle};
use crate::input::{BoolTable, Input, StepInput, TimeTable};
use crate::rot::{cross, dot, exp, scale, Quat, V3};
use std::f64::consts::PI;

pub struct Weight {
    pub mass_per_length: f64,
    pub displaced_area: f64,
}

pub struct Model {
    pub reference: Vec<V3<f64>>,
    pub beams: Vec<Beam>,
    pub weights: Vec<Weight>,
    pub gravity: Option<(V3<f64>, BoolTable)>,
    pub ocean: Option<(f64, V3<f64>)>,
    pub contacts: Vec<(NodeToSurface, BoolTable)>,
    pub constraints: Vec<(usize, usize, BoolTable)>,
    pub displacements: Vec<(Vec<usize>, [V3<f64>; 3], TimeTable)>,
    pub loads: Vec<(Vec<usize>, [V3<f64>; 3], TimeTable)>,
    pub steps: Vec<StepInput>,
}

#[derive(Clone)]
pub struct State {
    pub x: Vec<V3<f64>>,
    pub q: Vec<Quat<f64>>,
    pub history: Vec<Vec<History>>,
    pub t: f64,
}

fn axes(cs: ([f64; 3], [f64; 3])) -> [V3<f64>; 3] {
    let unit = |v: V3<f64>| scale(v, 1.0 / dot(v, v).sqrt());
    let (e1, e3) = (unit(cs.0), unit(cs.1));
    [e1, cross(e3, e1), e3]
}

fn saint_venant_torsion(b: f64, h: f64) -> f64 {
    let sum: f64 = (1..22)
        .step_by(2)
        .map(|n| (n as f64).powi(-5) * (n as f64 * PI * h / (2.0 * b)).tanh())
        .sum();
    b.powi(3) * h / 3.0 * (1.0 - 192.0 * b * sum / (PI.powi(5) * h))
}

impl Model {
    pub fn from_input(inp: &Input) -> Result<Model, String> {
        let count = *inp.nodes.keys().max().ok_or("no nodes")?;
        let mut reference = vec![[0.0; 3]; count];
        for (&id, &p) in &inp.nodes {
            reference[id - 1] = p;
        }
        let cs = |id: usize| inp.cs.get(&id).copied().map(axes).ok_or(format!("missing CS {id}"));
        let set = |id: usize| -> Result<Vec<usize>, String> {
            Ok(inp.node_sets.get(&id).ok_or(format!("missing node set {id}"))?.iter().map(|n| n - 1).collect())
        };
        let mut beams = vec![];
        let mut weights = vec![];
        for e in &inp.elements {
            let nodes = [e.nodes[0] - 1, e.nodes[1] - 1, e.nodes[2] - 1];
            let chord = crate::rot::sub(reference[nodes[2]], reference[nodes[0]]);
            let (stiffness, weight) = if e.kind == "Pipe_1" {
                let p = inp.pipe_sections.get(&e.section).ok_or("missing pipe section")?;
                (
                    [p.ga, p.ga, p.ea, p.ei, p.ei, p.gj],
                    Weight { mass_per_length: p.rho, displaced_area: PI * p.de * p.de / 4.0 },
                )
            } else {
                let &(young, nu, rho) = inp.hooke.get(&e.material).ok_or("missing material")?;
                let &(b, h) = inp.rectangles.get(&e.section).ok_or("missing section")?;
                let g = young / (2.0 * (1.0 + nu));
                let a = b * h;
                (
                    [g * a, g * a, young * a, young * b * h.powi(3) / 12.0, young * h * b.powi(3) / 12.0, g * saint_venant_torsion(b, h)],
                    Weight { mass_per_length: rho * a, displaced_area: a },
                )
            };
            beams.push(Beam { nodes, length: dot(chord, chord).sqrt(), frame: cs(e.cs)?, section: Section { stiffness } });
            weights.push(weight);
        }
        let mut contacts = vec![];
        for c in &inp.contacts {
            let surfaces = inp.surface_sets[&c.surface_set]
                .iter()
                .map(|s| Triangle { points: inp.triangles[s].map(|p| inp.points[&p]) })
                .collect();
            let nts = NodeToSurface { nodes: set(c.node_set)?, surfaces, mu: c.mu, epn: c.epn, ept: c.ept, radius: c.radius };
            contacts.push((nts, c.table.clone()));
        }
        let mut constraints = vec![];
        for (s, dofs) in &inp.constraints {
            for n in set(*s)? {
                for (k, table) in dofs.iter().enumerate() {
                    if let Some(table) = table {
                        constraints.push((n, k, table.clone()));
                    }
                }
            }
        }
        let tables = |list: &[TimeTable]| -> Result<Vec<_>, String> {
            list.iter().map(|t| Ok((set(t.node_set)?, cs(t.cs)?, t.clone()))).collect()
        };
        Ok(Model {
            reference,
            beams,
            weights,
            gravity: inp.gravity.clone(),
            ocean: inp.ocean,
            contacts,
            constraints,
            displacements: tables(&inp.displacements)?,
            loads: tables(&inp.loads)?,
            steps: inp.steps.clone(),
        })
    }

    pub fn initial_state(&self) -> State {
        State {
            x: self.reference.clone(),
            q: vec![Quat::identity(); self.reference.len()],
            history: self
                .contacts
                .iter()
                .map(|(c, _)| c.nodes.iter().map(|&n| History { position: self.reference[n], ..Default::default() }).collect())
                .collect(),
            t: 0.0,
        }
    }

    fn step_window(&self, step: usize) -> (f64, f64) {
        let t0 = if step == 0 { 0.0 } else { self.steps[step - 1].end_time };
        (t0, self.steps[step].end_time)
    }

    fn global(axes: &[V3<f64>; 3], local: [f64; 6]) -> [f64; 6] {
        let mut g = [0.0; 6];
        for k in 0..3 {
            for i in 0..3 {
                g[i] += axes[k][i] * local[k];
                g[3 + i] += axes[k][i] * local[3 + k];
            }
        }
        g
    }

    fn external(&self, state: &State, step: usize, t: f64) -> Vec<f64> {
        let mut f = vec![0.0; 6 * self.reference.len()];
        for (nodes, ax, table) in &self.loads {
            let v = Self::global(ax, table.at(t));
            for &n in nodes {
                for k in 0..6 {
                    f[6 * n + k] += v[k];
                }
            }
        }
        if let Some((g, table)) = &self.gravity {
            let (t0, t1) = self.step_window(step);
            let factor = table.factor(step, t, t0, t1);
            let gnorm = dot(*g, *g).sqrt();
            for (b, w) in self.beams.iter().zip(&self.weights) {
                let jac = 0.5 * b.length;
                for &xi in &GAUSS {
                    let (n, _) = beam::shape(xi);
                    let mut mass = w.mass_per_length;
                    if let Some((rho, surface)) = self.ocean {
                        let mut p = [0.0; 3];
                        for i in 0..3 {
                            p = crate::rot::add(p, scale(state.x[b.nodes[i]], n[i]));
                        }
                        if dot(crate::rot::sub(p, surface), *g) / gnorm > 0.0 {
                            mass -= rho * w.displaced_area;
                        }
                    }
                    for i in 0..3 {
                        for k in 0..3 {
                            f[6 * b.nodes[i] + k] += factor * jac * n[i] * mass * g[k];
                        }
                    }
                }
            }
        }
        f
    }

    fn prescribed(&self, step: usize, t_old: f64, t_new: f64) -> Vec<(usize, f64)> {
        let mut fixed: Vec<(usize, f64)> = self
            .constraints
            .iter()
            .filter(|(_, _, table)| table.on(step))
            .map(|(n, k, _)| (6 * n + k, 0.0))
            .collect();
        for (nodes, ax, table) in &self.displacements {
            let (a, b) = (Self::global(ax, table.at(t_old)), Self::global(ax, table.at(t_new)));
            for &n in nodes {
                for k in 0..6 {
                    if let Some(entry) = fixed.iter_mut().find(|(d, _)| *d == 6 * n + k) {
                        entry.1 = b[k] - a[k];
                    }
                }
            }
        }
        fixed
    }

    /// Residual (internal minus external forces) and tangent, plus the contact history
    /// this configuration would leave.
    fn assemble(&self, state: &State, committed: &State, f_ext: &[f64], step: usize) -> (Band, Vec<f64>, Vec<Vec<History>>) {
        let n = 6 * self.reference.len();
        let mut k = Band::new(n, 17, 17);
        let mut r: Vec<f64> = f_ext.iter().map(|v| -v).collect();
        for b in &self.beams {
            let x = b.nodes.map(|i| state.x[i]);
            let q = b.nodes.map(|i| state.q[i]);
            let (g, h) = beam::tangent(b, x, q);
            let dof = |a: usize| 6 * b.nodes[a / 6] + a % 6;
            for a in 0..18 {
                r[dof(a)] += g[a];
                for c in 0..18 {
                    k.add(dof(a), dof(c), h[a][c]);
                }
            }
        }
        let mut next = committed.history.clone();
        for (ci, (c, table)) in self.contacts.iter().enumerate() {
            if !table.on(step) {
                continue;
            }
            for (j, &node) in c.nodes.iter().enumerate() {
                let ev = c.evaluate(state.x[node], &committed.history[ci][j]);
                next[ci][j] = ev.next;
                for a in 0..3 {
                    r[6 * node + a] -= ev.force[a];
                    for b in 0..3 {
                        k.add(6 * node + a, 6 * node + b, -ev.jacobian[a][b]);
                    }
                }
            }
        }
        (k, r, next)
    }

    fn newton(&self, committed: &State, step: usize, t_new: f64) -> Result<(State, usize), String> {
        let mut state = committed.clone();
        state.t = t_new;
        let fixed = self.prescribed(step, committed.t, t_new);
        let is_fixed = {
            let mut v = vec![false; 6 * self.reference.len()];
            for (d, _) in &fixed {
                v[*d] = true;
            }
            v
        };
        let max_it = self.steps[step].max_it.max(30);
        let mut last_move = f64::INFINITY;
        for it in 0..=max_it {
            let f_ext = self.external(&state, step, t_new);
            let (mut k, r, next) = self.assemble(&state, committed, &f_ext, step);
            let scale_f = f_ext.iter().chain(r.iter()).fold(1.0_f64, |m, v| m.max(v.abs()));
            let r_free = r.iter().zip(&is_fixed).filter(|(_, f)| !**f).fold(0.0_f64, |m, (v, _)| m.max(v.abs()));
            if !r_free.is_finite() {
                return Err("residual is not finite".into());
            }
            if it > 0 && r_free <= 1e-7 * scale_f && last_move <= 1e-10 {
                state.history = next;
                return Ok((state, it));
            }
            if it == max_it {
                break;
            }
            let mut rhs: Vec<f64> = r.iter().map(|v| -v).collect();
            for &(d, inc) in &fixed {
                k.fix(d, if it == 0 { inc } else { 0.0 }, &mut rhs);
            }
            k.solve(&mut rhs)?;
            let length = self.reference.iter().fold(1.0_f64, |m, p| m.max(dot(*p, *p).sqrt()));
            last_move = 0.0;
            for (i, (x, q)) in state.x.iter_mut().zip(state.q.iter_mut()).enumerate() {
                let d = &rhs[6 * i..6 * i + 6];
                for a in 0..3 {
                    x[a] += d[a];
                    last_move = last_move.max(d[a].abs() / length).max(d[3 + a].abs());
                }
                *q = exp([d[3], d[4], d[5]]).mul(*q).normalized();
            }
        }
        Err(format!("no convergence at t = {t_new}"))
    }

    /// Runs every solution step, calling `observe` after each converged increment.
    pub fn run(&self, steps: usize, mut observe: impl FnMut(&State, usize)) -> Result<State, String> {
        let mut state = self.initial_state();
        for step in 0..steps.min(self.steps.len()) {
            let s = &self.steps[step];
            let mut dt = s.time_step;
            while state.t < s.end_time - 1e-12 {
                let t_new = (state.t + dt).min(s.end_time);
                match self.newton(&state, step, t_new) {
                    Ok((next, iterations)) => {
                        state = next;
                        observe(&state, step);
                        if iterations <= s.conv_increase.max(4) {
                            dt = (dt * s.inc_factor).min(s.max_time_step);
                        }
                    }
                    Err(e) => {
                        dt = 0.5 * (t_new - state.t);
                        if dt < s.min_time_step {
                            return Err(format!("step {}: {e}", step + 1));
                        }
                    }
                }
            }
        }
        Ok(state)
    }

    /// Section forces and moments of each element in its own frame, with the reference
    /// coordinate of its middle node.
    pub fn resultants(&self, state: &State) -> Vec<(V3<f64>, [f64; 6])> {
        self.beams
            .iter()
            .map(|b| (self.reference[b.nodes[1]], beam::resultants(b, b.nodes.map(|i| state.x[i]), b.nodes.map(|i| state.q[i]))))
            .collect()
    }

    pub fn contact_gaps(&self, state: &State) -> Vec<(usize, f64)> {
        let mut out = vec![];
        for (c, _) in &self.contacts {
            for (j, &node) in c.nodes.iter().enumerate() {
                out.push((node, c.evaluate(state.x[node], &state.history[0][j]).gap));
            }
        }
        out
    }
}
