//! Planar geometrically exact Reissner beam on the reference arclength.
//! Midpoint integration of the axial/shear strains and constant curvature gives
//! a two-node, six-DOF element without the linear element's shear locking.
//! e = d·r' − 1, gamma = n·r', kappa = theta'; d,n are rotated material directors.
//! W = L/2 (EA e² + GA gamma² + EI kappa²). Both derivatives below are analytic.
//! This is a director-based total-reference beam, not the truss's Green-strain law.
//! See https://bleyerj.github.io/comet-fenicsx/tours/beams/finite_rotation_nonlinear_beam/finite_rotation_nonlinear_beam.html

/// Bound on the assumed section strains at the integration point, not a yield
/// criterion or a bound on discretization error. Mesh convergence is still needed.
pub const MAX_SECTION_STRAIN: f64 = 0.01;
/// Unwrapped rotations: a whole turn is admitted, arbitrarily large trig arguments are not.
pub const MAX_ROTATION: f64 = std::f64::consts::TAU;
/// Refine a member whose section rotation changes by more than a quarter turn.
pub const MAX_ELEMENT_TURN: f64 = std::f64::consts::FRAC_PI_2;

#[derive(Debug, Clone)]
pub struct TotalLagrangianBeam2D {
    direction: [f64; 2],
    length: f64,
    ea: f64,
    ga: f64,
    ei: f64,
    half_depth: f64,
}

#[derive(Debug, Clone)]
pub struct BeamResponse2D {
    /// [Fx, Fy, Mz] at each end, work-conjugate to [ux, uy, theta].
    pub internal: [f64; 6],
    pub tangent: [f64; 36],
    pub energy: f64,
    /// Midpoint axial strain, shear strain, and curvature per reference length.
    pub strains: [f64; 3],
    /// Work-conjugate section resultants N, V, M at the integration point.
    pub resultants: [f64; 3],
}

impl TotalLagrangianBeam2D {
    /// One consistent unit system. `shear_rigidity` includes the shear correction
    /// factor (G times effective shear area); `half_depth` bounds the section fibers.
    pub fn new(
        reference: [[f64; 2]; 2],
        young: f64,
        area: f64,
        inertia: f64,
        shear_rigidity: f64,
        half_depth: f64,
    ) -> Result<Self, String> {
        if reference.iter().flatten().any(|v| !v.is_finite())
            || [young, area, inertia, shear_rigidity, half_depth]
                .iter()
                .any(|v| !v.is_finite() || *v <= 0.0)
        {
            return Err("Total Lagrangian beam requires finite coordinates and positive finite section properties".into());
        }
        let chord = [
            reference[1][0] - reference[0][0],
            reference[1][1] - reference[0][1],
        ];
        let length = chord[0].hypot(chord[1]);
        let ea = young * area;
        let ei = young * inertia;
        let gyration = (inertia / area).sqrt();
        if [
            length,
            ea,
            ei,
            ea / length,
            ei / length,
            shear_rigidity / length,
            gyration,
        ]
        .iter()
        .any(|v| !v.is_finite() || *v <= 0.0)
            || gyration > half_depth
        {
            return Err("Total Lagrangian beam reference stiffness or section depth is outside its valid range".into());
        }
        Ok(Self {
            direction: chord.map(|v| v / length),
            length,
            ea,
            ga: shear_rigidity,
            ei,
            half_depth,
        })
    }

