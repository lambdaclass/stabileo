//! Checks that read the load cases and their results: equilibrium, the direction of gravity
//! loads, self-weight, weight per floor area, the fundamental period, tributary column loads and
//! displacement magnitudes.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use super::geometry::{cross, dot, norm, polygon_area, sub, ModelGeometry, Orientation};
use super::{
    finding, fmt, CaseKind, CheckId, Param, Params, PeriodSystem, Report, SanityCase, SanityCode, SanityInput, Severity,
    SkipReason,
};

pub(super) fn run(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    equilibrium(input, g, r);
    gravity_direction(input, g, r);
    self_weight(input, g, r);
    weight_per_area(input, g, r);
    period(input, g, r);
    tributary(input, g, r);
    deflection(input, g, r);
}

fn params(pairs: &[(&str, Param)]) -> Params {
    pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
}

fn names(cases: &[&SanityCase]) -> String {
    cases.iter().map(|c| if c.name.is_empty() { format!("#{}", c.id) } else { c.name.clone() }).collect::<Vec<_>>().join(", ")
}

fn case_name(c: &SanityCase) -> String {
    if c.name.is_empty() {
        format!("#{}", c.id)
    } else {
        c.name.clone()
    }
}

// ---------------------------------------------------------------------------
// 1. Equilibrium per case
// ---------------------------------------------------------------------------

/// Σ reactions as a force and a moment about the global origin.
pub fn reaction_resultant(c: &SanityCase, nodes: &HashMap<usize, [f64; 3]>) -> [f64; 6] {
    let mut s = [0.0; 6];
    for rv in &c.reactions {
        let f = [rv.v[0], rv.v[1], rv.v[2]];
        let p = nodes.get(&rv.node_id).copied().unwrap_or([0.0; 3]);
        let m = cross(p, f);
        for k in 0..3 {
            s[k] += f[k];
            s[3 + k] += m[k] + rv.v[3 + k];
        }
    }
    s
}

const COMPONENTS: [&str; 6] = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"];

fn equilibrium(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if !input.solved {
        r.skipped(CheckId::Equilibrium, SkipReason::NotSolved, "the model has not been solved", Params::new());
        return;
    }
    let solved: Vec<&SanityCase> = input.cases.iter().filter(|c| c.solved).collect();
    if solved.is_empty() {
        r.skipped(CheckId::Equilibrium, SkipReason::NoCases, "no load case has results", Params::new());
        return;
    }
    let tol = input.options.equilibrium_tol;
    let mut unchecked: Vec<(&SanityCase, String)> = vec![];
    let mut checked = 0;
    for c in &solved {
        if let Some(why) = &c.not_checkable {
            unchecked.push((c, why.clone()));
            continue;
        }
        if !c.uncovered.is_empty() {
            unchecked.push((c, c.uncovered.join(", ")));
            continue;
        }
        let Some(applied) = c.applied else {
            unchecked.push((c, String::new()));
            continue;
        };
        checked += 1;
        let react = reaction_resultant(c, &g.nodes);
        let fs = (0..3).map(|k| applied[k].abs().max(react[k].abs())).fold(0.0, f64::max);
        let ms = (3..6).map(|k| applied[k].abs().max(react[k].abs())).fold(fs * g.extent, f64::max);
        let mut worst: Option<(usize, f64, f64)> = None; // component, residual, relative
        let comps = if c.moments_close { 6 } else { 3 };
        for k in 0..comps {
            let scale = if k < 3 { fs } else { ms };
            let res = applied[k] + react[k];
            let allowed = tol * scale + if k < 3 { 1e-3 } else { 1e-3 * g.extent.max(1.0) };
            if res.abs() > allowed {
                let rel = res.abs() / scale.max(1e-12);
                if worst.map_or(true, |w| rel > w.2) {
                    worst = Some((k, res, rel));
                }
            }
        }
        if let Some((k, res, rel)) = worst {
            let name = case_name(c);
            let msg = format!(
                "Case '{}': Σ{} applied = {} but Σ reactions = {}; the difference is {} ({} % of the case's largest {}).",
                name,
                COMPONENTS[k],
                fmt(applied[k]),
                fmt(react[k]),
                fmt(res),
                fmt(rel * 100.0),
                if k < 3 { "force" } else { "moment" }
            );
            r.push(
                finding(SanityCode::EquilibriumViolation, CheckId::Equilibrium, Severity::Error, msg)
                    .with("case", name)
                    .with("component", COMPONENTS[k])
                    .with("applied", applied[k])
                    .with("reactions", react[k])
                    .with("residual", res)
                    .with("percent", rel * 100.0)
                    .case(c.id),
            );
        }
    }
    let list = |v: &[(&SanityCase, String)]| {
        v.iter()
            .map(|(c, why)| if why.is_empty() { case_name(c) } else { format!("{} ({})", case_name(c), why) })
            .collect::<Vec<_>>()
            .join(", ")
    };
    if checked == 0 {
        r.skipped(
            CheckId::Equilibrium,
            SkipReason::NoAppliedSide,
            format!("no solved case could be summed independently: {}", list(&unchecked)),
            params(&[("cases", list(&unchecked).into())]),
        );
    } else if !unchecked.is_empty() {
        let reasons = list(&unchecked);
        r.partial(
            CheckId::Equilibrium,
            SkipReason::SomeCasesUnchecked,
            format!("not checked: {}", reasons),
            params(&[("cases", reasons.into())]),
        );
    } else {
        r.ran(CheckId::Equilibrium);
    }
}

