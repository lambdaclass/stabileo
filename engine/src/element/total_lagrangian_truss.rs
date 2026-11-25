//! Two-node, three-dimensional total Lagrangian truss. Consistent units throughout.
//! Green–Lagrange strain e = (l²/L² − 1)/2, second Piola stress S = E e,
//! energy W = E A L e²/2. Forces and tangent are the first and second derivatives
//! of W with respect to nodal translations; there are no rotational DOFs.
//! This elastic experiment permits finite rotations, not unrestricted material strain.

/// Explicit small-material-strain domain of this experimental constitutive law.
pub const MAX_GREEN_STRAIN: f64 = 0.01;

#[derive(Debug, Clone)]
pub struct TotalLagrangianTruss {
    direction: [f64; 3],
    length: f64,
    ea: f64,
    stiffness: f64,
}

#[derive(Debug, Clone)]
pub struct TrussResponse {
    pub internal: [f64; 6],
    /// Row-major derivative of `internal` with respect to the six translations.
    pub tangent: [f64; 36],
    pub energy: f64,
    pub green_strain: f64,
    /// Force along the current chord, positive in tension (not A times S).
    pub axial_force: f64,
}

impl TotalLagrangianTruss {
    pub fn new(reference: [[f64; 3]; 2], young: f64, area: f64) -> Result<Self, String> {
        if reference.iter().flatten().any(|x| !x.is_finite())
            || !young.is_finite()
            || young <= 0.0
            || !area.is_finite()
            || area <= 0.0
        {
            return Err(
                "Total Lagrangian truss requires finite coordinates and positive finite E and A"
                    .into(),
            );
        }
        let chord: [f64; 3] = std::array::from_fn(|i| reference[1][i] - reference[0][i]);
        let length = chord[0].hypot(chord[1]).hypot(chord[2]);
        let ea = young * area;
        let stiffness = ea / length;
        if [length, ea, stiffness]
            .iter()
            .any(|x| !x.is_finite() || *x <= 0.0)
        {
            return Err("Total Lagrangian truss reference length or stiffness is outside the finite positive range".into());
        }
        Ok(Self {
            direction: chord.map(|x| x / length),
            length,
            ea,
            stiffness,
        })
    }

    /// Pure trial evaluation: an error cannot mutate a committed element state.
    pub fn evaluate(&self, displacement: [[f64; 3]; 2]) -> Result<TrussResponse, String> {
        if displacement.iter().flatten().any(|x| !x.is_finite()) {
            return Err("Total Lagrangian truss requires finite displacements".into());
        }
        let q: [f64; 3] =
            std::array::from_fn(|i| (displacement[1][i] - displacement[0][i]) / self.length);
        let d: [f64; 3] = std::array::from_fn(|i| self.direction[i] + q[i]);
        // Avoid subtracting two nearly equal squared lengths for small strains.
        let strain = crate::solver::assembly::compensated_dot(&self.direction, &q)
            + 0.5 * crate::solver::assembly::compensated_dot(&q, &q);
        let stretch = d[0].hypot(d[1]).hypot(d[2]);
        if !strain.is_finite() || !stretch.is_finite() || stretch <= 0.0 {
            return Err(
                "Total Lagrangian truss trial geometry is outside the finite nonzero range".into(),
            );
        }
        if strain.abs() > MAX_GREEN_STRAIN {
            return Err("Total Lagrangian truss exceeds its 1% Green strain domain".into());
        }
        let stress_area = self.ea * strain;
        let mut response = TrussResponse {
            internal: [0.0; 6],
            tangent: [0.0; 36],
            energy: (0.5 * stress_area * strain) * self.length,
            green_strain: strain,
            axial_force: stress_area * stretch,
        };
        for i in 0..6 {
            let si = if i < 3 { -1.0 } else { 1.0 };
            response.internal[i] = si * stress_area * d[i % 3];
            for j in 0..6 {
                let sj = if j < 3 { -1.0 } else { 1.0 };
                let geometric = if i % 3 == j % 3 { strain } else { 0.0 };
                response.tangent[i * 6 + j] =
                    si * sj * self.stiffness * (d[i % 3] * d[j % 3] + geometric);
            }
        }
        if response
            .internal
            .iter()
            .chain(&response.tangent)
            .chain([&response.energy, &response.axial_force])
            .any(|x| !x.is_finite())
        {
            return Err("Total Lagrangian truss response exceeds the finite range".into());
        }
        Ok(response)
    }
}