    /// Pure trial evaluation. Rotations are continuous, unwrapped increments
    /// from each element's initial director, in radians; no angle wrapping occurs.
    pub fn evaluate(&self, u: [[f64; 3]; 2]) -> Result<BeamResponse2D, String> {
        if u.iter().flatten().any(|v| !v.is_finite()) {
            return Err("Total Lagrangian beam requires finite displacements and rotations".into());
        }
        let turn = u[1][2] - u[0][2];
        if u[0][2].abs() > MAX_ROTATION
            || u[1][2].abs() > MAX_ROTATION
            || turn.abs() > MAX_ELEMENT_TURN
        {
            return Err("Total Lagrangian beam exceeds its rotation domain; refine the member or reduce the step".into());
        }
        let theta = 0.5 * u[0][2] + 0.5 * u[1][2];
        let (s, c) = theta.sin_cos();
        let d = [
            c * self.direction[0] - s * self.direction[1],
            s * self.direction[0] + c * self.direction[1],
        ];
        let normal = [-d[1], d[0]];
        let q = [
            (u[1][0] - u[0][0]) / self.length,
            (u[1][1] - u[0][1]) / self.length,
        ];
        // Stable at zero strain: do not subtract 1 from a rounded unit-vector dot product.
        let axial =
            -2.0 * (0.5 * theta).sin().powi(2) + crate::solver::assembly::compensated_dot(&d, &q);
        let shear = -s + crate::solver::assembly::compensated_dot(&normal, &q);
        let curvature = turn / self.length;
        let fiber_bound = axial.abs() + self.half_depth * curvature.abs();
        let stretch = (self.direction[0] + q[0]).hypot(self.direction[1] + q[1]);
        if [axial, shear, curvature, fiber_bound, stretch]
            .iter()
            .any(|v| !v.is_finite())
            || stretch <= 0.0
        {
            return Err(
                "Total Lagrangian beam trial geometry exceeds the finite nonzero range".into(),
            );
        }
        if fiber_bound > MAX_SECTION_STRAIN || shear.abs() > MAX_SECTION_STRAIN {
            return Err("Total Lagrangian beam exceeds its 1% section strain domain".into());
        }
        let strains = [axial, shear, curvature];
        let rigidities = [self.ea, self.ga, self.ei];
        let resultants = std::array::from_fn(|i| rigidities[i] * strains[i]);
        let mut b = [[0.0; 6]; 3];
        for i in 0..6 {
            let sign = if i < 3 { -1.0 } else { 1.0 };
            if i % 3 == 2 {
                b[0][i] = 0.5 * shear;
                b[1][i] = -0.5 * (1.0 + axial);
                b[2][i] = sign / self.length;
            } else {
                b[0][i] = sign * d[i % 3] / self.length;
                b[1][i] = sign * normal[i % 3] / self.length;
            }
        }
        let mut response = BeamResponse2D {
            internal: [0.0; 6],
            tangent: [0.0; 36],
            strains,
            resultants,
            energy: 0.5
                * self.length
                * (resultants[0] * axial + resultants[1] * shear + resultants[2] * curvature),
        };
        for i in 0..6 {
            response.internal[i] = self.length
                * (resultants[0] * b[0][i] + resultants[1] * b[1][i] + resultants[2] * b[2][i]);
            for j in 0..6 {
                let (he, hg) = match (i % 3 == 2, j % 3 == 2) {
                    (true, true) => (-0.25 * (1.0 + axial), -0.25 * shear),
                    (false, false) => (0.0, 0.0),
                    _ => {
                        let t = if i % 3 == 2 { j } else { i };
                        let sign = if t < 3 { -1.0 } else { 1.0 };
                        (
                            (0.5 * sign * normal[t % 3]) / self.length,
                            (-0.5 * sign * d[t % 3]) / self.length,
                        )
                    }
                };
                response.tangent[i * 6 + j] = self.length
                    * (self.ea * b[0][i] * b[0][j]
                        + self.ga * b[1][i] * b[1][j]
                        + self.ei * b[2][i] * b[2][j]
                        + resultants[0] * he
                        + resultants[1] * hg);
            }
        }
        if response
            .internal
            .iter()
            .chain(&response.tangent)
            .chain(&response.resultants)
            .chain([&response.energy])
            .any(|v| !v.is_finite())
        {
            return Err("Total Lagrangian beam response exceeds the finite range".into());
        }
        Ok(response)
    }
}