// ---------------------------------------------------------------------------
// Gravity loads that point up
// ---------------------------------------------------------------------------

fn gravity_direction(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    let gravity: Vec<&SanityCase> = input.cases.iter().filter(|c| c.kind.is_gravity() && c.summed().is_some()).collect();
    if gravity.is_empty() {
        r.skipped(CheckId::GravityDirection, SkipReason::NoGravityCase, "no dead or live load case with loads that could be summed", Params::new());
        return;
    }
    for c in gravity {
        let a = c.summed().unwrap();
        let v = a[g.up];
        let total = norm([a[0], a[1], a[2]]);
        if v > 1e-6 && v > 0.01 * total {
            let msg = format!(
                "Case '{}' is a {} case, but its loads add up to {} kN upward (of {} kN in all).",
                case_name(c),
                if c.kind == CaseKind::Dead { "dead-load" } else { "live-load" },
                fmt(v),
                fmt(total)
            );
            r.push(
                finding(SanityCode::GravityUpward, CheckId::GravityDirection, Severity::Error, msg)
                    .with("case", case_name(c))
                    .with("kind", if c.kind == CaseKind::Dead { "dead" } else { "live" })
                    .with("up", v)
                    .with("total", total)
                    .case(c.id),
            );
        }
        let horizontal = (a[g.plan[0]].powi(2) + a[g.plan[1]].powi(2)).sqrt();
        if horizontal > 1.0 && horizontal > 0.1 * v.abs() {
            let msg = format!(
                "Case '{}' is a {} case, but its loads add up to {} kN horizontally against {} kN vertically.",
                case_name(c),
                if c.kind == CaseKind::Dead { "dead-load" } else { "live-load" },
                fmt(horizontal),
                fmt(v.abs())
            );
            r.push(
                finding(SanityCode::GravityCaseHorizontal, CheckId::GravityDirection, Severity::Warning, msg)
                    .with("case", case_name(c))
                    .with("kind", if c.kind == CaseKind::Dead { "dead" } else { "live" })
                    .with("horizontal", horizontal)
                    .with("vertical", v.abs())
                    .case(c.id),
            );
        }
    }
    r.ran(CheckId::GravityDirection);
}

// ---------------------------------------------------------------------------
// Self-weight left out
// ---------------------------------------------------------------------------

/// The structure's own weight, kN: ρ·A·L over members and ρ·t·area over shells.
pub fn structure_weight(input: &SanityInput, g: &ModelGeometry) -> f64 {
    let mut w = 0.0;
    let defs: HashMap<usize, &super::SanityMember> = input.members.iter().map(|m| (m.id, m)).collect();
    for mg in &g.members {
        let Some(m) = defs.get(&mg.id) else { continue };
        let (Some(mat), Some(sec)) = (g.materials.get(&m.material_id), g.sections.get(&m.section_id)) else { continue };
        let rho = mat.rho.unwrap_or(0.0);
        if rho > 0.0 && sec.a > 0.0 {
            w += rho * sec.a * mg.length;
        }
    }
    for s in &input.shells {
        let Some(mat) = g.materials.get(&s.material_id) else { continue };
        let rho = mat.rho.unwrap_or(0.0);
        let pts: Vec<[f64; 3]> = s.nodes.iter().filter_map(|n| g.nodes.get(n).copied()).collect();
        if rho > 0.0 && s.thickness > 0.0 && pts.len() >= 3 {
            w += rho * s.thickness * polygon_area(&pts);
        }
    }
    w
}

