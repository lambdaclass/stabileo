use springs_grossman_2026::experiment::{run_strip, NetworkSpec, StripSpec};
use springs_grossman_2026::lattice::LatticeKind;
use springs_grossman_2026::network::SpringLaw;

#[test]
fn section_force_matches_top_reaction_including_cuts_through_nodes() {
    for theta in [0.0, 0.37, std::f64::consts::FRAC_PI_2] {
        for strain in [-0.01, 0.01] {
            let st = run_strip(&StripSpec {
                network: NetworkSpec {
                    lattice: LatticeKind::Triangular { phi: 3.0, psi: 2.0 },
                    eta: 0.0, keep: 1.0, seed: 0, spring_law: SpringLaw::EqualWeight,
                    k: 1.0, prestress: 0.0,
                },
                width: 13.0, height: 52.0, theta, clamp_band: 0.5, strain,
            }).unwrap();
            let mut nodal_reactions = vec![0.0; st.nodes.len()];
            for (e, &[a, b]) in st.bonds.iter().enumerate() {
                let dx = st.nodes[b][0] - st.nodes[a][0];
                let dy = st.nodes[b][1] - st.nodes[a][1];
                let du = st.displacement[b][0] - st.displacement[a][0];
                let dv = st.displacement[b][1] - st.displacement[a][1];
                let fy = st.stiffness[e] * (dx * du + dy * dv) * dy / (dx * dx + dy * dy);
                nodal_reactions[a] -= fy;
                nodal_reactions[b] += fy;
            }
            let reaction: f64 = nodal_reactions.iter().enumerate()
                .filter(|(i, _)| st.held[*i] && st.nodes[*i][1] > 26.0)
                .map(|(_, f)| f).sum();
            assert!(reaction.abs() > 1e-4);
            let mut cuts = vec![13.25, 26.0, 39.125];
            cuts.extend(st.nodes.iter().map(|p| p[1]).filter(|y| *y > 24.0 && *y < 28.0));
            for cut in cuts {
                assert!((st.section_force_y(cut) - reaction).abs() < 1e-9,
                    "theta={theta}, strain={strain}, cut={cut}: section={}, reaction={reaction}", st.section_force_y(cut));
            }
        }
    }
}
