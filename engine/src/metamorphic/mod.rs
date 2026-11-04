//! Model transforms for metamorphic testing (docs/verification/METAMORPHIC.md).
//!
//! A metamorphic test needs no reference solution: it solves a model and a
//! transformed copy of it, and checks that the two answers are related the way
//! physics says they must be. This module holds the transforms and the maps
//! that say how each result must change, so the engine tests
//! (`engine/tests/metamorphic*.rs`), the fuzz targets and any other harness use
//! one definition:
//!
//! * [`transform`]: rigid motions — a rotation (any 3D rotation; in 2D a
//!   rotation in the plane or a mirror) plus a translation — applied to the
//!   geometry *and* to everything defined against the global axes (nodal
//!   loads, support restraint directions, spring axes, inclined-support
//!   normals, member local-axis reference vectors, constraint DOF sets,
//!   self-weight directions). A feature the input format can only express in
//!   global axes and that the rotation does not map onto the axes again (a
//!   support restraining global X and Y but not Z, rotated by 30°) is
//!   reported as [`Unrepresentable`], never silently approximated;
//! * [`relabel`]: node / element / support / material / section renumbering
//!   and reordering of every map and load list;
//! * [`reversal`]: member orientation reversal (node_i ↔ node_j);
//! * [`units`]: consistent unit scaling (length × λ, force × φ, time × τ) of
//!   every dimensioned input, and the dimensional law results obey;
//! * [`compare`]: result flattening and comparison with tolerances from
//!   [`conditioning`] — the error a backward-stable solve may legitimately
//!   carry for the model's conditioning, not a hand-picked number.

pub mod compare;
pub mod conditioning;
pub mod relabel;
pub mod reversal;
pub mod transform;
pub mod units;

/// A transform that cannot be expressed in the input format for this model
/// (the reason names the feature). Harnesses skip the pair and record why.
#[derive(Debug, Clone, PartialEq)]
pub struct Unrepresentable(pub String);

impl std::fmt::Display for Unrepresentable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "unrepresentable: {}", self.0)
    }
}

pub type TResult<T> = Result<T, Unrepresentable>;

pub(crate) fn unrep<T>(why: impl Into<String>) -> TResult<T> {
    Err(Unrepresentable(why.into()))
}

/// Deterministic SplitMix64 stream (no `rand` dependency in the engine).
#[derive(Debug, Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in [0, 1).
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.f64()
    }
    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n.max(1) as u64) as usize
    }
    pub fn shuffle<T>(&mut self, v: &mut [T]) {
        for i in (1..v.len()).rev() {
            let j = self.below(i + 1);
            v.swap(i, j);
        }
    }
}