fn self_weight(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if input.cases.is_empty() {
        r.skipped(CheckId::SelfWeight, SkipReason::NoCases, "the model has no load cases", Params::new());
        return;
    }
    let w = structure_weight(input, g);
    if !(w > 0.0) || input.cases.iter().any(|c| c.self_weight) {
        r.ran(CheckId::SelfWeight);
        return;
    }
    let dead: Vec<&SanityCase> = input.cases.iter().filter(|c| c.kind == CaseKind::Dead).collect();
    if dead.is_empty() && !g.building {
        // A model with no permanent load case at all (a teaching example with one load) does not
        // claim to carry its weight; a building does.
        r.ran(CheckId::SelfWeight);
        return;
    }
    if dead.iter().any(|c| c.summed().is_none()) {
        r.skipped(
            CheckId::SelfWeight,
            SkipReason::NoAppliedSide,
            format!("the dead-load cases could not be summed ({})", names(&dead)),
            params(&[("cases", names(&dead).into())]),
        );
        return;
    }
    let carried: f64 = dead.iter().map(|c| -c.summed().unwrap()[g.up]).sum();
    if carried < 0.9 * w {
        let msg = format!(
            "The structure weighs {} kN (ρ·A·L of its members and ρ·t·area of its shells), but no load case includes self-weight and the dead-load cases carry {} kN downward in all.",
            fmt(w),
            fmt(carried.max(0.0))
        );
        r.push(
            finding(SanityCode::SelfWeightMissing, CheckId::SelfWeight, Severity::Warning, msg)
                .with("weight", w)
                .with("dead", carried.max(0.0))
                .with("cases", names(&dead)),
        );
    }
    r.ran(CheckId::SelfWeight);
}

// ---------------------------------------------------------------------------
// 2. Gravity weight per floor area
// ---------------------------------------------------------------------------

fn weight_per_area(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if !g.building {
        let reason = if input.planar { SkipReason::PlaneModel } else { SkipReason::NotABuilding };
        r.skipped(CheckId::GravityWeight, reason, g.not_building_reason.clone(), params(&[("why", g.not_building_reason.clone().into())]));
        return;
    }
    let gravity: Vec<&SanityCase> = input.cases.iter().filter(|c| c.kind.is_gravity()).collect();
    if gravity.is_empty() {
        r.skipped(CheckId::GravityWeight, SkipReason::NoGravityCase, "the model has no dead or live load case", Params::new());
        return;
    }
    if gravity.iter().any(|c| c.summed().is_none()) {
        r.skipped(
            CheckId::GravityWeight,
            SkipReason::NoAppliedSide,
            format!("the gravity cases could not be summed ({})", names(&gravity)),
            params(&[("cases", names(&gravity).into())]),
        );
        return;
    }
    let w: f64 = gravity.iter().map(|c| -c.summed().unwrap()[g.up]).sum();
    let floors: Vec<_> = g.floors().collect();
    let area: f64 = floors.iter().map(|l| l.area).sum();
    let q = w / area;
    let [lo, hi] = input.options.weight_band;
    if q < lo || q > hi {
        let code = if q < lo { SanityCode::WeightPerAreaLow } else { SanityCode::WeightPerAreaHigh };
        let msg = format!(
            "The gravity cases ({}) weigh {} kN over {} floor(s) of {} m² in all: {} kN/m², outside the {}–{} kN/m² buildings weigh.",
            names(&gravity),
            fmt(w),
            floors.len(),
            fmt(area),
            fmt(q),
            fmt(lo),
            fmt(hi)
        );
        r.push(
            finding(code, CheckId::GravityWeight, Severity::Warning, msg)
                .with("cases", names(&gravity))
                .with("weight", w)
                .with("floors", floors.len())
                .with("area", area)
                .with("q", q)
                .with("lo", lo)
                .with("hi", hi),
        );
    }
    r.ran(CheckId::GravityWeight);
}

// ---------------------------------------------------------------------------
// 3. Fundamental period against Ta = Cr·H^x
// ---------------------------------------------------------------------------

