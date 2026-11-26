use crate::{gpu::WgpuBackend, CpuBackend, PreparedOperator, SparseBackend};
use dedaliano_engine::linalg::CscMatrix;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ExperimentalSparseOperator {
    gpu: crate::gpu::WgpuOperator,
    cpu: crate::CpuOperator,
}

#[wasm_bindgen]
impl ExperimentalSparseOperator {
    pub async fn create(
        n: u32,
        offsets: Vec<u32>,
        rows: Vec<u32>,
        values: Vec<f64>,
        max_vectors: u32,
    ) -> Result<Self, JsValue> {
        let matrix = CscMatrix {
            n: n as usize,
            col_ptr: offsets.into_iter().map(|v| v as usize).collect(),
            row_idx: rows.into_iter().map(|v| v as usize).collect(),
            values,
        };
        let cpu = CpuBackend
            .prepare(matrix.clone(), max_vectors as usize)
            .await
            .map_err(js_error)?;
        let gpu = WgpuBackend::new()
            .await
            .map_err(js_error)?
            .prepare(matrix, max_vectors as usize)
            .await
            .map_err(js_error)?;
        Ok(Self { gpu, cpu })
    }

    #[wasm_bindgen(getter)]
    pub fn precision(&self) -> String {
        "experimental-f32".into()
    }

    pub async fn apply_batch(&mut self, vectors: Vec<f64>) -> Result<Vec<f64>, JsValue> {
        self.gpu.apply_batch(&vectors).await.map_err(js_error)
    }

    pub async fn reference_batch(&mut self, vectors: Vec<f64>) -> Result<Vec<f64>, JsValue> {
        self.cpu.apply_batch(&vectors).await.map_err(js_error)
    }
}

fn js_error(error: crate::ComputeError) -> JsValue {
    js_sys::Error::new(&error.to_string()).into()
}

fn report_value(report: &impl serde::Serialize) -> Result<JsValue, serde_wasm_bindgen::Error> {
    report.serialize(&serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true))
}

#[wasm_bindgen]
pub struct ExperimentalGpuContext(crate::gpu::WgpuBackend);

#[wasm_bindgen]
impl ExperimentalGpuContext {
    pub async fn create() -> Result<Self, JsValue> {
        Ok(Self(WgpuBackend::new().await.map_err(js_error)?))
    }
    #[wasm_bindgen(getter)]
    pub fn adapter_info(&self) -> String {
        format!("{:?}", self.0.adapter_info())
    }
    pub async fn prepare_pcg(
        &mut self,
        n: u32,
        offsets: Vec<u32>,
        rows: Vec<u32>,
        values: Vec<f64>,
    ) -> Result<ExperimentalPcgSolver, JsValue> {
        let matrix = sparse_matrix(n, offsets, rows, values);
        let solver = crate::solver::PreparedPcg::prepare(&mut self.0, matrix)
            .await
            .map_err(js_error)?;
        Ok(ExperimentalPcgSolver(PcgBackend::Gpu(solver)))
    }

    pub async fn prepare_resident_pcg(
        &mut self,
        n: u32,
        offsets: Vec<u32>,
        rows: Vec<u32>,
        values: Vec<f64>,
    ) -> Result<ExperimentalPcgSolver, JsValue> {
        let solver = self
            .0
            .prepare_resident_pcg(sparse_matrix(n, offsets, rows, values))
            .await
            .map_err(js_error)?;
        Ok(ExperimentalPcgSolver(PcgBackend::Resident(solver)))
    }
}

enum PcgBackend {
    Cpu(crate::solver::PcgProblem),
    Gpu(crate::solver::PreparedPcg<crate::gpu::WgpuOperator>),
    Resident(crate::gpu::resident::ResidentPcg),
}

#[wasm_bindgen]
pub struct ExperimentalPcgSolver(PcgBackend);
#[wasm_bindgen]
impl ExperimentalPcgSolver {
    pub async fn update_values(&mut self, values: Vec<f64>) -> Result<JsValue, JsValue> {
        let PcgBackend::Resident(solver) = &mut self.0 else {
            return Err(js_error(crate::ComputeError::InvalidOptions));
        };
        let transfers = solver.update_values(values).await.map_err(js_error)?;
        report_value(&transfers).map_err(|e| js_sys::Error::new(&e.to_string()).into())
    }

