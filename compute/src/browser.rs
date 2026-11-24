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