/// The structural type the period formula takes, read from the model: braced or walled →
/// "other"; columns all steel or all concrete by their modulus → that moment frame.
pub fn infer_period_system(input: &SanityInput, g: &ModelGeometry) -> PeriodSystem {
    if let Some(s) = input.options.period_system {
        return s;
    }
    let braced = g.members.iter().any(|m| m.orientation == Orientation::Diagonal);
    let walls = has_walls(input, g);
    if braced || walls {
        return PeriodSystem::Other;
    }
    let defs: HashMap<usize, &super::SanityMember> = input.members.iter().map(|m| (m.id, m)).collect();
    let mut steel = 0;
    let mut concrete = 0;
    let mut other = 0;
    for mg in g.members.iter().filter(|m| m.orientation == Orientation::Vertical) {
        let e = defs.get(&mg.id).and_then(|m| g.materials.get(&m.material_id)).map_or(0.0, |m| m.e);
        if (180_000.0..=220_000.0).contains(&e) {
            steel += 1;
        } else if (10_000.0..=55_000.0).contains(&e) {
            concrete += 1;
        } else {
            other += 1;
        }
    }
    if other == 0 && concrete == 0 && steel > 0 {
        PeriodSystem::SteelMomentFrame
    } else if other == 0 && steel == 0 && concrete > 0 {
        PeriodSystem::ConcreteMomentFrame
    } else {
        PeriodSystem::Other
    }
}

/// Vertical shells: walls, which take gravity and lateral load past the columns.
fn has_walls(input: &SanityInput, g: &ModelGeometry) -> bool {
    input.shells.iter().any(|s| {
        let pts: Vec<[f64; 3]> = s.nodes.iter().filter_map(|n| g.nodes.get(n).copied()).collect();
        if pts.len() < 3 {
            return false;
        }
        let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
        let l = norm(n);
        l > 0.0 && (n[g.up] / l).abs() < 0.5
    })
}

fn period(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if !g.building {
        let reason = if input.planar { SkipReason::PlaneModel } else { SkipReason::NotABuilding };
        r.skipped(CheckId::Period, reason, g.not_building_reason.clone(), params(&[("why", g.not_building_reason.clone().into())]));
        return;
    }
    let Some(modal) = input.modal.as_ref().filter(|m| !m.modes.is_empty()) else {
        r.skipped(CheckId::Period, SkipReason::NoModal, "no modal analysis has been run", Params::new());
        return;
    };
    // The fundamental translational mode: the one with the most mass in a plan direction; the
    // longest period when the masses are not known.
    let with_mass = modal.modes.iter().filter(|m| m.mass_x.max(m.mass_y) > 0.0).max_by(|a, b| {
        a.mass_x.max(a.mass_y).partial_cmp(&b.mass_x.max(b.mass_y)).unwrap()
    });
    let mode = with_mass.unwrap_or_else(|| modal.modes.iter().max_by(|a, b| a.period.partial_cmp(&b.period).unwrap()).unwrap());
    let t1 = mode.period;
    let h = g.height();
    let system = infer_period_system(input, g);
    let (cr, x) = system.coefficients();
    let ta = cr * h.powf(x);
    let ratio = t1 / ta;
    let [lo, hi] = input.options.period_band;
    if !(ratio >= lo && ratio <= hi) {
        let msg = format!(
            "The fundamental period is {} s; the code's empirical Ta = {}·H^{} for a {} {} m tall is {} s ({}× that).",
            fmt(t1),
            fmt(cr),
            fmt(x),
            system.name(),
            fmt(h),
            fmt(ta),
            fmt(ratio)
        );
        r.push(
            finding(SanityCode::PeriodOutOfRange, CheckId::Period, Severity::Warning, msg)
                .with("t1", t1)
                .with("ta", ta)
                .with("ratio", ratio)
                .with("height", h)
                .with("system", system.key())
                .with("cr", cr)
                .with("x", x)
                .with("lo", lo)
                .with("hi", hi),
        );
    }
    r.ran(CheckId::Period);
}

// ---------------------------------------------------------------------------
// 4. Tributary-area column loads against FE axial forces
// ---------------------------------------------------------------------------

