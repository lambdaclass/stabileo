//! Extract design-ready demands from beam station results.
//!
//! Bridges the gap between station extraction (solver output) and design
//! checks (steel/RC). The station extraction already computes forces at
//! every station for every combination. This module picks the governing
//! demands per member and packages them in the format each design check expects.

use super::beam_stations::*;
use super::rc_check::RCDesignForces;
use super::steel_check::ElementDesignForces;

/// Strategy for picking the governing demand from station results.
/// Design checks need a single set of forces per member, but the critical
/// combination of N/M/V depends on the check being performed.
#[derive(Debug, Clone, Copy)]
pub enum DemandStrategy {
    /// Use the station/combo that produces the maximum absolute moment.
    /// This is the most common approach for flexure-dominated RC and steel checks.
    MaxAbsMoment,
    /// Use the station/combo that produces the maximum absolute axial force.
    /// Useful for compression-dominated column checks.
    MaxAbsAxial,
    /// Use the station/combo that produces the maximum interaction
    /// (|N/N_ref| + |M/M_ref|). Requires reference capacities.
    /// Falls back to MaxAbsMoment if refs are zero.
    MaxInteraction { n_ref: f64, m_ref: f64 },
}

/// Extract governing steel design demands from 3D grouped station results.
///
/// For each member, scans all stations and combos to find the governing
/// demand set according to the chosen strategy, then packages it as
/// `ElementDesignForces` ready for `check_steel_members()`.
pub fn extract_steel_demands_3d(
    grouped: &GroupedBeamStationResult3D,
    strategy: DemandStrategy,
) -> Vec<ElementDesignForces> {
    grouped.members.iter().map(|member| {
        let (n, my, mz, vy) = pick_governing_3d(&member.stations, strategy);
        ElementDesignForces {
            element_id: member.member_id,
            n,
            my,
            mz: Some(mz),
            vy: Some(vy),
        }
    }).collect()
}

/// Extract governing steel design demands from 2D grouped station results.
pub fn extract_steel_demands_2d(
    grouped: &GroupedBeamStationResult,
    strategy: DemandStrategy,
) -> Vec<ElementDesignForces> {
    grouped.members.iter().map(|member| {
        let (n, m, v) = pick_governing_2d(&member.stations, strategy);
        ElementDesignForces {
            element_id: member.member_id,
            n,
            my: m,
            mz: None,
            vy: Some(v),
        }
    }).collect()
}

/// Extract governing RC design demands from 2D grouped station results.
pub fn extract_rc_demands_2d(
    grouped: &GroupedBeamStationResult,
    strategy: DemandStrategy,
) -> Vec<RCDesignForces> {
    grouped.members.iter().map(|member| {
        let (n, m, v) = pick_governing_2d(&member.stations, strategy);
        RCDesignForces {
            element_id: member.member_id,
            mu: m,
            vu: Some(v),
            nu: Some(n),
        }
    }).collect()
}

/// Extract governing RC design demands from 3D grouped station results.
/// Uses moment_z (major axis bending) as the governing moment for RC.
pub fn extract_rc_demands_3d(
    grouped: &GroupedBeamStationResult3D,
    strategy: DemandStrategy,
) -> Vec<RCDesignForces> {
    grouped.members.iter().map(|member| {
        let (n, _my, mz, vy) = pick_governing_3d(&member.stations, strategy);
        RCDesignForces {
            element_id: member.member_id,
            mu: mz,
            vu: Some(vy),
            nu: Some(n),
        }
    }).collect()
}

// ==================== Internal: pick governing from stations ====================

/// Scan all stations and combos for a 2D member, return (n, m, v) at the
/// governing point according to the strategy.
fn pick_governing_2d(
    stations: &[BeamStation],
    strategy: DemandStrategy,
) -> (f64, f64, f64) {
    let mut best_score = f64::NEG_INFINITY;
    let mut best = (0.0, 0.0, 0.0);

    for s in stations {
        for cf in &s.combo_forces {
            let score = match strategy {
                DemandStrategy::MaxAbsMoment => cf.m.abs(),
                DemandStrategy::MaxAbsAxial => cf.n.abs(),
                DemandStrategy::MaxInteraction { n_ref, m_ref } => {
                    let nr = if n_ref.abs() > 1e-30 { (cf.n / n_ref).abs() } else { 0.0 };
                    let mr = if m_ref.abs() > 1e-30 { (cf.m / m_ref).abs() } else { 0.0 };
                    nr + mr
                }
            };
            if score > best_score {
                best_score = score;
                best = (cf.n, cf.m, cf.v);
            }
        }
    }
    best
}

