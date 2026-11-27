use crate::band::Band;
use crate::model::{mass_band, Assembler, Clamps, Strip, DOFS};
use crate::spectrum::antisymmetric_mode;
use crate::statics::Equilibrium;
use serde::{Deserialize, Serialize};

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
    /// Amplitude, as a midpoint tangent angle (rad), of the lowest antisymmetric vibration mode
    /// of the start state given to it at t = 0.
    pub imperfection: f64,
    /// Phase of that vibration at t = 0: θ₀ cos φ in the displacement, −θ₀ ω sin φ in the
    /// velocity.
    #[serde(default)]
    pub phase: f64,
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
        let finite = [self.alpha, self.slenderness, self.rate, self.start, self.ramp, self.imperfection, self.phase, self.dt, self.hht, self.after]
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

/// End motion: the clamp accelerates uniformly over `ramp`, moves at `speed`, and from `stop`
/// decelerates uniformly over `ramp` to rest; with `ramp` = 0 its velocity jumps at 0 and at `stop`.
#[derive(Clone, Copy, Debug)]
struct Profile {
    speed: f64,
    ramp: f64,
    stop: f64,
}

impl Profile {
    fn acceleration(&self) -> f64 {
        if self.ramp > 0.0 { self.speed / self.ramp } else { 0.0 }
    }

    fn speed_at_stop(&self) -> f64 {
        if self.ramp > 0.0 { self.speed * (self.stop / self.ramp).min(1.0) } else { self.speed }
    }

    fn braking(&self) -> f64 {
        if self.ramp > 0.0 { self.speed_at_stop() / self.acceleration() } else { 0.0 }
    }

    /// Instants where the clamp's acceleration or (zero ramp) velocity changes.
    fn transitions(&self) -> [f64; 4] {
        [0.0, self.ramp, self.stop, self.stop + self.braking()]
    }

