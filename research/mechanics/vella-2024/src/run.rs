//! What the page shows for one setting: the run's frames and trace, its outcome, the critical
//! points of the start's branch and the critical (antisymmetric) mode at µ_A.
use crate::dynamics::{simulate, Frame, Outcome, Settings, Trace};
use crate::model::{Assembler, DOFS};
use crate::spectrum::antisymmetric_mode;
use crate::statics::{Critical, Equilibrium};
use crate::study::prepare;
use crate::units::SIMULATIONS;
use serde::Serialize;
use std::cell::RefCell;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    /// Node positions of the equilibrium at µ_A and its lowest antisymmetric mode, scaled to a
    /// largest displacement of 0.05 L.
    pub x: Vec<f64>,
    pub z: Vec<f64>,
    pub dx: Vec<f64>,
    pub dz: Vec<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub settings: Settings,
    pub critical: Critical,
    pub frames: Vec<Frame>,
    pub trace: Trace,
    pub outcome: Outcome,
    pub mode: Mode,
    /// |ΔL̇| (m/s) for the paper's simulated strip at this µ̇.
    pub rate_m_s: f64,
}

type Key = (u64, u64, usize, u64);

thread_local! {
    static PREPARED: RefCell<Option<(Key, Equilibrium, Critical)>> = const { RefCell::new(None) };
}

fn round(v: f64) -> f64 {
    (v * 1e7).round() / 1e7
}

pub fn page(settings: &Settings, cancel: &mut dyn FnMut(f64) -> bool) -> Result<Page, String> {
    settings.validate()?;
    let strip = settings.strip();
    let key = (settings.alpha.to_bits(), settings.slenderness.to_bits(), settings.n, settings.start.to_bits());
    let cached = PREPARED.with(|c| c.borrow().as_ref().filter(|(k, _, _)| *k == key).map(|(_, e, c)| (e.clone(), c.clone())));
    let (start, critical) = match cached {
        Some(p) => p,
        None => {
            let p = prepare(&strip, settings.start)?;
            PREPARED.with(|c| *c.borrow_mut() = Some((key, p.0.clone(), p.1.clone())));
            p
        }
    };
    let sim = simulate(settings, &start, critical.mu_star, critical.mu_a, cancel)?;
    let (shape, _) = antisymmetric_mode(&strip, &mut Assembler::new(&strip), &critical.state_a);
    let n = strip.n;
    let largest = (0..=n).map(|i| shape[DOFS * i].hypot(shape[DOFS * i + 1])).fold(0.0, f64::max);
    let scale = 0.05 / largest;
    let q = &critical.state_a;
    let mode = Mode {
        x: (0..=n).map(|i| round(i as f64 / n as f64 + q[DOFS * i])).collect(),
        z: (0..=n).map(|i| round(q[DOFS * i + 1])).collect(),
        dx: (0..=n).map(|i| round(scale * shape[DOFS * i])).collect(),
        dz: (0..=n).map(|i| round(scale * shape[DOFS * i + 1])).collect(),
    };
    let frames = sim
        .frames
        .into_iter()
        .map(|f| Frame { x: f.x.iter().map(|&v| round(v)).collect(), z: f.z.iter().map(|&v| round(v)).collect(), ..f })
        .collect();
    Ok(Page {
        settings: *settings,
        rate_m_s: settings.rate / SIMULATIONS.rate_factor(settings.alpha),
        critical,
        frames,
        trace: sim.trace,
        outcome: sim.outcome,
        mode,
    })
}