/// Scan all stations and combos for a 3D member, return (n, my, mz, vy) at the
/// governing point according to the strategy.
fn pick_governing_3d(
    stations: &[BeamStation3D],
    strategy: DemandStrategy,
) -> (f64, f64, f64, f64) {
    let mut best_score = f64::NEG_INFINITY;
    let mut best = (0.0, 0.0, 0.0, 0.0);

    for s in stations {
        for cf in &s.combo_forces {
            let score = match strategy {
                DemandStrategy::MaxAbsMoment => {
                    // For 3D, use SRSS of both moments as the scoring metric
                    (cf.my * cf.my + cf.mz * cf.mz).sqrt()
                }
                DemandStrategy::MaxAbsAxial => cf.n.abs(),
                DemandStrategy::MaxInteraction { n_ref, m_ref } => {
                    let nr = if n_ref.abs() > 1e-30 { (cf.n / n_ref).abs() } else { 0.0 };
                    let m_srss = (cf.my * cf.my + cf.mz * cf.mz).sqrt();
                    let mr = if m_ref.abs() > 1e-30 { m_srss / m_ref } else { 0.0 };
                    nr + mr
                }
            };
            if score > best_score {
                best_score = score;
                best = (cf.n, cf.my, cf.mz, cf.vy);
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_station_2d(member_id: usize, idx: usize, t: f64, forces: Vec<(usize, f64, f64, f64)>) -> BeamStation {
        let combo_forces = forces.iter().map(|&(cid, n, v, m)| {
            StationComboForces { combo_id: cid, combo_name: None, n, v, m }
        }).collect();
        BeamStation {
            member_id,
            label: None,
            station_index: idx,
            t,
            station_x: t * 6.0,
            section_id: 1,
            material_id: 1,
            combo_forces,
            governing: GoverningInfo {
                moment: None, shear: None, axial: None,
            },
        }
    }

    fn make_station_3d(member_id: usize, idx: usize, t: f64, forces: Vec<(usize, f64, f64, f64, f64, f64, f64)>) -> BeamStation3D {
        let combo_forces = forces.iter().map(|&(cid, n, vy, vz, my, mz, tor)| {
            StationComboForces3D { combo_id: cid, combo_name: None, n, vy, vz, my, mz, torsion: tor }
        }).collect();
        BeamStation3D {
            member_id,
            label: None,
            station_index: idx,
            t,
            station_x: t * 6.0,
            section_id: 1,
            material_id: 1,
            combo_forces,
            governing: GoverningInfo3D {
                axial: None, shear_y: None, shear_z: None,
                moment_y: None, moment_z: None, torsion: None,
            },
        }
    }

    #[test]
    fn max_abs_moment_picks_correct_station_2d() {
        let stations = vec![
            make_station_2d(1, 0, 0.0, vec![(1, 0.0, 10.0, -50.0), (2, 0.0, 15.0, -80.0)]),
            make_station_2d(1, 1, 0.5, vec![(1, 0.0, 5.0, -120.0), (2, 0.0, 8.0, -90.0)]),
            make_station_2d(1, 2, 1.0, vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 0.0)]),
        ];
        let (n, m, v) = pick_governing_2d(&stations, DemandStrategy::MaxAbsMoment);
        // Station 1, combo 1 has |m| = 120 (largest)
        assert!((m - (-120.0)).abs() < 1e-10);
        assert!((v - 5.0).abs() < 1e-10);
        assert!(n.abs() < 1e-10);
    }

    #[test]
    fn max_abs_axial_picks_correct_station_2d() {
        let stations = vec![
            make_station_2d(1, 0, 0.0, vec![(1, -200.0, 10.0, -50.0)]),
            make_station_2d(1, 1, 0.5, vec![(1, -100.0, 5.0, -120.0)]),
        ];
        let (n, m, _v) = pick_governing_2d(&stations, DemandStrategy::MaxAbsAxial);
        assert!((n - (-200.0)).abs() < 1e-10);
        assert!((m - (-50.0)).abs() < 1e-10);
    }

    #[test]
    fn max_abs_moment_picks_correct_station_3d() {
        let stations = vec![
            make_station_3d(1, 0, 0.0, vec![(1, 0.0, 10.0, 5.0, -30.0, -40.0, 2.0)]),
            make_station_3d(1, 1, 0.5, vec![(1, 0.0, 8.0, 3.0, -60.0, -80.0, 1.0)]),
        ];
        let (n, my, mz, vy) = pick_governing_3d(&stations, DemandStrategy::MaxAbsMoment);
        // Station 1: SRSS = sqrt(60^2 + 80^2) = 100  vs station 0: sqrt(30^2 + 40^2) = 50
        assert!((my - (-60.0)).abs() < 1e-10);
        assert!((mz - (-80.0)).abs() < 1e-10);
        assert!((vy - 8.0).abs() < 1e-10);
        assert!(n.abs() < 1e-10);
    }

    #[test]
    fn extract_steel_demands_2d_produces_correct_output() {
        let grouped = GroupedBeamStationResult {
            schema_version: 1,
            members: vec![MemberStationGroup {
                member_id: 1,
                label: None,
                section_id: 1,
                material_id: 1,
                length: 6.0,
                stations: vec![
                    make_station_2d(1, 0, 0.0, vec![(1, -100.0, 30.0, -200.0)]),
                    make_station_2d(1, 1, 1.0, vec![(1, -100.0, 0.0, 0.0)]),
                ],
                member_governing: MemberGoverning { moment: None, shear: None, axial: None },
            }],
            num_combinations: 1,
            num_stations_per_member: 2,
            sign_convention: SignConvention2D {
                local_x: String::new(), axial: String::new(),
                shear: String::new(), moment: String::new(), station_x: String::new(),
            },
        };

        let demands = extract_steel_demands_2d(&grouped, DemandStrategy::MaxAbsMoment);
        assert_eq!(demands.len(), 1);
        assert_eq!(demands[0].element_id, 1);
        assert!((demands[0].my - (-200.0)).abs() < 1e-10);
        assert!((demands[0].n - (-100.0)).abs() < 1e-10);
        assert!(demands[0].mz.is_none()); // 2D: no minor-axis moment
    }

    #[test]
    fn extract_rc_demands_3d_uses_mz_as_mu() {
        let grouped = GroupedBeamStationResult3D {
            schema_version: 1,
            members: vec![MemberStationGroup3D {
                member_id: 1,
                label: None,
                section_id: 1,
                material_id: 1,
                length: 6.0,
                stations: vec![
                    make_station_3d(1, 0, 0.0, vec![(1, -50.0, 25.0, 5.0, -10.0, -150.0, 1.0)]),
                ],
                member_governing: MemberGoverning3D {
                    axial: None, shear_y: None, shear_z: None,
                    moment_y: None, moment_z: None, torsion: None,
                },
            }],
            num_combinations: 1,
            num_stations_per_member: 1,
            sign_convention: SignConvention3D {
                local_x: String::new(), local_yz: String::new(),
                axial: String::new(), shear_y: String::new(), shear_z: String::new(),
                moment_y: String::new(), moment_z: String::new(), torsion: String::new(),
                station_x: String::new(),
            },
        };

        let demands = extract_rc_demands_3d(&grouped, DemandStrategy::MaxAbsMoment);
        assert_eq!(demands.len(), 1);
        // RC uses mz (major axis) as mu
        assert!((demands[0].mu - (-150.0)).abs() < 1e-10);
        assert!((demands[0].nu.unwrap() - (-50.0)).abs() < 1e-10);
        assert!((demands[0].vu.unwrap() - 25.0).abs() < 1e-10);
    }
}
