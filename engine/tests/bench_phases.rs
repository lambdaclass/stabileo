//! One-shot phase breakdown: prints SolveTimings for various MITC4 plate sizes.
//! Run with: cargo test --release --test bench_phases -- --nocapture

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn make_flat_plate(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: n,
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    // Pin one corner fully
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: eid, pressure: -1.0 }))
        .collect();

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

#[test]
fn phase_breakdown_mitc4() {
    println!("\n=== MITC4 Plate Phase Breakdown (release build) ===\n");
    println!(
        "{:>10} {:>6} {:>6} {:>9} {:>9} {:>9} {:>7} {:>7} {:>10} {:>7} {:>8} {:>9} {:>6} {:>8} {:>8}",
        "mesh", "nodes", "elems", "asm(us)", "sym(us)", "num(us)", "slv",
        "res", "fallback", "rxn", "stress", "total(us)", "nf", "nnz_kff", "nnz_L"
    );
    println!("{}", "-".repeat(150));

    for &(nx, ny) in &[(10, 10), (20, 20), (30, 30), (50, 50)] {
        let input = make_flat_plate(nx, ny);
        let n_nodes = (nx + 1) * (ny + 1);
        let n_elems = nx * ny;
        let result = linear::solve_3d(&input).unwrap();

        let label = format!("{}x{}", nx, ny);
        if let Some(t) = &result.timings {
            println!(
                "{:>10} {:>6} {:>6} {:>9} {:>9} {:>9} {:>7} {:>7} {:>10} {:>7} {:>8} {:>9} {:>6} {:>8} {:>8}",
                label, n_nodes, n_elems,
                t.assembly_us, t.symbolic_us, t.numeric_us,
                t.solve_us, t.residual_us, t.dense_fallback_us,
                t.reactions_us, t.stress_recovery_us,
                t.total_us, t.n_free, t.nnz_kff, t.nnz_l,
            );
        } else {
            println!("{:>10} {:>6} {:>6} (dense fallback)", label, n_nodes, n_elems);
        }
    }
}
