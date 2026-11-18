use crate::model::{to_displacements, to_vector, Assembler, Clamps, Strip, DOFS};
use crate::spectrum::{mirror_basis, mirror_stable, project, spectrum, Spectrum};
use dedaliano_engine::linalg::lu_solve;
use dedaliano_engine::solver::arc_length::{solve_arc_length_from, ArcLengthInput};
use dedaliano_engine::solver::corotational::{solve_corotational_2d_from, CorotationalStart2D};
use dedaliano_engine::types::SolverInput;
use serde::Serialize;

const TOLERANCE: f64 = 1e-10;
const MAX_ITERATIONS: usize = 60;

/// A converged equilibrium: its clamp setting and node-major displacements.
#[derive(Clone, Debug)]
pub struct Equilibrium {
    pub clamps: Clamps,
    pub q: Vec<f64>,
}

impl Equilibrium {
    pub fn height(&self, strip: &Strip) -> f64 {
        self.q[DOFS * strip.mid() + 1]
    }
    pub fn mid_angle(&self, strip: &Strip) -> f64 {
        self.q[DOFS * strip.mid() + 2]
    }
}

fn reach(strip: &Strip, from: &Equilibrium, from_input: &SolverInput, to: Clamps, increments: usize) -> Result<(Equilibrium, SolverInput), String> {
    let input = strip.input(to, strip.alpha, false);
    let displacements = to_displacements(&from.q);
    let start = CorotationalStart2D { input: from_input, displacements: &displacements };
    let r = solve_corotational_2d_from(&input, Some(&start), MAX_ITERATIONS, TOLERANCE, increments, false)?;
    if !r.converged {
        return Err(format!("no equilibrium reached at {to:?}"));
    }
    Ok((Equilibrium { clamps: to, q: to_vector(strip.n, &r.results.displacements) }, input))
}

/// The natural state at end-shortening `shortening`: the clamps are turned to ±α while the
/// right end slides freely (a circular arc), then both ends are clamped and moved
/// symmetrically to ±shortening/2 with the production co-rotational solver.
pub fn natural(strip: &Strip, shortening: f64) -> Result<Equilibrium, String> {
    let n = strip.n;
    let turns = (strip.alpha / 0.02).ceil().max(1.0) as usize;
    let mut input = strip.input(Clamps::symmetric(0.0), 0.0, true);
    let mut q = vec![0.0; DOFS * (n + 1)];
    for k in 1..=turns {
        let next = strip.input(Clamps::symmetric(0.0), strip.alpha * k as f64 / turns as f64, true);
        let displacements = to_displacements(&q);
        let start = CorotationalStart2D { input: &input, displacements: &displacements };
        let r = solve_corotational_2d_from(&next, Some(&start), MAX_ITERATIONS, TOLERANCE, 1, false)?;
        if !r.converged {
            return Err("the clamps could not be turned".into());
        }
        q = to_vector(n, &r.results.displacements);
        input = next;
    }
    let arc = -q[DOFS * n];
    let mut state = Equilibrium { clamps: Clamps { left: 0.0, right: arc, load: 0.0 }, q };
    let mut from_input = strip.input(state.clamps, strip.alpha, false);
    let target = Clamps::symmetric(shortening);
    let span = (target.left - state.clamps.left).abs().max((target.right - state.clamps.right).abs());
    let moves = (span / (0.05 * strip.alpha * strip.alpha)).ceil().max(1.0) as usize;
    let initial = state.clamps;
    for k in 1..=moves {
        let f = k as f64 / moves as f64;
        let to = Clamps {
            left: initial.left + (target.left - initial.left) * f,
            right: initial.right + (target.right - initial.right) * f,
            load: 0.0,
        };
        let (next, next_input) = reach(strip, &state, &from_input, to, 1)?;
        state = next;
        from_input = next_input;
    }
    let h = state.height(strip);
    at_height(strip, &mut Assembler::new(strip), &state, h, Free::Shortening)
}

#[derive(Clone, Debug, Serialize)]
pub struct PathPoint {
    pub shortening: f64,
    pub load: f64,
    pub height: f64,
    pub mid_angle: f64,
    pub spectrum: Spectrum,
}

pub struct Path {
    pub points: Vec<PathPoint>,
    pub states: Vec<Equilibrium>,
}

