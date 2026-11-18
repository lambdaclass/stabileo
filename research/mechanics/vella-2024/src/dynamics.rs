use crate::band::Band;
use crate::model::{mass_band, Assembler, Clamps, Strip, DOFS};
use crate::spectrum::antisymmetric_mode;
use crate::statics::Equilibrium;
use serde::{Deserialize, Serialize};

/// The paper's time scale: the period of the natural arch's lowest (antisymmetric) vibration at
/// µ = 1/4, T_osc = 2π/ω = 0.108 in units of t* = L²√(ρbh/B) (SM §II.D, after Eq. S24).
pub const T_OSC: f64 = 0.108;

/// µ at which the moving clamp starts to brake if the jump has not ended by then, standing in
/// for the experiments' stopper (SM §I.A), whose position is not given. Beyond µ = 0 the strip
/// would be stretched.
pub const STOPPER: f64 = 0.02;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub alpha: f64,
    pub n: usize,
    pub slenderness: f64,
    /// |dµ/dt| with t in units of T_osc.
    pub rate: f64,
    /// µ at the start, on the inverted branch.
    pub start: f64,
    /// Only the left clamp moves (the experiments' protocol); otherwise both move apart.
    pub one_end: bool,
    /// Time over which the clamp accelerates uniformly to its final speed, in T_osc.
    pub ramp: f64,
    /// Midpoint tangent angle (rad) of the lowest antisymmetric vibration mode added to the
    /// start state.
    pub imperfection: f64,
    /// Time step in T_osc.
    pub dt: f64,
    /// HHT-α parameter, in [−1/3, 0]; 0 is the trapezoidal rule.
    pub hht: f64,
    /// Time kept after the snap, in T_osc.
    pub after: f64,
}

impl Settings {
    pub fn strip(&self) -> Strip {
        Strip { n: self.n, alpha: self.alpha, slenderness: self.slenderness }
    }

    pub fn validate(&self) -> Result<(), String> {
        let finite = [self.alpha, self.slenderness, self.rate, self.start, self.ramp, self.imperfection, self.dt, self.hht, self.after]
            .iter()
            .all(|v| v.is_finite());
        if !finite
            || !(0.005..=0.6).contains(&self.alpha)
            || !(4..=400).contains(&self.n)
            || !self.n.is_multiple_of(2)
            || self.slenderness < 10.0
            || !(1e-4..=5.0).contains(&self.rate)
            || !(0.27..=5.0).contains(&self.start)
            || !(0.0..=50.0).contains(&self.ramp)
            || self.imperfection.abs() > 0.1
            || !(1e-4..=0.1).contains(&self.dt)
            || !(-1.0 / 3.0..=0.0).contains(&self.hht)
            || !(0.0..=20.0).contains(&self.after)
        {
            return Err("settings outside the supported range".into());
        }
        Ok(())
    }
}

/// End motion: shortening removed so far, its rate and its acceleration at time t (in t*). The
/// clamp accelerates uniformly over `ramp`, moves at `speed`, and from `stop` decelerates
/// uniformly over `ramp` to rest.
fn travel(speed: f64, ramp: f64, stop: f64, t: f64) -> (f64, f64, f64) {
    let a = if ramp > 0.0 { speed / ramp } else { 0.0 };
    let cruise = |t: f64| if ramp > 0.0 && t < ramp { (0.5 * a * t * t, a * t, a) } else { (speed * (t - 0.5 * ramp), speed, 0.0) };
    if t <= stop {
        return cruise(t);
    }
    let (d0, v0, _) = cruise(stop);
    let tau = t - stop;
    if ramp > 0.0 && v0 > 0.0 {
        let decel = a;
        let end = v0 / decel;
        if tau < end {
            return (d0 + v0 * tau - 0.5 * decel * tau * tau, v0 - decel * tau, -decel);
        }
        return (d0 + 0.5 * v0 * end, 0.0, 0.0);
    }
    (d0, 0.0, 0.0)
}

#[derive(Clone, Debug, Serialize)]
pub struct Frame {
    /// Time from µ = µ*, in T_osc.
    pub t: f64,
    pub mu: f64,
    pub theta: f64,
    pub height: f64,
    /// Node positions (x/L, z/L), drawn with the two clamps centred on x = ½.
    pub x: Vec<f64>,
    pub z: Vec<f64>,
}