    /// Shortening removed so far, its rate and its acceleration at t (in t*); at a transition
    /// `before` gives the limit from below.
    fn at(&self, t: f64, before: bool) -> (f64, f64, f64) {
        let (speed, ramp, stop) = (self.speed, self.ramp, self.stop);
        let a = self.acceleration();
        let past = |b: f64| if before { t > b } else { t >= b };
        let removed = |t: f64| if ramp > 0.0 && t < ramp { 0.5 * a * t * t } else { speed * (t - 0.5 * ramp) };
        let (v0, braking) = (self.speed_at_stop(), self.braking());
        let d = if t <= 0.0 {
            0.0
        } else if t <= stop {
            removed(t)
        } else {
            let tau = (t - stop).min(braking);
            removed(stop) + v0 * tau - 0.5 * a * tau * tau
        };
        let (v, acc) = if !past(0.0) {
            (0.0, 0.0)
        } else if !past(stop) {
            if ramp > 0.0 && !past(ramp) { (a * t, a) } else { (speed, 0.0) }
        } else if past(stop + braking) {
            (0.0, 0.0)
        } else {
            (v0 - a * (t - stop), -a)
        };
        (d, v, acc)
    }
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
#[serde(rename_all = "camelCase")]
pub struct Trace {
    #[serde(skip)]
    pub end_shortening: Vec<f64>,
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
    pub t_snap: Option<f64>,
    pub mu_snap: Option<f64>,
    /// End of the jump: the first maximum of the midpoint height after the crossing.
    pub t_end: Option<f64>,
    /// max |θ| before t = 0 and during the jump (0 < t ≤ t_end).
    pub theta_before: f64,
    pub theta_before_mu_a: f64,
    pub theta_during: Option<f64>,
    /// Eq. (2): theta_during / theta_before.
    pub amplification: Option<f64>,
    /// The same with t = 0 at µ = µ_A instead of µ*.
    pub amplification_from_mu_a: Option<f64>,
    /// Steps of length dt; substeps (motion transitions, halving) are not counted.
    pub steps: usize,
    pub newton_iterations: usize,
    /// The run stopped early, after the jump had ended, where Newton failed even on 2⁸
    /// substeps.
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Jump {
    pub t_snap: f64,
    pub mu_snap: f64,
    pub t_end: f64,
    pub theta_during: f64,
    pub amplification: f64,
    pub amplification_from_mu_a: f64,
}

impl Outcome {
    pub fn jump(&self) -> Result<Jump, String> {
        match (self.t_snap, self.mu_snap, self.t_end, self.theta_during, self.amplification, self.amplification_from_mu_a) {
            (Some(t_snap), Some(mu_snap), Some(t_end), Some(theta_during), Some(amplification), Some(amplification_from_mu_a)) if self.snapped && [t_snap, mu_snap, t_end, theta_during, amplification, amplification_from_mu_a].into_iter().all(f64::is_finite) => {
                Ok(Jump { t_snap, mu_snap, t_end, theta_during, amplification, amplification_from_mu_a })
            }
            _ if self.snapped => Err("undefined jump amplification".into()),
            _ => Err("the strip did not snap".into()),
        }
    }
}

pub struct Simulation {
    pub settings: Settings,
    pub frames: Vec<Frame>,
    pub trace: Trace,
    pub outcome: Outcome,
}

struct Sample {
    end_shortening: f64,
    t: f64,
    mu: f64,
    theta: f64,
    height: f64,
    /// The step of length dt this sample ends or lies in (0 for the start).
    step: usize,
}

impl Sample {
    fn at(strip: &Strip, q: &[f64], t: f64, mu: f64, step: usize) -> Self {
        let mid = DOFS * strip.mid();
        Self { t, mu, step, end_shortening: q[0] - q[DOFS * strip.n], height: q[mid + 1], theta: q[mid + 2] }
    }
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

/// Rejects a converged step that turned a node by more than 0.3 rad or left a node's tangent
/// more than 1 rad from its element chords. Newton can otherwise settle on a root 2π away in a
/// nodal rotation, or on a folded element, which the co-rotational element cannot tell apart.
fn plausible(old: &[f64], new: &[f64], n: usize) -> bool {
    let wrap = |a: f64| (a + std::f64::consts::PI).rem_euclid(2.0 * std::f64::consts::PI) - std::f64::consts::PI;
    let h = 1.0 / n as f64;
    (0..=n).all(|i| (new[DOFS * i + 2] - old[DOFS * i + 2]).abs() < 0.3)
        && (0..n).all(|e| {
            let (a, b) = (DOFS * e, DOFS * (e + 1));
            let chord = (new[b + 1] - new[a + 1]).atan2(h + new[b] - new[a]);
            wrap(new[a + 2] - chord).abs() < 1.0 && wrap(new[b + 2] - chord).abs() < 1.0
        })
}

struct Motion {
    profile: Profile,
    one_end: bool,
    left: f64,
    right: f64,
}

impl Motion {
    /// Clamp velocities and accelerations (left, right) at t; `before` as in `Profile::at`.
    fn kinematics(&self, t: f64, before: bool) -> ([f64; 2], [f64; 2]) {
        let (_, v, a) = self.profile.at(t, before);
        if self.one_end { ([-v, 0.0], [-a, 0.0]) } else { ([-0.5 * v, 0.5 * v], [-0.5 * a, 0.5 * a]) }
    }

    /// Sets the clamp positions at time t.
    fn set(&self, q: &mut [f64], n: usize, t: f64) {
        let (d, _, _) = self.profile.at(t, true);
        if self.one_end {
            q[0] = self.left - d;
            q[DOFS * n] = -self.right;
        } else {
            q[0] = self.left - 0.5 * d;
            q[DOFS * n] = -(self.right - 0.5 * d);
        }
    }