/// Production arc-length from `from` along `pattern`. The constraint ‖Δu‖² + Δλ²‖f_ref‖² mixes
/// displacements (of order α) with loads (of order 150α EI/L² at the limit point); `stiffness`
/// scales EI so both are of the same order and the predictor's direction test does not turn
/// back at the limit point. Equilibrium shapes do not depend on it.
#[allow(clippy::too_many_arguments)]
fn arc_length(strip: &Strip, from: &Equilibrium, pattern: Clamps, stiffness: f64, ds: f64, max_ds: f64, steps: usize, stop: &mut dyn FnMut(&Equilibrium) -> bool, eigen: bool) -> Result<Path, String> {
    let start_input = strip.input_with(from.clamps, strip.alpha, false, stiffness);
    let displacements = to_displacements(&from.q);
    let start = CorotationalStart2D { input: &start_input, displacements: &displacements };
    let pattern_input = strip.input_with(pattern, 0.0, false, stiffness);
    let mut points = vec![];
    let mut states = vec![];
    let mut assembler = Assembler::new(strip);
    let mut polisher = Assembler::new(strip);
    let mut record = |s: Equilibrium, points: &mut Vec<PathPoint>, states: &mut Vec<Equilibrium>| {
        let spec = if eigen { spectrum(strip, &mut assembler, &s.q) } else { Spectrum::default() };
        points.push(PathPoint { shortening: s.clamps.shortening(), load: s.clamps.load, height: s.height(strip), mid_angle: s.mid_angle(strip), spectrum: spec });
        states.push(s);
    };
    record(from.clone(), &mut points, &mut states);
    let input = ArcLengthInput {
        solver: pattern_input,
        max_steps: steps,
        max_iter: 40,
        tolerance: 1e-9,
        initial_ds: ds,
        min_ds: ds * 1e-4,
        max_ds,
        target_iter: 5,
    };
    let r = solve_arc_length_from(&input, Some(&start))?;
    for step in &r.steps {
        let lambda = step.load_factor;
        let clamps = Clamps {
            left: from.clamps.left + lambda * pattern.left,
            right: from.clamps.right + lambda * pattern.right,
            load: from.clamps.load + lambda * pattern.load,
        };
        let raw = Equilibrium { clamps, q: to_vector(strip.n, &step.displacements) };
        let s = at_height(strip, &mut polisher, &raw, raw.height(strip), if pattern.load != 0.0 { Free::Load } else { Free::Shortening })?;
        let done = stop(&s);
        record(s, &mut points, &mut states);
        if done {
            break;
        }
    }
    Ok(Path { points, states })
}

/// From the natural state, a downward midpoint load traced by production arc-length through
/// its limit point until it returns to zero on the inverted side; the last state is then
/// relaxed to zero load.
pub fn invert(strip: &Strip, natural: &Equilibrium, eigen: bool) -> Result<(Path, Equilibrium), String> {
    let scale = 0.05;
    let mut crossings = 0;
    let mut last_load = 0.0;
    let mut stop = |s: &Equilibrium| {
        if last_load > 0.0 && s.clamps.load <= 0.0 && s.height(strip) < 0.0 {
            crossings += 1;
        }
        last_load = s.clamps.load;
        crossings > 0 && s.clamps.load > 0.0
    };
    let path = arc_length(strip, natural, Clamps { left: 0.0, right: 0.0, load: 1.0 }, 0.005, scale * strip.alpha, 4.0 * scale * strip.alpha, 4000, &mut stop, eigen)?;
    let k = path
        .states
        .iter()
        .enumerate()
        .skip(1)
        .find(|(i, s)| s.height(strip) < 0.0 && path.states[i - 1].clamps.load <= 0.0 && s.clamps.load > 0.0)
        .map(|(i, _)| i)
        .ok_or("the load path did not reach the inverted state")?;
    let from = &path.states[k];
    let from_input = strip.input(from.clamps, strip.alpha, false);
    let (inverted, _) = reach(strip, from, &from_input, Clamps { load: 0.0, ..from.clamps }, 4)?;
    let inverted = settle(strip, &mut Assembler::new(strip), &inverted)?;
    Ok((path, inverted))
}

/// Production arc-length on the end-shortening with the load held at zero, both ends moving
/// apart symmetrically, until `stop` says so.
pub fn release(strip: &Strip, from: &Equilibrium, ds: f64, max_ds: f64, steps: usize, stop: &mut dyn FnMut(&Equilibrium) -> bool, eigen: bool) -> Result<Path, String> {
    arc_length(strip, from, Clamps { left: -0.5, right: -0.5, load: 0.0 }, 1.0, ds, max_ds, steps, stop, eigen)
}

/// Which clamp quantity is left free when an equilibrium is converged at a given midpoint height.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Free {
    Shortening,
    Load,
}

