//! Uniaxial materials: the law at one fiber, rebar or truss.

use crate::element::fiber_beam::{material_response, FiberMaterial, FiberMaterialState};

/// One material point under uniaxial strain.
///
/// `set_trial_strain` computes the trial stress and tangent from the last
/// committed state; `commit` accepts the trial state, `revert` discards it.
/// The tangent must be the consistent (algorithmic) one, so that Newton
/// converges quadratically.
pub trait UniaxialMaterial: Send {
    fn set_trial_strain(&mut self, strain: f64);
    fn stress(&self) -> f64;
    fn tangent(&self) -> f64;
    fn commit(&mut self);
    fn revert(&mut self);
    fn boxed_clone(&self) -> Box<dyn UniaxialMaterial>;
}

impl Clone for Box<dyn UniaxialMaterial> {
    fn clone(&self) -> Self {
        self.boxed_clone()
    }
}

/// Linear elastic, σ = E·ε.
#[derive(Debug, Clone)]
pub struct Elastic1D {
    e: f64,
    strain: f64,
}

impl Elastic1D {
    pub fn new(e: f64) -> Self {
        Elastic1D { e, strain: 0.0 }
    }
}

impl UniaxialMaterial for Elastic1D {
    fn set_trial_strain(&mut self, strain: f64) {
        self.strain = strain;
    }
    fn stress(&self) -> f64 {
        self.e * self.strain
    }
    fn tangent(&self) -> f64 {
        self.e
    }
    fn commit(&mut self) {}
    fn revert(&mut self) {}
    fn boxed_clone(&self) -> Box<dyn UniaxialMaterial> {
        Box::new(self.clone())
    }
}

/// The fiber solver's laws (`element::fiber_beam`: bilinear steel with
/// kinematic hardening, Hognestad concrete, elastic), called as they are. The
/// committed state is cloned into the trial before each evaluation, which is
/// what makes them path-dependent here exactly as there.
#[derive(Debug, Clone)]
pub struct FiberLaw1D {
    law: FiberMaterial,
    committed: FiberMaterialState,
    trial: FiberMaterialState,
}

impl FiberLaw1D {
    pub fn new(law: FiberMaterial) -> Self {
        let mut s = FiberLaw1D { law, committed: FiberMaterialState::new(), trial: FiberMaterialState::new() };
        // The initial tangent, so that the first assembly is not singular.
        s.set_trial_strain(0.0);
        s.committed = s.trial.clone();
        s
    }
}

impl UniaxialMaterial for FiberLaw1D {
    fn set_trial_strain(&mut self, strain: f64) {
        self.trial = self.committed.clone();
        material_response(&self.law, strain, &mut self.trial);
    }
    fn stress(&self) -> f64 {
        self.trial.stress
    }
    fn tangent(&self) -> f64 {
        self.trial.tangent
    }
    fn commit(&mut self) {
        self.committed = self.trial.clone();
    }
    fn revert(&mut self) {
        self.trial = self.committed.clone();
    }
    fn boxed_clone(&self) -> Box<dyn UniaxialMaterial> {
        Box::new(self.clone())
    }
}