    /// The first transition strictly inside (a, b), leaving no substep shorter than `margin`.
    fn transition_in(&self, a: f64, b: f64, margin: f64) -> Option<f64> {
        self.profile.transitions().into_iter().filter(|&tau| tau.is_finite() && tau > a + margin && tau < b - margin).min_by(f64::total_cmp)
    }

    /// Where a step from t0 meant to end at t1 ends: on the first transition within `margin` of
    /// t1, or a jump that rounding puts inside the step is lost.
    fn snap(&self, t0: f64, t1: f64, margin: f64) -> f64 {
        self.profile.transitions().into_iter().filter(|&tau| (tau - t1).abs() <= margin && tau > t0 + 0.5 * margin).min_by(f64::total_cmp).unwrap_or(t1)
    }

    /// The instant whose limit from above holds just after t: transitions closer than `margin`
    /// after t are merged into t, since a substep that short would be lost to round-off in
    /// Newmark's acceleration (q₁ − q̃)/(βh²).
    fn merged(&self, t: f64, margin: f64) -> f64 {
        self.profile.transitions().into_iter().filter(|&tau| tau >= t && tau <= t + margin).fold(t, f64::max)
    }
}

enum Halt {
    /// Newton failed on the smallest substep starting at this time.
    Newton(f64),
    Error(String),
}

impl From<String> for Halt {
    fn from(e: String) -> Self {
        Halt::Error(e)
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
    /// Shortest substep at a motion transition (10⁻³ dt).
    margin: f64,
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

    /// One step from t to `end`; on failure the state is left unchanged.
    fn step(&mut self, t: f64, end: f64) -> Result<bool, String> {
        let (n, beta) = (self.n, self.beta);
        let h = end - t;
        let size = self.q.len();
        let mut q1 = self.q.clone();
        self.motion.set(&mut q1, n, end);
        let (velocities, ends) = self.motion.kinematics(end, true);
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
        if !converged || !plausible(&self.q, &q1, n) {
            return Ok(false);
        }
        self.assembler.assemble(&q1, &mut self.force, |_, _, _| {});
        let gamma = self.gamma;
        for i in (DOFS..DOFS * n).filter(|i| i % DOFS != 2) {
            a1[i] = (q1[i] - predicted[i]) / (beta * h * h);
            self.v[i] += h * ((1.0 - gamma) * self.acc[i] + gamma * a1[i]);
        }
        self.v[0] = velocities[0];
        self.v[DOFS * n] = velocities[1];
        self.acc = a1;
        self.q = q1;
        self.f_old.copy_from_slice(&self.force);
        Ok(true)
    }

    /// Brings the clamps to their velocities and accelerations just after t. A jump Δ in a
    /// prescribed clamp velocity is an impulse: with the consistent mass the free DOFs take
    /// M_ff Δv_f = −M_fc Δv_c, and likewise for a jump in acceleration.
    fn jump(&mut self, t: f64) -> Result<(), String> {
        let n = self.n;
        let clamps = [0, DOFS * n];
        let (v, a) = self.motion.kinematics(self.motion.merged(t, self.margin), false);
        for (state, target) in [(0, v), (1, a)] {
            let current = if state == 0 { &self.v } else { &self.acc };
            let delta = [target[0] - current[clamps[0]], target[1] - current[clamps[1]]];
            if delta == [0.0, 0.0] {
                continue;
            }
            let nf = DOFS * (n - 1);
            let mut m = Band::new(nf, 2 * DOFS - 1);
            let mut rhs = vec![0.0; nf];
            for i in DOFS..DOFS * n {
                let r = i - DOFS;
                if i % DOFS == 2 {
                    m.add(r, r, 1.0);
                    continue;
                }
                for &(j, w) in &self.mass[i] {
                    if let Some(k) = clamps.iter().position(|&c| c == j) {
                        rhs[r] -= w * delta[k];
                    } else if self.free(j) {
                        m.add(r, j - DOFS, w);
                    }
                }
            }
            m.solve(&mut rhs)?;
            let x = if state == 0 { &mut self.v } else { &mut self.acc };
            for i in (DOFS..DOFS * n).filter(|i| i % DOFS != 2) {
                x[i] += rhs[i - DOFS];
            }
            x[clamps[0]] = target[0];
            x[clamps[1]] = target[1];
        }
        Ok(())
    }

    /// Advances from t by about h, in substeps split at the motion's transitions and halved where
    /// Newton fails (down to h/2⁸), and returns the time reached: t + h, or a transition within
    /// `margin` of it. `accepted` sees the state after every accepted substep, at its end time,
    /// and may change the motion from that instant on.
    fn advance(&mut self, t: f64, h: f64, accepted: &mut dyn FnMut(&mut Integrator, f64) -> Result<(), String>) -> Result<f64, Halt> {
        let margin = self.margin;
        let mut now = t;
        let mut pending = vec![(t + h, 0u32)];
        while let Some((t1, depth)) = pending.pop() {
            if let Some(tau) = self.motion.transition_in(now, t1, margin) {
                pending.push((t1, depth));
                pending.push((tau, depth));
                continue;
            }
            let end = self.motion.snap(now, t1, margin);
            if self.step(now, end)? {
                now = end;
                self.jump(now)?;
                accepted(self, now)?;
            } else if depth >= 8 {
                return Err(Halt::Newton(now));
            } else {
                pending.push((t1, depth + 1));
                pending.push((0.5 * (now + t1), depth + 1));
            }
        }
        Ok(now)
    }
}

/// Integrates M ü + f_int(u) = 0 with the HHT-α method and Newton iterations on the production
/// co-rotational internal force and tangent, from the inverted equilibrium `start`, the clamps
/// moving apart at the rate of `settings`. Time is measured from the instant µ = `mu_star`.
pub fn simulate(settings: &Settings, start: &Equilibrium, mu_star: f64, mu_a: f64, cancel: &mut dyn FnMut(f64) -> bool) -> Result<Simulation, String> {
    settings.validate()?;
    integrate(settings, start, mu_star, mu_a, cancel).map_err(|e| format!("{e} (µ̇ = {}, one end: {}, seed {}, phase {}, n {})", settings.rate, settings.one_end, settings.imperfection, settings.phase, settings.n))
}

/// Time the clamps may rest after braking without the jump ending, in T_osc.
const REST: f64 = 20.0;

fn integrator(settings: &Settings, start: &Equilibrium, profile: Profile) -> Result<Integrator, String> {
    let strip = settings.strip();
    let n = strip.n;
    let size = DOFS * (n + 1);
    let mut mass = vec![vec![]; size];
    for (i, j, v) in mass_band(n) {
        mass[i].push((j, v));
    }
    let motion = Motion { profile, one_end: settings.one_end, left: start.clamps.left, right: start.clamps.right };
    let mut assembler = Assembler::new(&strip);
    let mut q = start.q.clone();
    let mut v = vec![0.0; size];
    if settings.imperfection != 0.0 {
        let (mode, w2) = antisymmetric_mode(&strip, &mut assembler, &start.q);
        let omega = w2.max(0.0).sqrt();
        for i in 0..size {
            q[i] += settings.imperfection * settings.phase.cos() * mode[i];
            if i % DOFS != 2 {
                v[i] = -settings.imperfection * omega * settings.phase.sin() * mode[i];
            }
        }
        v[0] = 0.0;
        v[DOFS * n] = 0.0;
    }
    motion.set(&mut q, n, 0.0);
    let mut acc = vec![0.0; size];
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
        margin: 1e-3 * settings.dt * T_OSC,
        assembler,
        mass,
        motion,
        q,
        v,
        acc,
        f_old: force.clone(),
        force,
        band: Band::new(nf, 2 * DOFS - 1),
        residual: vec![0.0; nf],
        iterations: 0,
    };
    integrator.jump(0.0)?;
    Ok(integrator)
}

fn integrate(settings: &Settings, start: &Equilibrium, mu_star: f64, mu_a: f64, cancel: &mut dyn FnMut(f64) -> bool) -> Result<Simulation, String> {
    let strip = settings.strip();
    let a2 = strip.alpha * strip.alpha;
    let free = Profile { speed: settings.rate * a2 / T_OSC, ramp: settings.ramp * T_OSC, stop: f64::INFINITY };
    let dt = settings.dt * T_OSC;
    let s0 = start.clamps.shortening();
    let mu_at = |t: f64, profile: &Profile| (s0 - profile.at(t, true).0) / a2;
    let when = |target: f64| {
        let (mut lo, mut hi) = (0.0, 1.0);
        while mu_at(hi, &free) > target {
            hi *= 2.0;
        }
        for _ in 0..200 {
            let m = 0.5 * (lo + hi);
            if mu_at(m, &free) > target { lo = m } else { hi = m }
        }
        0.5 * (lo + hi)
    };
    let t_star = when(mu_star);
    let t_a = when(mu_a);
    let clock = |t: f64| (t - t_star) / T_OSC;

    let mut integrator = integrator(settings, start, Profile { stop: when(STOPPER), ..free })?;
    let fine = (0.125 / settings.dt).round().max(1.0) as usize;
    let coarse = (((settings.start - mu_star) / settings.rate) / 60.0).max(0.125);
    let mut frames: Vec<Frame> = vec![frame(&strip, &integrator.q, clock(0.0), mu_at(0.0, &free))];
    let mut recent: std::collections::VecDeque<Frame> = Default::default();
    let keep = 48;
    let mut samples = vec![Sample::at(&strip, &integrator.q, clock(0.0), mu_at(0.0, &free), 0)];
    let mut crossed = false;
    let mut ended = false;
    let mut end_time = f64::INFINITY;
    let mut truncated = false;
    let mut t = 0.0;
    let mut step = 0usize;
    while t < end_time {
        if step > 3_000_000 {
            return Err("too many steps".into());
        }
        if cancel(mu_at(t, &integrator.motion.profile)) {
            return Err("stopped".into());
        }
        let after = settings.after * T_OSC;
        let h = if t == 0.0 && t_a > 0.0 && t_a <= dt { 0.5 * t_a } else { dt };
        let result = integrator.advance(t, h, &mut |integrator, now| {
            let mu = mu_at(now, &integrator.motion.profile);
            let sample = Sample::at(&strip, &integrator.q, clock(now), mu, step + 1);
            let falling = samples.last().is_some_and(|last| sample.height < last.height);
            crossed |= sample.height > 0.0;
            samples.push(sample);
            if crossed && falling && !ended {
                ended = true;
                end_time = now + after;
            }
            if ended && now < integrator.motion.profile.stop {
                integrator.motion.profile.stop = now;
                integrator.jump(now)?;
            }
            Ok(())
        });
        match result {
            Ok(reached) => t = reached,
            Err(Halt::Newton(_)) if ended => {
                truncated = true;
                break;
            }
            Err(Halt::Newton(at)) => {
                let q = &integrator.q;
                return Err(format!("Newton did not converge at t = {:.4} T_osc (µ {:.4}, h {:.4}){}", clock(at), mu_at(at, &integrator.motion.profile), q[DOFS * strip.mid() + 1], if crossed { ", during the jump" } else { "" }));
            }
            Err(Halt::Error(e)) => return Err(e),
        }
        step += 1;
        if step.is_multiple_of(fine) {
            let mu = mu_at(t, &integrator.motion.profile);
            recent.push_back(frame(&strip, &integrator.q, clock(t), mu));
            if !crossed && recent.len() > keep {
                let old = recent.pop_front().unwrap();
                if frames.last().is_none_or(|f| old.t - f.t >= coarse) {
                    frames.push(old);
                }
            }
        }
        let profile = integrator.motion.profile;
        if !ended && t > profile.stop + profile.braking() + REST * T_OSC {
            if crossed {
                return Err("the jump did not end while the clamps were at rest".into());
            }
            break;
        }
    }
    frames.extend(recent);
    let last = samples.last().unwrap();
    if frames.last().is_none_or(|f| f.t != last.t) {
        frames.push(frame(&strip, &integrator.q, last.t, last.mu));
    }

    let mut outcome = outcome(&samples, clock(t_a), step, integrator.iterations, |time| mu_at(t_star + time * T_OSC, &integrator.motion.profile))?;
    outcome.truncated = truncated;
    let trace = bin(&samples, 1500, step);
    Ok(Simulation { settings: *settings, frames, trace, outcome })
}

/// At most `count` bins of whole steps of length dt, so that the trace does not depend on how
/// many substeps a step took.
fn bin(samples: &[Sample], count: usize, steps: usize) -> Trace {
    let per = steps.div_ceil(count).max(1);
    let group = |s: &Sample| s.step.saturating_sub(1) / per;
    let mut trace = Trace::default();
    for chunk in samples.chunk_by(|a, b| group(a) == group(b)) {
        let last = chunk.last().unwrap();
        trace.end_shortening.push(last.end_shortening);
        trace.t.push(last.t);
        trace.mu.push(last.mu);
        trace.theta_min.push(chunk.iter().map(|s| s.theta).fold(f64::INFINITY, f64::min));
        trace.theta_max.push(chunk.iter().map(|s| s.theta).fold(f64::NEG_INFINITY, f64::max));
        trace.height.push(last.height);
    }
    trace
}

fn outcome(samples: &[Sample], t_a: f64, steps: usize, newton_iterations: usize, mu_at: impl Fn(f64) -> f64) -> Result<Outcome, String> {
    let before = samples.iter().filter(|s| s.t < 0.0).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let before_a = samples.iter().filter(|s| s.t < t_a).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let mut outcome = Outcome {
        snapped: false,
        t_snap: None,
        mu_snap: None,
        t_end: None,
        theta_before: before,
        theta_before_mu_a: before_a,
        theta_during: None,
        amplification: None,
        amplification_from_mu_a: None,
        steps,
        newton_iterations,
        truncated: false,
    };
    let Some(k) = samples.iter().position(|s| s.height > 0.0) else {
        return Ok(outcome);
    };
    let mut e = k;
    while e + 1 < samples.len() && samples[e + 1].height >= samples[e].height {
        e += 1;
    }
    if e + 1 == samples.len() {
        return Err("the midpoint height had not passed its first maximum after the crossing".into());
    }
    let t_end = samples[e].t;
    let max_abs = |from: f64| samples.iter().filter(|s| s.t > from && s.t <= t_end).map(|s| s.theta.abs()).fold(0.0, f64::max);
    let during = max_abs(0.0);
    let previous = &samples[k.checked_sub(1).ok_or("unbracketed midpoint crossing")?];
    let fraction = -previous.height / (samples[k].height - previous.height);
    outcome.snapped = true;
    let crossing = previous.t + fraction * (samples[k].t - previous.t);
    outcome.t_snap = Some(crossing);
    outcome.mu_snap = Some(mu_at(crossing));

    outcome.t_end = Some(t_end);
    outcome.theta_during = Some(during);
    outcome.amplification = (before > 0.0).then(|| during / before).filter(|v| v.is_finite());
    outcome.amplification_from_mu_a = (before_a > 0.0).then(|| max_abs(t_a) / before_a).filter(|v| v.is_finite());
    Ok(outcome)
}

pub fn start_clamps(strip: &Strip, mu0: f64) -> Clamps {
    Clamps::symmetric(mu0 * strip.alpha * strip.alpha)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::statics::{invert, natural};

    fn start() -> (Settings, Equilibrium) {
        let s = Settings { alpha: 0.26, n: 8, slenderness: 2126.0, rate: 0.05, start: 0.6, one_end: true, ramp: 0.0, imperfection: 0.0, phase: 0.0, dt: 0.005, hht: -0.1, after: 0.5 };
        let strip = s.strip();
        let up = natural(&strip, s.start * s.alpha * s.alpha).unwrap();
        (s, invert(&strip, &up, false).unwrap().1)
    }

    fn free_rows(it: &Integrator, x: &[f64]) -> Vec<f64> {
        (DOFS..DOFS * it.n).filter(|i| i % DOFS != 2).map(|i| it.mass[i].iter().map(|&(j, w)| w * x[j]).sum()).collect()
    }

    #[test]
    fn the_profile_moves_continuously_and_jumps_only_at_its_transitions() {
        let p = Profile { speed: 2.0, ramp: 0.5, stop: 3.0 };
        for (tau, distance) in p.transitions().into_iter().zip([0.0, 0.5, 5.5, 6.0]) {
            for t in [tau.next_down(), tau, tau.next_up()] {
                assert!((p.at(t, false).0 - distance).abs() <= 1e-15);
            }
            let (d0, v0, _) = p.at(tau, true);
            let (d1, v1, _) = p.at(tau, false);
            assert!((d0 - d1).abs() < 1e-15 && (v0 - v1).abs() < 1e-15, "{tau}");
        }
        assert_eq!((p.at(0.0, true).2, p.at(0.0, false).2), (0.0, 4.0));
        assert_eq!((p.at(0.5, true).2, p.at(0.5, false).2), (4.0, 0.0));
        assert_eq!((p.at(3.0, true).2, p.at(3.0, false).2), (0.0, -4.0));
        assert_eq!((p.at(3.5, true).2, p.at(3.5, false)), (-4.0, (6.0, 0.0, 0.0)));
        let z = Profile { speed: 2.0, ramp: 0.0, stop: 3.0 };
        assert_eq!((z.at(0.0, true).1, z.at(0.0, false).1), (0.0, 2.0));
        assert_eq!((z.at(3.0, true).1, z.at(3.0, false).1), (2.0, 0.0));
        assert_eq!(z.at(5.0, false), (6.0, 0.0, 0.0));
    }

    #[test]
    fn a_clamp_launched_without_a_ramp_gives_the_free_nodes_its_impulse() {
        let (s, eq) = start();
        let it = integrator(&s, &eq, Profile { speed: 1.0, ramp: 0.0, stop: f64::INFINITY }).unwrap();
        assert_eq!(it.v[0], -1.0);
        let momentum = free_rows(&it, &it.v);
        assert!(momentum.iter().all(|p| p.abs() < 1e-14), "{momentum:?}");
        let decay = it.v[DOFS] / it.v[0];
        assert!((decay + (2.0 - 3f64.sqrt())).abs() < 1e-3, "the consistent mass's response decays by −(2 − √3) per node: {decay}");
    }

    #[test]
    fn steps_end_on_the_transitions_and_an_acceleration_jump_keeps_equilibrium() {
        let (s, eq) = start();
        let dt = s.dt * T_OSC;
        let profile = Profile { speed: 1.0, ramp: 0.3 * dt, stop: 2.4 * dt };
        let mut it = integrator(&s, &eq, profile).unwrap();
        let mut times = vec![];
        let mut t = 0.0;
        for _ in 0..4 {
            t = it
                .advance(t, dt, &mut |_, now| {
                    times.push(now);
                    Ok(())
                })
                .map_err(|_| "step failed")
                .unwrap();
        }
        for tau in [profile.ramp, profile.stop, profile.stop + profile.braking()] {
            assert!(times.contains(&tau), "no substep ends at {} dt: {times:?}", tau / dt);
        }
        let mut it = integrator(&s, &eq, profile).unwrap();
        assert!(it.step(0.0, profile.ramp).unwrap());
        let before = free_rows(&it, &it.acc);
        it.jump(profile.ramp).unwrap();
        let after = free_rows(&it, &it.acc);
        assert_eq!(it.acc[0], 0.0);
        let kick = profile.acceleration() * it.mass[DOFS].iter().find(|&&(j, _)| j == 0).unwrap().1;
        let change = before.iter().zip(&after).fold(0.0f64, |m, (a, b)| m.max((a - b).abs()));
        assert!(change < 1e-9 * kick, "the free rows' inertia moved by {change} against a clamp kick of {kick}");
    }

    #[test]
    fn braking_on_a_step_boundary_is_not_lost_to_rounding() {
        let (s, eq) = start();
        let dt = s.dt * T_OSC;
        let mut it = integrator(&s, &eq, Profile { speed: 1.0, ramp: 0.0, stop: 3.0 * dt }).unwrap();
        let mut t = 0.0;
        for _ in 0..2 {
            t = it.advance(t, dt, &mut |_, _| Ok(())).map_err(|_| "step failed").unwrap();
        }
        let mut probe = integrator(&s, &eq, Profile { speed: 1.0, ramp: 0.0, stop: f64::INFINITY }).unwrap();
        probe.q.clone_from(&it.q);
        probe.v.clone_from(&it.v);
        probe.acc.clone_from(&it.acc);
        probe.f_old.clone_from(&it.f_old);
        assert!(probe.step(t, 3.0 * dt).unwrap());
        let moving = probe.v.clone();
        t = it.advance(t, dt, &mut |_, _| Ok(())).map_err(|_| "step failed").unwrap();
        assert_eq!(t, 3.0 * dt);
        assert_eq!(it.v[0], 0.0);
        let delta: Vec<f64> = it.v.iter().zip(&moving).map(|(a, b)| a - b).collect();
        let momentum = free_rows(&it, &delta);
        assert!(momentum.iter().all(|p| p.abs() < 1e-12), "the stop's impulse is in the free nodes: {momentum:?}");
        assert!(delta[DOFS] < 0.0, "{}", delta[DOFS]);
    }

    #[test]
    fn a_zero_ramp_approaches_short_ramps_once_the_axial_ringing_has_decayed() {
        let (s, eq) = start();
        let dt = s.dt * T_OSC;
        let transverse = |ramp: f64| {
            let mut it = integrator(&s, &eq, Profile { speed: 1.0, ramp, stop: 3.0 * dt }).unwrap();
            let mut t = 0.0;
            for _ in 0..60 {
                t = it.advance(t, dt, &mut |_, _| Ok(())).map_err(|_| "step failed").unwrap();
            }
            it.v.iter().skip(1).step_by(DOFS).copied().collect::<Vec<f64>>()
        };
        let sharp = transverse(0.0);
        let gap = |ramp: f64| transverse(ramp).iter().zip(&sharp).fold(0.0f64, |m, (a, b)| m.max((a - b).abs()));
        let scale = sharp.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let (short, long) = (gap(0.003 * dt), gap(0.1 * dt));
        assert!(short < 0.05 * scale && short < long, "{short} and {long} against {scale}");
    }
    #[test]
    fn review_snapped_with_zero_pre_fold_angle_has_no_ratio() {
        let samples: Vec<_> = [(-1., -1.), (0.5, -0.5), (1., 0.5), (2., 1.), (3., 0.5)].into_iter()
            .enumerate().map(|(step, (t, height))| Sample { end_shortening: 1.0, t, height, mu: 1.0, theta: 0.0, step }).collect();
        let result = outcome(&samples, -0.5, 4, 4, |_| 1.0).unwrap();
        assert!(result.snapped);
        assert_eq!(result.amplification, None);
        assert_eq!(result.amplification_from_mu_a, None);
        let invalid = Outcome { amplification: Some(f64::NAN), amplification_from_mu_a: Some(1.0), ..result };
        assert!(invalid.jump().is_err());
    }
}