/// Replaces q by its mirror-symmetric part (x ↦ 1 − x: ux and θ change sign, uz does not).
pub fn symmetrize(q: &mut [f64], n: usize) {
    for i in 0..=n / 2 {
        let j = n - i;
        for d in 0..DOFS {
            let s = if d == 1 { 1.0 } else { -1.0 };
            let v = 0.5 * (q[DOFS * i + d] + s * q[DOFS * j + d]);
            q[DOFS * i + d] = v;
            q[DOFS * j + d] = s * v;
        }
    }
}

/// Absolute residual (EI/L²) to which equilibria are converged: about ten times the round-off
/// floor of the internal force, which grows with the axial stiffness. The production solvers'
/// own tolerance is relative to a scale set by that stiffness (EA·L²/EI = 5·10⁷ here) and leaves
/// residuals up to 10⁻² EI/L² near the fold, enough to move µ* in the fourth digit.
pub fn residual_tolerance(strip: &Strip) -> f64 {
    1e-10 + 2e-15 * strip.axial_stiffness()
}

/// A symmetric equilibrium with the midpoint at `height`, from `state`, with the shortening or
/// the midpoint load as the extra unknown: Newton on the mirror-symmetric free DOFs bordered by
/// the height constraint, with the production co-rotational tangent. Height control stays
/// regular through folds of either control, and the symmetric subspace keeps round-off out of
/// the antisymmetric directions, singular at µ_A and negative beyond it.
pub fn at_height(strip: &Strip, assembler: &mut Assembler, state: &Equilibrium, height: f64, free: Free) -> Result<Equilibrium, String> {
    converge(strip, assembler, state, Some((height, free)))
}

/// A symmetric equilibrium at the clamps and load of `state`, from it (Newton on the
/// mirror-symmetric free DOFs; for states away from folds).
pub fn settle(strip: &Strip, assembler: &mut Assembler, state: &Equilibrium) -> Result<Equilibrium, String> {
    converge(strip, assembler, state, None)
}

fn converge(strip: &Strip, assembler: &mut Assembler, state: &Equilibrium, control: Option<(f64, Free)>) -> Result<Equilibrium, String> {
    let n = strip.n;
    let mut q = state.q.clone();
    let mut clamps = state.clamps;
    if clamps.left != clamps.right {
        return Err("symmetric clamps only".into());
    }
    let mid = DOFS * strip.mid() + 1;
    let set = |q: &mut Vec<f64>, c: &Clamps| {
        q[0] = c.left;
        q[1] = 0.0;
        q[2] = strip.alpha;
        q[DOFS * n] = -c.right;
        q[DOFS * n + 1] = 0.0;
        q[DOFS * n + 2] = -strip.alpha;
    };
    set(&mut q, &clamps);
    symmetrize(&mut q, n);
    let (basis, _) = mirror_basis(n, 1.0);
    let m = basis.len();
    let c_mid = basis.iter().position(|b| b.len() == 1 && b[0].0 == mid).ok_or("no midpoint coordinate")?;
    let size = q.len();
    let tolerance = residual_tolerance(strip);
    for _ in 0..60 {
        let (mut force, k) = assembler.dense(&q);
        force[mid] += clamps.load;
        let norm = (DOFS..DOFS * n).map(|i| force[i].abs()).fold(0.0f64, f64::max);
        if norm <= tolerance && control.is_none_or(|(h, _)| (q[mid] - h).abs() <= 1e-13) {
            return Ok(Equilibrium { clamps, q });
        }
        let ks = project(&k, size, &basis);
        let Some((height, free)) = control else {
            let mut a = ks;
            let mut b: Vec<f64> = basis.iter().map(|bv| -bv.iter().map(|&(i, wt)| wt * force[i]).sum::<f64>()).collect();
            let x = lu_solve(&mut a, &mut b, m).ok_or("singular symmetric tangent")?;
            for (c, bv) in x.iter().zip(&basis) {
                for &(i, wt) in bv {
                    q[i] += c * wt;
                }
            }
            if !q.iter().all(|v| v.is_finite()) {
                break;
            }
            continue;
        };
        let g: Vec<f64> = match free {
            Free::Shortening => (0..size).map(|i| 0.5 * k[i * size] - 0.5 * k[i * size + DOFS * n]).collect(),
            Free::Load => (0..size).map(|i| if i == mid { 1.0 } else { 0.0 }).collect(),
        };
        let w = m + 1;
        let mut a = vec![0.0; w * w];
        let mut b = vec![0.0; w];
        for r in 0..m {
            for c in 0..m {
                a[r * w + c] = ks[r * m + c];
            }
            a[r * w + m] = basis[r].iter().map(|&(i, wt)| wt * g[i]).sum();
            b[r] = -basis[r].iter().map(|&(i, wt)| wt * force[i]).sum::<f64>();
        }
        a[m * w + c_mid] = 1.0;
        b[m] = height - q[mid];
        let x = lu_solve(&mut a, &mut b, w).ok_or("singular bordered system")?;
        for (c, bv) in x[..m].iter().zip(&basis) {
            for &(i, wt) in bv {
                q[i] += c * wt;
            }
        }
        match free {
            Free::Shortening => {
                clamps.left += 0.5 * x[m];
                clamps.right += 0.5 * x[m];
            }
            Free::Load => clamps.load += x[m],
        }
        set(&mut q, &clamps);
        if !q.iter().all(|v| v.is_finite()) {
            break;
        }
    }
    Err("Newton did not converge".into())
}