/// Group coordinates into lines, within `tol`.
fn gridlines(mut v: Vec<f64>, tol: f64) -> Vec<f64> {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut out: Vec<Vec<f64>> = vec![];
    for x in v {
        match out.last_mut() {
            Some(gr) if x - *gr.last().unwrap() <= tol => gr.push(x),
            _ => out.push(vec![x]),
        }
    }
    out.into_iter().map(|gr| gr.iter().sum::<f64>() / gr.len() as f64).collect()
}

fn nearest(lines: &[f64], v: f64) -> usize {
    let mut best = 0;
    for (k, l) in lines.iter().enumerate() {
        if (l - v).abs() < (lines[best] - v).abs() {
            best = k;
        }
    }
    best
}

/// The frame as a grid of column lines, storey by storey. `Err` says why the method does not
/// apply.
struct Grid {
    xs: Vec<f64>,
    ys: Vec<f64>,
    /// Level elevations, base first.
    levels: Vec<f64>,
    /// (storey from 1, ix, iy) → the column members there.
    columns: BTreeMap<(usize, usize, usize), Vec<usize>>,
}

fn regular_grid(input: &SanityInput, g: &ModelGeometry) -> Result<Grid, (SkipReason, String)> {
    if !g.building {
        let reason = if input.planar { SkipReason::PlaneModel } else { SkipReason::NotABuilding };
        return Err((reason, g.not_building_reason.clone()));
    }
    let diagonals = g.members.iter().filter(|m| m.orientation == Orientation::Diagonal).count();
    if diagonals > 0 {
        return Err((SkipReason::DiagonalMembers, format!("{} diagonal member(s) share the gravity load with the columns", diagonals)));
    }
    if has_walls(input, g) {
        return Err((SkipReason::Walls, "walls share the gravity load with the columns".into()));
    }
    let tol = (1e-3 * g.extent).max(0.05);
    let cols: Vec<&super::geometry::MemberGeom> = g.members.iter().filter(|m| m.orientation == Orientation::Vertical).collect();
    let plan = |m: &super::geometry::MemberGeom| g.plan_of(m.pi);
    let xs = gridlines(cols.iter().map(|m| plan(m)[0]).collect(), tol);
    let ys = gridlines(cols.iter().map(|m| plan(m)[1]).collect(), tol);
    let mut levels = vec![g.base];
    levels.extend(g.levels.iter().map(|l| l.z));
    let mut columns: BTreeMap<(usize, usize, usize), Vec<usize>> = BTreeMap::new();
    for m in &cols {
        let p = plan(m);
        let mid = (g.elevation(m.pi) + g.elevation(m.pj)) / 2.0;
        let Some(s) = (1..levels.len()).find(|&s| mid > levels[s - 1] && mid < levels[s]) else {
            return Err((SkipReason::IrregularGrid, format!("column {} is not between two floor levels", m.id)));
        };
        columns.entry((s, nearest(&xs, p[0]), nearest(&ys, p[1]))).or_default().push(m.id);
    }
    let storeys = levels.len() - 1;
    let positions: BTreeSet<(usize, usize)> = columns.keys().map(|&(_, i, j)| (i, j)).collect();
    if positions.len() != xs.len() * ys.len() {
        return Err((
            SkipReason::IrregularGrid,
            format!("columns stand at {} of the {}×{} grid intersections", positions.len(), xs.len(), ys.len()),
        ));
    }
    for s in 1..=storeys {
        for &(i, j) in &positions {
            if !columns.contains_key(&(s, i, j)) {
                return Err((SkipReason::IrregularGrid, format!("the column grid changes from storey to storey (storey {})", s)));
            }
        }
    }
    Ok(Grid { xs, ys, levels, columns })
}