    pub async fn cpu(
        n: u32,
        offsets: Vec<u32>,
        rows: Vec<u32>,
        values: Vec<f64>,
    ) -> Result<Self, JsValue> {
        let solver = crate::solver::PcgProblem::new(sparse_matrix(n, offsets, rows, values))
            .map_err(js_error)?;
        Ok(Self(PcgBackend::Cpu(solver)))
    }
    pub async fn solve(
        &mut self,
        rhs: Vec<f64>,
        tolerance: f64,
        max_iterations: usize,
    ) -> Result<JsValue, JsValue> {
        let report = match &mut self.0 {
            PcgBackend::Cpu(solver) => report_value(
                &solver
                    .solve_cpu_reference(&rhs, tolerance, max_iterations)
                    .map_err(js_error)?,
            ),
            PcgBackend::Gpu(solver) => {
                solver.reset_transfers();
                let solve = solver
                    .solve(&rhs, tolerance, max_iterations)
                    .await
                    .map_err(js_error)?;
                report_value(&crate::gpu::resident::ResidentReport {
                    solve,
                    transfers: solver.transfers(),
                })
            }
            PcgBackend::Resident(solver) => report_value(
                &solver
                    .solve(&rhs, tolerance, max_iterations)
                    .await
                    .map_err(js_error)?,
            ),
        };
        report.map_err(|e| js_sys::Error::new(&e.to_string()).into())
    }
}

#[wasm_bindgen]
pub struct ExperimentalCholesky {
    matrix: CscMatrix,
    factor: dedaliano_engine::linalg::NumericCholesky,
}
#[wasm_bindgen]
impl ExperimentalCholesky {
    pub fn create(
        n: u32,
        offsets: Vec<u32>,
        rows: Vec<u32>,
        values: Vec<f64>,
    ) -> Result<Self, JsValue> {
        let matrix = sparse_matrix(n, offsets, rows, values);
        crate::validate_matrix(&matrix).map_err(js_error)?;
        let symbolic = std::rc::Rc::new(dedaliano_engine::linalg::symbolic_cholesky(&matrix));
        let factor = dedaliano_engine::linalg::numeric_cholesky(&symbolic, &matrix)
            .ok_or_else(|| js_sys::Error::new("Cholesky refused the matrix"))?;
        Ok(Self { matrix, factor })
    }
    pub fn solve(&self, rhs: Vec<f64>, tolerance: f64) -> Result<JsValue, JsValue> {
        crate::validate_batch(self.matrix.n, 1, &rhs).map_err(js_error)?;
        if !tolerance.is_finite() || tolerance <= 0. || tolerance >= 1. {
            return Err(js_error(crate::ComputeError::InvalidOptions));
        }
        let x = dedaliano_engine::linalg::sparse_cholesky_solve(&self.factor, &rhs);
        let residual =
            crate::solver::true_relative_residual(&self.matrix, &rhs, &x).map_err(js_error)?;
        let report = crate::solver::SolveReport {
            x,
            iterations: 0,
            recursive_relative_residual: residual,
            true_relative_residual: residual,
            converged: residual <= tolerance,
        };
        serde_wasm_bindgen::to_value(&report).map_err(|e| js_sys::Error::new(&e.to_string()).into())
    }
}

#[wasm_bindgen]
pub fn comparison_cases() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&crate::fixtures::comparison_cases())
        .map_err(|e| js_sys::Error::new(&e.to_string()).into())
}

#[wasm_bindgen]
pub fn large_comparison_names() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(crate::fixtures::LARGE_CASES)
        .map_err(|e| js_sys::Error::new(&e.to_string()).into())
}

#[wasm_bindgen]
pub fn large_comparison_case(name: &str) -> Result<JsValue, JsValue> {
    let case = crate::fixtures::large_case(name)
        .ok_or_else(|| js_sys::Error::new("unknown comparison case"))?;
    serde_wasm_bindgen::to_value(&case).map_err(|e| js_sys::Error::new(&e.to_string()).into())
}

fn sparse_matrix(n: u32, offsets: Vec<u32>, rows: Vec<u32>, values: Vec<f64>) -> CscMatrix {
    CscMatrix {
        n: n as usize,
        col_ptr: offsets.into_iter().map(|v| v as usize).collect(),
        row_idx: rows.into_iter().map(|v| v as usize).collect(),
        values,
    }
}