/// One sample per bin of the whole run: its time, µ, and the extreme midpoint angles and the
/// midpoint height reached within it.
#[derive(Clone, Debug, Default, Serialize)]
pub struct Trace {
    pub t: Vec<f64>,
    pub mu: Vec<f64>,
    pub theta_min: Vec<f64>,
    pub theta_max: Vec<f64>,
    pub height: Vec<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub snapped: bool,
    /// Time of the first upward crossing of the midpoint through z = 0, from µ = µ*, in T_osc.
    pub t_snap: f64,
    pub mu_snap: f64,
    /// End of the jump: the first maximum of the midpoint height after the crossing.
    pub t_end: f64,
    /// max |θ| before t = 0 and during the jump (0 < t ≤ t_end).
    pub theta_before: f64,
    pub theta_during: f64,
    /// Eq. (2): theta_during / theta_before.
    pub amplification: f64,
    /// The same with t = 0 at µ = µ_A instead of µ*.
    pub amplification_from_mu_a: f64,
    pub steps: usize,
    pub newton_iterations: usize,
}

pub struct Simulation {
    pub settings: Settings,
    pub frames: Vec<Frame>,
    pub trace: Trace,
    pub outcome: Outcome,
}

struct Sample {
    t: f64,
    mu: f64,
    theta: f64,
    height: f64,
}

fn frame(strip: &Strip, q: &[f64], t: f64, mu: f64) -> Frame {
    let n = strip.n;
    let shift = 0.5 * (q[0] + q[DOFS * n]);
    Frame {
        t,
        mu,
        theta: q[DOFS * strip.mid() + 2],
        height: q[DOFS * strip.mid() + 1],
        x: (0..=n).map(|i| i as f64 / n as f64 + q[DOFS * i] - shift).collect(),
        z: (0..=n).map(|i| q[DOFS * i + 1]).collect(),
    }
}

struct Motion {
    speed: f64,
    ramp: f64,
    stop: f64,
    one_end: bool,
    left: f64,
    right: f64,
}

impl Motion {
    fn travel(&self, t: f64) -> (f64, f64, f64) {
        travel(self.speed, self.ramp, self.stop, t)
    }

    /// Sets the clamp positions at time t and returns their accelerations (left, right).
    fn set(&self, q: &mut [f64], n: usize, t: f64) -> [f64; 2] {
        let (d, _, a) = self.travel(t);
        if self.one_end {
            q[0] = self.left - d;
            q[DOFS * n] = -self.right;
            [-a, 0.0]
        } else {
            q[0] = self.left - 0.5 * d;
            q[DOFS * n] = -(self.right - 0.5 * d);
            [-0.5 * a, 0.5 * a]
        }
    }

    fn velocities(&self, t: f64) -> [f64; 2] {
        let (_, v, _) = self.travel(t);
        if self.one_end { [-v, 0.0] } else { [-0.5 * v, 0.5 * v] }
    }
}

/// HHT-α on the free DOFs (nodes 1…n−1): M a₁ + (1+α) f(u₁) − α f(u₀) = 0 with Newmark's
/// β = (1−α)²/4, γ = ½ − α; Newton iterations on M/(βh²) + (1+α)K_T, banded. The rotations
/// carry no mass, so they get no Newmark velocity or acceleration: integrating them anyway
/// lets those grow without bound and sends the predictor to a rotation 2πk away.
struct Integrator {
    n: usize,
    alpha: f64,
    beta: f64,
    gamma: f64,
    floor: f64,
    increment: f64,
    assembler: Assembler,
    mass: Vec<Vec<(usize, f64)>>,
    motion: Motion,
    q: Vec<f64>,
    v: Vec<f64>,
    acc: Vec<f64>,
    f_old: Vec<f64>,
    force: Vec<f64>,
    band: Band,
    residual: Vec<f64>,
    iterations: usize,
}

impl Integrator {
    fn free(&self, i: usize) -> bool {
        (DOFS..DOFS * self.n).contains(&i)
    }