fn tributary(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if !input.solved {
        r.skipped(CheckId::Tributary, SkipReason::NotSolved, "the model has not been solved", Params::new());
        return;
    }
    let grid = match regular_grid(input, g) {
        Ok(grid) => grid,
        Err((reason, why)) => {
            r.skipped(CheckId::Tributary, reason, why.clone(), params(&[("why", why.into())]));
            return;
        }
    };
    let cases: Vec<&SanityCase> = input.cases.iter().filter(|c| c.kind.is_gravity() && c.solved && c.not_checkable.is_none()).collect();
    if cases.is_empty() {
        r.skipped(CheckId::Tributary, SkipReason::NoGravityCase, "no solved dead or live load case", Params::new());
        return;
    }
    let usable: Vec<&&SanityCase> = cases.iter().filter(|c| !c.load_points.is_empty() && !c.member_axial.is_empty()).collect();
    if usable.is_empty() {
        r.skipped(CheckId::Tributary, SkipReason::NoLoadPoints, "the gravity cases carry no loads at known points, or no column forces", Params::new());
        return;
    }
    let storeys = grid.levels.len() - 1;
    let (nx, ny) = (grid.xs.len(), grid.ys.len());
    let lengths: HashMap<usize, f64> = g.members.iter().map(|m| (m.id, m.length)).collect();
    let [lo, hi] = input.options.tributary_band;
    for c in usable {
        // Load at each level (1..=storeys), in each cell.
        let mut at = vec![vec![0.0f64; nx * ny]; storeys + 1];
        for lp in &c.load_points {
            let w = -lp.f[g.up];
            if w == 0.0 {
                continue;
            }
            let z = lp.p[g.up];
            if z < (grid.levels[0] + grid.levels[1]) / 2.0 {
                continue; // goes straight into the supports
            }
            let k = (1..=storeys).min_by(|&a, &b| (grid.levels[a] - z).abs().partial_cmp(&(grid.levels[b] - z).abs()).unwrap()).unwrap();
            let p = g.plan_of(lp.p);
            at[k][nearest(&grid.xs, p[0]) * ny + nearest(&grid.ys, p[1])] += w;
        }
        let axial: HashMap<usize, f64> = c.member_axial.iter().map(|a| (a.id, -(a.n_start + a.n_end) / 2.0)).collect();
        let mut worst: Option<(f64, usize, usize, usize, f64, f64)> = None; // |log ratio|, storey, i, j, fe, trib
        let mut flagged: BTreeSet<usize> = BTreeSet::new();
        let mut storey_worst: Option<(f64, usize, f64, f64)> = None;
        for s in 1..=storeys {
            let mut sum_fe = 0.0;
            let mut sum_tr = 0.0;
            let cell_loads: Vec<f64> = (0..nx * ny).map(|cell| (s..=storeys).map(|k| at[k][cell]).sum()).collect();
            let storey_total: f64 = cell_loads.iter().sum();
            for i in 0..nx {
                for j in 0..ny {
                    let ids = &grid.columns[&(s, i, j)];
                    let (mut num, mut den) = (0.0, 0.0);
                    for id in ids {
                        if let (Some(n), Some(l)) = (axial.get(id), lengths.get(id)) {
                            num += n * l;
                            den += l;
                        }
                    }
                    if den == 0.0 {
                        continue;
                    }
                    let fe = num / den;
                    let tr = cell_loads[i * ny + j];
                    sum_fe += fe;
                    sum_tr += tr;
                    // Columns carrying a few percent of the storey are noise for this method.
                    if storey_total <= 0.0 || tr.abs().max(fe.abs()) < 0.02 * storey_total {
                        continue;
                    }
                    let ratio = if tr > 0.0 { fe / tr } else { f64::INFINITY };
                    if !(ratio >= lo && ratio <= hi) {
                        flagged.extend(ids.iter().copied());
                        let score = if ratio > 0.0 && ratio.is_finite() { ratio.ln().abs() } else { f64::INFINITY };
                        if worst.map_or(true, |w| score > w.0) {
                            worst = Some((score, s, i, j, fe, tr));
                        }
                    }
                }
            }
            if sum_tr > 0.0 {
                let ratio = sum_fe / sum_tr;
                if !(0.85..=1.15).contains(&ratio) {
                    let score = (ratio - 1.0).abs();
                    if storey_worst.map_or(true, |w| score > w.0) {
                        storey_worst = Some((score, s, sum_fe, sum_tr));
                    }
                }
            }
        }
        let name = case_name(c);
        if let Some((_, s, i, j, fe, tr)) = worst {
            let ids = grid.columns[&(s, i, j)].clone();
            let msg = format!(
                "Case '{}': {} column(s) carry less than {}× or more than {}× their tributary-area load. Worst: column {} in storey {} carries {} kN; its tributary area takes {} kN.",
                name,
                flagged.len(),
                fmt(lo),
                fmt(hi),
                ids[0],
                s,
                fmt(fe),
                fmt(tr)
            );
            r.push(
                finding(SanityCode::TributaryMismatch, CheckId::Tributary, Severity::Warning, msg)
                    .with("case", name.clone())
                    .with("count", flagged.len())
                    .with("column", ids[0])
                    .with("storey", s)
                    .with("fe", fe)
                    .with("tributary", tr)
                    .with("lo", lo)
                    .with("hi", hi)
                    .elements(flagged.into_iter().collect())
                    .case(c.id),
            );
        }
        if let Some((_, s, fe, tr)) = storey_worst {
            let ids: Vec<usize> = grid.columns.iter().filter(|(k, _)| k.0 == s).flat_map(|(_, v)| v.iter().copied()).collect();
            let msg = format!(
                "Case '{}': the columns of storey {} carry {} kN in all, but {} kN of load stands above them.",
                name,
                s,
                fmt(fe),
                fmt(tr)
            );
            r.push(
                finding(SanityCode::StoreyLoadMismatch, CheckId::Tributary, Severity::Warning, msg)
                    .with("case", name)
                    .with("storey", s)
                    .with("fe", fe)
                    .with("load", tr)
                    .elements(ids)
                    .case(c.id),
            );
        }
    }
    r.ran(CheckId::Tributary);
}