/// The two critical points of the inverted branch: µ_A, where its lowest antisymmetric
/// stiffness vanishes, and µ*, its fold. Both are bracketed on the production arc-length path,
/// then refined along the symmetric branch parametrised by the midpoint height: µ_A by
/// bisection on the sign of the antisymmetric tangent (Sylvester's inertia), µ* by a
/// golden-section search for the least shortening.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Critical {
    pub mu_a: f64,
    pub mu_star: f64,
    pub height_a: f64,
    pub height_star: f64,
}

fn fold_index(path: &Path) -> Result<usize, String> {
    let k = (0..path.points.len()).min_by(|&a, &b| path.points[a].shortening.total_cmp(&path.points[b].shortening)).unwrap();
    if k == 0 || k + 1 >= path.points.len() {
        return Err("the path did not pass the fold".into());
    }
    Ok(k)
}

pub fn critical(strip: &Strip, inverted: &Equilibrium) -> Result<(Critical, Path), String> {
    let a2 = strip.alpha * strip.alpha;
    let mut least = f64::MAX;
    let mut stop = |s: &Equilibrium| {
        least = least.min(s.clamps.shortening());
        s.clamps.shortening() > least + 0.002 * a2
    };
    let coarse = release(strip, inverted, 0.02 * strip.alpha, 0.1 * strip.alpha, 4000, &mut stop, false)?;
    let k = fold_index(&coarse)?;
    let mut assembler = Assembler::new(strip);
    let mut solver = Assembler::new(strip);
    let mut stable_in = |q: &[f64], parity: f64| mirror_stable(strip, &mut assembler, q, parity);
    if !stable_in(&inverted.q, -1.0) {
        return Err("the start state is already unstable".into());
    }
    if stable_in(&coarse.states[k].q, -1.0) {
        return Err("no antisymmetric instability before the fold".into());
    }
    let (mut lo, mut hi) = (0usize, k);
    while hi - lo > 1 {
        let mid = (lo + hi) / 2;
        if stable_in(&coarse.states[mid].q, -1.0) { lo = mid } else { hi = mid }
    }
    let mut stable = coarse.states[lo].clone();
    let mut unstable_h = coarse.states[hi].height(strip);
    while (stable.height(strip) - unstable_h).abs() > 1e-12 {
        let h = 0.5 * (stable.height(strip) + unstable_h);
        let next = at_height(strip, &mut solver, &stable, h, Free::Shortening)?;
        if stable_in(&next.q, -1.0) { stable = next } else { unstable_h = h }
    }
    let mu_a = stable.clamps.shortening() / a2;
    let height_a = stable.height(strip);

    let invphi = 0.5 * (5f64.sqrt() - 1.0);
    let (mut a, mut b) = (coarse.states[k - 1].height(strip), coarse.states[k + 1].height(strip));
    let mut near = coarse.states[k].clone();
    let mut eval = |h: f64, near: &mut Equilibrium| -> Result<f64, String> {
        let s = at_height(strip, &mut solver, near, h, Free::Shortening)?;
        let v = s.clamps.shortening();
        *near = s;
        Ok(v)
    };
    let mut c = b - invphi * (b - a);
    let mut d = a + invphi * (b - a);
    let mut fc = eval(c, &mut near)?;
    let mut fd = eval(d, &mut near)?;
    while (b - a).abs() > 1e-11 {
        if fc < fd {
            b = d;
            d = c;
            fd = fc;
            c = b - invphi * (b - a);
            fc = eval(c, &mut near)?;
        } else {
            a = c;
            c = d;
            fc = fd;
            d = a + invphi * (b - a);
            fd = eval(d, &mut near)?;
        }
    }
    let h_star = 0.5 * (a + b);
    let star = eval(h_star, &mut near)?;
    let critical = Critical { mu_a, mu_star: star / a2, height_a, height_star: h_star };
    Ok((critical, coarse))
}
