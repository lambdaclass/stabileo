//! Worked examples that back the figures and tables of published papers.
//!
//! ─────────────────────────────────────────────────────────────────────────────
//! A3 · JAIE 2026, §6.3 — column removal in a reinforced-concrete frame
//! ─────────────────────────────────────────────────────────────────────────────
//!
//! THIS IS A RECONSTRUCTION, NOT A TRANSCRIPTION. Read this before trusting any
//! number below as if the paper had printed it.
//!
//! What comes FROM the paper — these are the constraints the reconstruction had
//! to satisfy, and the reason to believe the model is the right one:
//!
//!   * topology: 4 bays × 3 storeys, 20 nodes, 27 elements (15 columns + 12
//!     beams), 5 fixed supports, 45 active degrees of freedom;
//!   * total vertical reaction of the intact frame: ΣRz = 1500 kN;
//!   * the damaged state removes the interior ground-floor column, leaving 26
//!     elements, and the beams of the affected column line stop verifying.
//!
//! What we CHOSE, because the paper does not publish it — spans, storey
//! heights, sections, material, load and reinforcement. Every one of these is a
//! project decision of ours and none of them can be attributed to the authors:
//!
//!   * span L = 6.00 m, storey height H = 3.00 m;
//!   * distributed load w = 20.8333 kN/m per beam. This is NOT a free choice:
//!     it is solved from the paper's own ΣRz, as 1500 / (6.00 m × 4 bays × 3
//!     levels). It is the one chosen value the paper pins down for us;
//!   * beams 30 × 50 cm, columns 40 × 40 cm, H-30 concrete (E = 32 000 MPa);
//!   * self-weight excluded, so ΣRz is the applied load clean. With self-weight
//!     on, removing a column also removes its own weight and ΣRz legitimately
//!     drops — which is not an equilibrium violation but does destroy the
//!     paper's round 1500 kN.
//!
//! Reinforcement (5 Ø16 per face, kept FIXED across both states) lives in the
//! CIRSOC 201 layer, not in the solver, so it is not asserted here. It is
//! recorded in the case write-up: it puts the intact frame at D/C = 0.456 and
//! is what makes the damaged state fail rather than being re-designed to pass.
//!
//! Element numbering is an artefact of construction order and is asserted so it
//! cannot drift: columns 1–15 (interior ground-floor column = 3), beams 16–27.
//! Beam 21 governs the damaged state, which is the beam the paper singles out.

#[path = "common/mod.rs"]
mod common;

use common::make_3d_input;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::{SolverDistributedLoad3D, SolverInput3D, SolverLoad3D};

const L: f64 = 6.0; // span [m]
const H: f64 = 3.0; // storey height [m]
const W: f64 = 20.8333; // distributed load per beam [kN/m]

const N_BAYS: usize = 4;
const N_LEVELS: usize = 3;
const N_LINES: usize = N_BAYS + 1; // 5 column lines

/// Interior ground-floor column — the element the paper removes.
const INTERIOR_GROUND_COLUMN: usize = 3;
/// The beam the paper singles out in the damaged state.
const GOVERNING_BEAM: usize = 21;
/// Beams of the affected column line: the two bays either side of line 2,
/// across all three levels.
const AFFECTED_BEAMS: [usize; 6] = [17, 18, 21, 22, 25, 26];

/// Node id for a given level (0 = foundation) and column line.
fn node_id(level: usize, line: usize) -> usize {
    level * N_LINES + line + 1
}

/// Build the §6.3 frame.
///
/// Sections carry the strong axis in `Iy`, because a horizontal member loaded
/// along local z bends about local y — the `My`/`Vz` pair the CIRSOC 201 layer
/// then checks as a 30-wide × 50-deep beam. Swapping them silently turns every
/// beam onto its weak axis while every reported b/h stays reassuringly correct.
fn build_frame() -> SolverInput3D {
    let rect = |b: f64, h: f64| (b * h, b * h * h * h / 12.0, h * b * b * b / 12.0, b * h * h * h / 3.0);
    let (a_beam, iy_beam, iz_beam, j_beam) = rect(0.30, 0.50);
    let (a_col, iy_col, iz_col, j_col) = rect(0.40, 0.40);

    // 20 nodes: 5 column lines × 4 levels (z = 0, H, 2H, 3H).
    let mut nodes = Vec::new();
    for level in 0..=N_LEVELS {
        for line in 0..N_LINES {
            nodes.push((node_id(level, line), line as f64 * L, 0.0, level as f64 * H));
        }
    }

    // 15 columns, then 12 beams — this order is what fixes the ids.
    let mut elements = Vec::new();
    let mut id = 1;
    for level in 0..N_LEVELS {
        for line in 0..N_LINES {
            elements.push((id, "frame", node_id(level, line), node_id(level + 1, line), 1, 2));
            id += 1;
        }
    }
    let mut beams = Vec::new();
    for level in 1..=N_LEVELS {
        for bay in 0..N_BAYS {
            elements.push((id, "frame", node_id(level, bay), node_id(level, bay + 1), 1, 1));
            beams.push(id);
            id += 1;
        }
    }

    let supports: Vec<_> = (0..N_LINES)
        .map(|line| (node_id(0, line), vec![true; 6]))
        .collect();

    let loads: Vec<_> = beams
        .iter()
        .map(|&element_id| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id,
                q_yi: 0.0,
                q_yj: 0.0,
                q_zi: -W,
                q_zj: -W,
                a: None,
                b: None,
            })
        })
        .collect();

    make_3d_input(
        nodes,
        vec![(1, 32_000.0, 0.2)], // H-30: E = 32 000 MPa
        vec![
            (1, a_beam, iy_beam, iz_beam, j_beam),
            (2, a_col, iy_col, iz_col, j_col),
        ],
        elements,
        supports,
        loads,
    )
}