// ---------------------------------------------------------------------------
// Displacements absurd for the span
// ---------------------------------------------------------------------------

fn deflection(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if !input.solved {
        r.skipped(CheckId::Deflection, SkipReason::NotSolved, "the model has not been solved", Params::new());
        return;
    }
    let cases: Vec<&SanityCase> = input.cases.iter().filter(|c| c.solved && c.not_checkable.is_none() && !c.displacements.is_empty()).collect();
    if cases.is_empty() {
        r.skipped(CheckId::Deflection, SkipReason::NoCases, "no solved load case has displacements", Params::new());
        return;
    }
    let n = input.options.deflection_ratio;
    for c in cases {
        let u: HashMap<usize, [f64; 3]> = c.displacements.iter().map(|d| (d.node_id, [d.v[0], d.v[1], d.v[2]])).collect();
        let name = case_name(c);
        // The whole structure.
        let worst_node = c
            .displacements
            .iter()
            .map(|d| (d.node_id, norm([d.v[0], d.v[1], d.v[2]])))
            .filter(|(_, v)| v.is_finite())
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let mut global = false;
        if let Some((node, umax)) = worst_node {
            if g.extent > 0.0 && umax > g.extent / n {
                global = true;
                let msg = format!(
                    "Case '{}': node {} moves {} m, more than 1/{} of the structure's {} m size.",
                    name,
                    node,
                    fmt(umax),
                    fmt(n),
                    fmt(g.extent)
                );
                r.push(
                    finding(SanityCode::DisplacementAbsurd, CheckId::Deflection, Severity::Error, msg)
                        .with("case", name.clone())
                        .with("node", node)
                        .with("u", umax)
                        .with("size", g.extent)
                        .with("ratio", n)
                        .nodes(vec![node])
                        .case(c.id),
                );
            }
        }
        // Each member: the sideways movement of one end relative to the other.
        let mut hits: Vec<(usize, f64, f64)> = vec![];
        for m in &g.members {
            let (Some(ui), Some(uj)) = (u.get(&m.i), u.get(&m.j)) else { continue };
            let du = sub(*uj, *ui);
            let t = dot(du, m.dir);
            let side = norm([du[0] - t * m.dir[0], du[1] - t * m.dir[1], du[2] - t * m.dir[2]]);
            if side > m.length / n {
                hits.push((m.id, side, m.length));
            }
        }
        if !hits.is_empty() && !global {
            let w = hits.iter().max_by(|a, b| (a.1 / a.2).partial_cmp(&(b.1 / b.2)).unwrap()).unwrap();
            let msg = format!(
                "Case '{}': {} member(s) have one end displaced sideways relative to the other by more than L/{}. Worst: member {}, {} m over L = {} m (L/{}).",
                name,
                hits.len(),
                fmt(n),
                w.0,
                fmt(w.1),
                fmt(w.2),
                fmt(w.2 / w.1)
            );
            r.push(
                finding(SanityCode::DeflectionLarge, CheckId::Deflection, Severity::Warning, msg)
                    .with("case", name)
                    .with("count", hits.len())
                    .with("member", w.0)
                    .with("delta", w.1)
                    .with("length", w.2)
                    .with("ratio", n)
                    .with("span", w.2 / w.1)
                    .elements(hits.iter().map(|h| h.0).collect())
                    .case(c.id),
            );
        }
    }
    r.ran(CheckId::Deflection);
}
