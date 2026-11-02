//! Extract design-ready demands from beam station results.
//!
//! Bridges the gap between station extraction (solver output) and design
//! checks (steel/RC). The station extraction already computes forces at
//! every station for every combination. This module picks the governing
//! demands per member and packages them in the format each design check expects.

use super::beam_stations::*;
use super::design_axes::AxisDemand;
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
/// N and the moments come from the station/combo the strategy picks; each
/// shear is its peak over every station and combo, since the shear check does
/// not interact with them.
pub fn extract_steel_demands_3d(
    grouped: &GroupedBeamStationResult3D,
    strategy: DemandStrategy,
) -> Vec<ElementDesignForces> {
    grouped.members.iter().map(|member| {
        let g = pick_governing_3d(&member.stations, strategy);
        ElementDesignForces {
            element_id: member.member_id,
            n: g.at.n,
            my: g.at.m_strong,
            mz: Some(g.at.m_weak),
            v_strong: Some(g.peak.v_strong),
            v_weak: Some(g.peak.v_weak),
        }
    }).collect()
}

/// Extract governing steel design demands from 2D grouped station results.
pub fn extract_steel_demands_2d(
    grouped: &GroupedBeamStationResult,
    strategy: DemandStrategy,
) -> Vec<ElementDesignForces> {
    grouped.members.iter().map(|member| {
        let g = pick_governing_2d(&member.stations, strategy);
        ElementDesignForces {
            element_id: member.member_id,
            n: g.at.n,
            my: g.at.m_strong,
            mz: None,
            v_strong: Some(g.peak.v_strong),
            v_weak: None,
        }
    }).collect()
}

/// Extract governing RC design demands from 2D grouped station results.
pub fn extract_rc_demands_2d(
    grouped: &GroupedBeamStationResult,
    strategy: DemandStrategy,
) -> Vec<RCDesignForces> {
    grouped.members.iter().map(|member| {
        let g = pick_governing_2d(&member.stations, strategy);
        RCDesignForces {
            element_id: member.member_id,
            mu: g.at.m_strong,
            vu: Some(g.peak.v_strong),
            nu: Some(g.at.n),
        }
    }).collect()
}

/// Extract governing RC design demands from 3D grouped station results.
///
/// The RC check covers the strong axis (My, Vz) only, so a member with any
/// weak-axis moment or shear is an Err rather than checked without it.
pub fn extract_rc_demands_3d(
    grouped: &GroupedBeamStationResult3D,
    strategy: DemandStrategy,
) -> Result<Vec<RCDesignForces>, String> {
    grouped.members.iter().map(|member| {
        let g = pick_governing_3d(&member.stations, strategy);
        if g.peak.m_weak != 0.0 || g.peak.v_weak != 0.0 {
            return Err(format!(
                "member {}: weak-axis Mz = {} / Vy = {} not checked by the RC check (strong axis only)",
                member.member_id, g.peak.m_weak, g.peak.v_weak
            ));
        }
        Ok(RCDesignForces {
            element_id: member.member_id,
            mu: g.at.m_strong,
            vu: Some(g.peak.v_strong),
            nu: Some(g.at.n),
        })
    }).collect()
}

struct Governing {
    at: AxisDemand,
    peak: AxisDemand,
}

fn signed_peak(a: f64, b: f64) -> f64 {
    if b.abs() > a.abs() { b } else { a }
}

fn pick_governing(demands: impl Iterator<Item = AxisDemand>, strategy: DemandStrategy) -> Governing {
    let mut best_score = f64::NEG_INFINITY;
    let mut g = Governing { at: AxisDemand::default(), peak: AxisDemand::default() };
    for d in demands {
        let m = d.m_strong.hypot(d.m_weak);
        let score = match strategy {
            DemandStrategy::MaxAbsMoment => m,
            DemandStrategy::MaxAbsAxial => d.n.abs(),
            DemandStrategy::MaxInteraction { n_ref, m_ref } => {
                let nr = if n_ref.abs() > 1e-30 { (d.n / n_ref).abs() } else { 0.0 };
                let mr = if m_ref.abs() > 1e-30 { m / m_ref } else { 0.0 };
                nr + mr
            }
        };
        if score > best_score {
            best_score = score;
            g.at = d;
        }
        g.peak = AxisDemand {
            n: signed_peak(g.peak.n, d.n),
            m_strong: signed_peak(g.peak.m_strong, d.m_strong),
            v_strong: signed_peak(g.peak.v_strong, d.v_strong),
            m_weak: signed_peak(g.peak.m_weak, d.m_weak),
            v_weak: signed_peak(g.peak.v_weak, d.v_weak),
        };
    }
    g
}