    /// One step of length h from t; on failure the state is left unchanged.
    fn step(&mut self, t: f64, h: f64) -> Result<bool, String> {
        let (n, beta) = (self.n, self.beta);
        let size = self.q.len();
        let mut q1 = self.q.clone();
        let ends = self.motion.set(&mut q1, n, t + h);
        let predicted: Vec<f64> = (0..size).map(|i| self.q[i] + h * self.v[i] + h * h * (0.5 - beta) * self.acc[i]).collect();
        for i in DOFS..DOFS * n {
            q1[i] = if i % DOFS == 2 { self.q[i] } else { predicted[i] + beta * h * h * self.acc[i] };
        }
        let mut a1 = self.acc.clone();
        a1[0] = ends[0];
        a1[DOFS * n] = ends[1];
        let c = 1.0 + self.alpha;
        let mut converged = false;
        for _ in 0..25 {
            self.iterations += 1;
            for i in (DOFS..DOFS * n).filter(|i| i % DOFS != 2) {
                a1[i] = (q1[i] - predicted[i]) / (beta * h * h);
            }
            self.band.clear();
            let band = &mut self.band;
            self.assembler.assemble(&q1, &mut self.force, |i, j, k| {
                if (DOFS..DOFS * n).contains(&i) && (DOFS..DOFS * n).contains(&j) {
                    band.add(i - DOFS, j - DOFS, c * k);
                }
            });
            let mut norm = 0.0f64;
            let mut scale = 0.0f64;
            for i in DOFS..DOFS * n {
                let r = i - DOFS;
                let mut inertia = 0.0;
                for &(j, w) in &self.mass[i] {
                    inertia += w * a1[j];
                    if self.free(j) {
                        self.band.add(r, j - DOFS, w / (beta * h * h));
                    }
                }
                self.residual[r] = -(inertia + c * self.force[i] - self.alpha * self.f_old[i]);
                norm = norm.max(self.residual[r].abs());
                scale = scale.max(inertia.abs());
            }
            if !norm.is_finite() {
                break;
            }
            if norm <= self.floor + 1e-12 * scale {
                converged = true;
                break;
            }
            if self.band.solve(&mut self.residual).is_err() {
                break;
            }
            let mut du = 0.0f64;
            for i in DOFS..DOFS * n {
                q1[i] += self.residual[i - DOFS];
                du = du.max(self.residual[i - DOFS].abs());
            }
            if du <= self.increment {
                converged = true;
                break;
            }
        }
        if !converged {
            return Ok(false);
        }
        self.assembler.assemble(&q1, &mut self.force, |_, _, _| {});
        let gamma = self.gamma;
        for i in (DOFS..DOFS * n).filter(|i| i % DOFS != 2) {
            a1[i] = (q1[i] - predicted[i]) / (beta * h * h);
            self.v[i] += h * ((1.0 - gamma) * self.acc[i] + gamma * a1[i]);
        }
        let [vl, vr] = self.motion.velocities(t + h);
        self.v[0] = vl;
        self.v[DOFS * n] = vr;
        self.acc = a1;
        self.q = q1;
        self.f_old.copy_from_slice(&self.force);
        Ok(true)
    }

    /// Advances by h, halving the step where Newton fails (up to 2⁸ substeps).
    fn advance(&mut self, t: f64, h: f64, depth: u32) -> Result<(), String> {
        if self.step(t, h)? {
            return Ok(());
        }
        if depth >= 8 {
            return Err("Newton did not converge".into());
        }
        self.advance(t, 0.5 * h, depth + 1)?;
        self.advance(t + 0.5 * h, 0.5 * h, depth + 1)
    }
}