/// Largest |My| at either end of an element — the hogging demand the design
/// module checks at the support face.
fn peak_my(results: &dedaliano_engine::types::AnalysisResults3D, element_id: usize) -> f64 {
    let f = results
        .element_forces
        .iter()
        .find(|f| f.element_id == element_id)
        .unwrap_or_else(|| panic!("no forces for element {element_id}"));
    f.my_start.abs().max(f.my_end.abs())
}

fn sum_rz(results: &dedaliano_engine::types::AnalysisResults3D) -> f64 {
    results.reactions.iter().map(|r| r.fz).sum()
}

#[test]
fn a3_building_column_removal() {
    // ── intact frame ─────────────────────────────────────────────────────────
    let intact = build_frame();
    assert_eq!(intact.nodes.len(), 20, "the paper's frame has 20 nodes");
    assert_eq!(intact.elements.len(), 27, "15 columns + 12 beams");
    assert_eq!(intact.supports.len(), 5, "one fixed support per column line");

    // Element numbering, pinned so a change in construction order cannot
    // silently repoint every assertion below at a different member.
    assert_eq!(
        intact.elements[&INTERIOR_GROUND_COLUMN.to_string()].node_i,
        node_id(0, 2),
        "element 3 must be the interior ground-floor column"
    );
    for &b in &AFFECTED_BEAMS {
        assert!((16..=27).contains(&b), "beam {b} outside the beam id range");
    }

    let r0 = linear::solve_3d(&intact).expect("intact frame failed to solve");

    // 45 active DOF: 15 free nodes × 3 in-plane DOF. Every result is finite.
    for d in &r0.displacements {
        assert!(
            d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "non-finite displacement at node {}",
            d.node_id
        );
    }

    // The paper's headline number.
    assert!(
        (sum_rz(&r0) - 1500.0).abs() < 0.05,
        "ΣRz must be the paper's 1500 kN, got {:.2}",
        sum_rz(&r0)
    );

    let my_intact = peak_my(&r0, GOVERNING_BEAM);
    assert!(
        (my_intact - 62.90).abs() < 0.5,
        "intact hogging moment on beam {GOVERNING_BEAM} should be ≈62.90 kN·m, got {my_intact:.2}"
    );

    // ── damaged frame: the interior ground-floor column is removed ───────────
    let mut damaged = build_frame();
    damaged
        .elements
        .remove(&INTERIOR_GROUND_COLUMN.to_string())
        .expect("element 3 must exist before it can be removed");
    assert_eq!(damaged.elements.len(), 26, "one column fewer");

    let r1 = linear::solve_3d(&damaged).expect("damaged frame failed to solve");

    // Equilibrium survives EXACTLY, because self-weight is excluded: the frame
    // lost a load path, not a load. With self-weight on, this assertion would
    // legitimately fail by the removed column's own weight.
    assert!(
        (sum_rz(&r1) - 1500.0).abs() < 0.05,
        "ΣRz must be preserved at 1500 kN after removal, got {:.2}",
        sum_rz(&r1)
    );

    let my_damaged = peak_my(&r1, GOVERNING_BEAM);
    assert!(
        (my_damaged - 249.76).abs() < 1.0,
        "damaged hogging moment on beam {GOVERNING_BEAM} should be ≈249.76 kN·m, got {my_damaged:.2}"
    );

    // The demand amplification is the result the case study exists to show.
    // The paper's own published D/C pair implies 1.63 / 0.46 = 3.54; this
    // reconstruction measures 3.97 on the moment itself. The sections were NOT
    // tuned to close that gap — doing so would be fitting the structure to a
    // published number rather than reporting what the model does.
    //
    // NOTE — this band cannot fail on its own. The two assertions above pin
    // 62.90 ± 0.5 and 249.76 ± 1.0, which already bound the quotient to
    // 3.92‥4.02; anything that reached this line has passed 3.5‥4.5 by
    // construction. It is kept because it NAMES the result — a reader looking
    // for what the case study demonstrates finds it here rather than having to
    // divide two hogging moments — but it is a restatement, not a third check,
    // and reading it as independent coverage would overstate what this test
    // holds.
    let amplification = my_damaged / my_intact;
    assert!(
        (3.5..4.5).contains(&amplification),
        "removing an interior column should multiply the beam moment by ~4, got {amplification:.2}"
    );

    // Every beam of the affected line is pushed up; the outer bays much less so.
    for &b in &AFFECTED_BEAMS {
        let growth = peak_my(&r1, b) / peak_my(&r0, b);
        assert!(
            growth > 3.0,
            "beam {b} is on the affected line and should more than triple its moment, got {growth:.2}"
        );
    }
    for b in [16usize, 19, 20, 23, 24, 27] {
        let growth = peak_my(&r1, b) / peak_my(&r0, b);
        assert!(
            growth < 3.0,
            "beam {b} is on an outer bay and should not triple its moment, got {growth:.2}"
        );
    }
}