fn pick_governing_2d(stations: &[BeamStation], strategy: DemandStrategy) -> Governing {
    pick_governing(
        stations.iter().flat_map(|s| s.combo_forces.iter().map(|cf| AxisDemand::plane_2d(cf.n, cf.m, cf.v))),
        strategy,
    )
}

fn pick_governing_3d(stations: &[BeamStation3D], strategy: DemandStrategy) -> Governing {
    pick_governing(stations.iter().flat_map(|s| s.combo_forces.iter().map(AxisDemand::station_3d)), strategy)
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
        let g = pick_governing_2d(&stations, DemandStrategy::MaxAbsMoment);
        assert!((g.at.m_strong - (-120.0)).abs() < 1e-10);
        assert!((g.peak.v_strong - 15.0).abs() < 1e-10);
        assert!(g.at.n.abs() < 1e-10);
    }

    #[test]
    fn max_abs_axial_picks_correct_station_2d() {
        let stations = vec![
            make_station_2d(1, 0, 0.0, vec![(1, -200.0, 10.0, -50.0)]),
            make_station_2d(1, 1, 0.5, vec![(1, -100.0, 5.0, -120.0)]),
        ];
        let g = pick_governing_2d(&stations, DemandStrategy::MaxAbsAxial);
        assert!((g.at.n - (-200.0)).abs() < 1e-10);
        assert!((g.at.m_strong - (-50.0)).abs() < 1e-10);
    }

    #[test]
    fn max_abs_moment_picks_correct_station_3d() {
        let stations = vec![
            make_station_3d(1, 0, 0.0, vec![(1, 0.0, 10.0, 5.0, -30.0, -40.0, 2.0)]),
            make_station_3d(1, 1, 0.5, vec![(1, 0.0, 8.0, 3.0, -60.0, -80.0, 1.0)]),
        ];
        let g = pick_governing_3d(&stations, DemandStrategy::MaxAbsMoment);
        assert!((g.at.m_strong - (-60.0)).abs() < 1e-10);
        assert!((g.at.m_weak - (-80.0)).abs() < 1e-10);
        assert!((g.peak.v_strong - 5.0).abs() < 1e-10);
        assert!((g.peak.v_weak - 10.0).abs() < 1e-10);
        assert!(g.at.n.abs() < 1e-10);
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

    fn grouped_3d(forces: Vec<(usize, f64, f64, f64, f64, f64, f64)>) -> GroupedBeamStationResult3D {
        GroupedBeamStationResult3D {
            schema_version: 1,
            members: vec![MemberStationGroup3D {
                member_id: 1,
                label: None,
                section_id: 1,
                material_id: 1,
                length: 6.0,
                stations: vec![make_station_3d(1, 0, 0.0, forces)],
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
        }
    }

    #[test]
    fn extract_rc_demands_3d_uses_my_and_vz() {
        let demands = extract_rc_demands_3d(&grouped_3d(vec![(1, -50.0, 0.0, 5.0, -10.0, 0.0, 1.0)]), DemandStrategy::MaxAbsMoment)
            .unwrap();
        assert!((demands[0].mu - (-10.0)).abs() < 1e-10);
        assert!((demands[0].vu.unwrap() - 5.0).abs() < 1e-10);
        assert!((demands[0].nu.unwrap() - (-50.0)).abs() < 1e-10);
    }

    #[test]
    fn extract_rc_demands_3d_refuses_weak_axis_demands() {
        for f in [(1, -50.0, 25.0, 5.0, -10.0, 0.0, 1.0), (1, -50.0, 0.0, 5.0, -10.0, -150.0, 1.0)] {
            assert!(extract_rc_demands_3d(&grouped_3d(vec![f]), DemandStrategy::MaxAbsMoment).is_err());
        }
    }

    #[test]
    fn extract_steel_demands_3d_maps_strong_and_weak_axes() {
        let d = &extract_steel_demands_3d(&grouped_3d(vec![(1, -50.0, 25.0, 5.0, -10.0, -150.0, 1.0)]), DemandStrategy::MaxAbsMoment)[0];
        assert_eq!((d.my, d.mz, d.v_strong, d.v_weak), (-10.0, Some(-150.0), Some(5.0), Some(25.0)));
    }
}