/// Integrates M ü + f_int(u) = 0 with the HHT-α method and Newton iterations on the production
/// co-rotational internal force and tangent, from the inverted equilibrium `start`, the clamps
/// moving apart at the rate of `settings`. Time is measured from the instant µ = `mu_star`.
pub fn simulate(settings: &Settings, start: &Equilibrium, mu_star: f64, mu_a: f64, cancel: &mut dyn FnMut(f64) -> bool) -> Result<Simulation, String> {
    settings.validate()?;
    let strip = settings.strip();
    let n = strip.n;
    let size = DOFS * (n + 1);
    let a2 = strip.alpha * strip.alpha;
    let speed = settings.rate * a2 / T_OSC;
    let ramp = settings.ramp * T_OSC;
    let dt = settings.dt * T_OSC;
    let s0 = start.clamps.shortening();
    let mut mass = vec![vec![]; size];
    for (i, j, v) in mass_band(n) {
        mass[i].push((j, v));
    }
    let motion = Motion { speed, ramp, stop: f64::INFINITY, one_end: settings.one_end, left: start.clamps.left, right: start.clamps.right };
    let mu_at = |t: f64, stop: f64| (s0 - travel(speed, ramp, stop, t).0) / a2;
    let when = |target: f64| {
        let (mut lo, mut hi) = (0.0, 1.0);
        while mu_at(hi, f64::INFINITY) > target {
            hi *= 2.0;
        }
        for _ in 0..200 {
            let m = 0.5 * (lo + hi);
            if mu_at(m, f64::INFINITY) > target { lo = m } else { hi = m }
        }
        0.5 * (lo + hi)
    };
    let t_star = when(mu_star);
    let t_a = when(mu_a);
    let clock = |t: f64| (t - t_star) / T_OSC;

    let mut assembler = Assembler::new(&strip);
    let mut q = start.q.clone();
    if settings.imperfection != 0.0 {
        let mode = antisymmetric_mode(&strip, &mut assembler, &start.q);
        for (a, b) in q.iter_mut().zip(&mode) {
            *a += settings.imperfection * b;
        }
    }
    let mut acc = vec![0.0; size];
    let ends0 = motion.set(&mut q, n, 0.0);
    acc[0] = ends0[0];
    acc[DOFS * n] = ends0[1];
    let mut force = vec![0.0; size];
    assembler.assemble(&q, &mut force, |_, _, _| {});
    let nf = DOFS * (n - 1);
    {
        let mut m = Band::new(nf, 2 * DOFS - 1);
        let mut rhs = vec![0.0; nf];
        for i in DOFS..DOFS * n {
            let r = i - DOFS;
            if i % DOFS == 2 {
                m.add(r, r, 1.0);
                continue;
            }
            rhs[r] = -force[i];
            for &(j, w) in &mass[i] {
                if (DOFS..DOFS * n).contains(&j) {
                    m.add(r, j - DOFS, w);
                } else {
                    rhs[r] -= w * acc[j];
                }
            }
        }
        m.solve(&mut rhs)?;
        for i in DOFS..DOFS * n {
            acc[i] = if i % DOFS == 2 { 0.0 } else { rhs[i - DOFS] };
        }
    }
    let alpha = settings.hht;
    let mut integrator = Integrator {
        n,
        alpha,
        beta: 0.25 * (1.0 - alpha) * (1.0 - alpha),
        gamma: 0.5 - alpha,
        floor: 1e-8 * strip.alpha + 1e-14 * strip.axial_stiffness(),
        increment: 1e-11 * strip.alpha,
        assembler,
        mass,
        motion,
        q,
        v: vec![0.0; size],
        acc,
        f_old: force.clone(),
        force,
        band: Band::new(nf, 2 * DOFS - 1),
        residual: vec![0.0; nf],
        iterations: 0,
    };

    let mid = strip.mid();
    let mut samples: Vec<Sample> = vec![];
    let fine = (0.125 / settings.dt).round().max(1.0) as usize;
    let coarse = (((settings.start - mu_star) / settings.rate) / 60.0).max(0.125);
    let mut frames: Vec<Frame> = vec![frame(&strip, &integrator.q, clock(0.0), mu_at(0.0, f64::INFINITY))];
    let mut recent: std::collections::VecDeque<Frame> = Default::default();
    let keep = 48;
    let mut snapped = false;
    let mut end_time = f64::INFINITY;
    let mut t = 0.0;
    let mut step = 0usize;
    samples.push(Sample { t: clock(0.0), mu: mu_at(0.0, f64::INFINITY), theta: integrator.q[DOFS * mid + 2], height: integrator.q[DOFS * mid + 1] });
    while t < end_time {
        if step > 3_000_000 {
            return Err("too many steps".into());
        }
        if cancel(mu_at(t, integrator.motion.stop)) {
            return Err("stopped".into());
        }
        integrator
            .advance(t, dt, 0)
            .map_err(|e| {
                let q = &integrator.q;
                let th = (0..=n).map(|i| q[DOFS * i + 2].abs()).fold(0.0, f64::max);
                let vm = integrator.v.iter().map(|x| x.abs()).fold(0.0, f64::max);
                let ke: f64 = integrator.mass.iter().enumerate().map(|(i, row)| row.iter().map(|&(j, w)| 0.5 * integrator.v[i] * w * integrator.v[j]).sum::<f64>()).sum();
                format!("{e} at t = {:.4} T_osc (mu {:.4}, max theta {th:.3}, max v {vm:.3e}, kinetic {ke:.3e}, h {:.4})", clock(t + dt), mu_at(t, integrator.motion.stop), q[DOFS * mid + 1])
            })?;
        t += dt;
        step += 1;
        let q = &integrator.q;
        let mu = mu_at(t, integrator.motion.stop);
        let (theta, height) = (q[DOFS * mid + 2], q[DOFS * mid + 1]);
        let rising = samples.last().is_some_and(|last| height >= last.height);
        samples.push(Sample { t: clock(t), mu, theta, height });
        if step.is_multiple_of(fine) {
            recent.push_back(frame(&strip, q, clock(t), mu));
            if !snapped && recent.len() > keep {
                let old = recent.pop_front().unwrap();
                if frames.last().is_none_or(|f| old.t - f.t >= coarse) {
                    frames.push(old);
                }
            }
        }
        if !snapped && height > 0.0 {
            snapped = true;
        }
        let jump_over = snapped && !rising;
        if integrator.motion.stop.is_infinite() && (jump_over || mu <= STOPPER) {
            integrator.motion.stop = t;
            end_time = t + settings.after * T_OSC;
        }
        if !snapped && mu < STOPPER && t > end_time {
            break;
        }
    }
    frames.extend(recent);

    let outcome = outcome(&samples, clock(t_a), step, integrator.iterations);
    let trace = bin(&samples, 1500);
    Ok(Simulation { settings: *settings, frames, trace, outcome })
}

