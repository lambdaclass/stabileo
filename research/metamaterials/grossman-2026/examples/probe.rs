use springs_grossman_2026::experiment::*;
use springs_grossman_2026::lattice::LatticeKind;
use springs_grossman_2026::network::SpringLaw;
fn main() {
    let s = NetworkSpec { lattice: LatticeKind::Triangular { phi: 1.0, psi: 1.0 }, eta: 0.0, keep: 1.0, seed: 0, spring_law: SpringLaw::Hookean, k: 1.0, prestress: 0.0 };
    for (w, band) in [(13.0, 0.5), (26.0, 0.5), (52.0, 0.5)] {
        let r = run_strip(&StripSpec { network: s.clone(), width: w, height: 4.0 * w, theta: 0.0, clamp_band: band, strain: 0.01 }).unwrap();
        // also the average over interior: width change measured from nodes nearest x=w/4 .. 3w/4 rows
        println!("w {w} nodes {} nu {:.4} gauge {:?} {:?}", r.nodes.len(), r.poisson, r.nodes[r.gauge[0]], r.nodes[r.gauge[1]]);
    }
}