fn bin(samples: &[Sample], count: usize) -> Trace {
    let per = samples.len().div_ceil(count).max(1);
    let mut trace = Trace::default();
    for chunk in samples.chunks(per) {
        let last = chunk.last().unwrap();
        trace.t.push(last.t);
        trace.mu.push(last.mu);
        trace.theta_min.push(chunk.iter().map(|s| s.theta).fold(f64::INFINITY, f64::min));
        trace.theta_max.push(chunk.iter().map(|s| s.theta).fold(f64::NEG_INFINITY, f64::max));
        trace.height.push(last.height);
    }
    trace
}

fn outcome(samples: &[Sample], t_a: f64, steps: usize, newton_iterations: usize) -> Outcome {
    let crossing = samples.iter().position(|s| s.height > 0.0);
    let (snapped, t_snap, mu_snap, end) = match crossing {
        Some(k) => {
            let mut e = k;
            while e + 1 < samples.len() && samples[e + 1].height >= samples[e].height {
                e += 1;
            }
            (true, samples[k].t, samples[k].mu, e)
        }
        None => (false, f64::NAN, f64::NAN, samples.len() - 1),
    };
    let t_end = samples[end].t;
    let max_abs = |from: f64, to: f64| samples.iter().filter(|s| s.t > from && s.t <= to).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let before = samples.iter().filter(|s| s.t < 0.0).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let during = max_abs(0.0, t_end);
    let before_a = samples.iter().filter(|s| s.t < t_a).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let during_a = max_abs(t_a, t_end);
    Outcome {
        snapped,
        t_snap,
        mu_snap,
        t_end,
        theta_before: before,
        theta_during: during,
        amplification: during / before,
        amplification_from_mu_a: during_a / before_a,
        steps,
        newton_iterations,
    }
}

pub fn start_clamps(strip: &Strip, mu0: f64) -> Clamps {
    Clamps::symmetric(mu0 * strip.alpha * strip.alpha)
}
