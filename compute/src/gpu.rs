use crate::{
    packing::{checked_f32, PackedMatrix},
    validate_batch, ComputeError, Precision, PreparedOperator, SparseBackend,
};
use dedaliano_engine::linalg::CscMatrix;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use wgpu::util::DeviceExt;

const SESSION_BYTES: u64 = 256 * 1024 * 1024;

pub struct WgpuBackend {
    info: wgpu::AdapterInfo,
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    failed: Arc<AtomicBool>,
}

impl WgpuBackend {
    pub fn adapter_info(&self) -> &wgpu::AdapterInfo {
        &self.info
    }
    pub fn shutdown(&mut self) {
        self.failed.store(true, Ordering::Release);
        self.device.destroy();
    }

    pub async fn new() -> Result<Self, ComputeError> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::METAL,
            ..Default::default()
        });
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                ..Default::default()
            })
            .await
            .map_err(|e| ComputeError::Unavailable(e.to_string()))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("stabileo experimental compute"),
                ..Default::default()
            })
            .await
            .map_err(|e| ComputeError::Unavailable(e.to_string()))?;
        let failed = Arc::new(AtomicBool::new(false));
        let errors = failed.clone();
        device.on_uncaptured_error(Arc::new(move |_| {
            errors.store(true, Ordering::Release);
        }));
        let lost = failed.clone();
        device.set_device_lost_callback(move |_, _| {
            lost.store(true, Ordering::Release);
        });
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("batched sparse product"),
            source: wgpu::ShaderSource::Wgsl(include_str!("spmv.wgsl").into()),
        });
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("batched sparse product"),
            layout: None,
            module: &shader,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });
        if let Some(error) = device.pop_error_scope().await {
            return Err(ComputeError::Device(error.to_string()));
        }
        Ok(Self {
            info: adapter.get_info(),
            device,
            queue,
            pipeline,
            failed,
        })
    }
}

pub struct WgpuOperator {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    failed: Arc<AtomicBool>,
    n: usize,
    max_vectors: usize,
    row_norm: f64,
    bind_group: wgpu::BindGroup,
    buffers: Vec<wgpu::Buffer>,
}

impl SparseBackend for WgpuBackend {
    type Operator = WgpuOperator;
    async fn prepare(
        &mut self,
        matrix: CscMatrix,
        max_vectors: usize,
    ) -> Result<WgpuOperator, ComputeError> {
        crate::validate_matrix(&matrix)?;
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        let n = matrix.n;
        let limits = self.device.limits();
        if max_vectors == 0 {
            return Err(ComputeError::InvalidBatch);
        }
        if n.div_ceil(64) > limits.max_compute_workgroups_per_dimension as usize
            || max_vectors > limits.max_compute_workgroups_per_dimension as usize
        {
            return Err(ComputeError::ResourceLimit);
        }
        let items = n
            .checked_mul(max_vectors)
            .ok_or(ComputeError::ResourceLimit)?;
        let bytes = u64::try_from(items)
            .ok()
            .and_then(|v| v.checked_mul(4))
            .ok_or(ComputeError::ResourceLimit)?;
        let binding_limit =
            u64::from(limits.max_storage_buffer_binding_size).min(limits.max_buffer_size);
        if items > u32::MAX as usize || bytes > binding_limit {
            return Err(ComputeError::ResourceLimit);
        }
        let fixed_bytes = (n as u64 + 1) * 4 + bytes * 3 + 16;
        let remaining = SESSION_BYTES
            .checked_sub(fixed_bytes)
            .ok_or(ComputeError::ResourceLimit)?;
        if remaining < 8 {
            return Err(ComputeError::ResourceLimit);
        }
        let max_entries = (binding_limit / 4).min(remaining / 8) as usize;
        let packed = PackedMatrix::new(&matrix, max_entries)?;
        let sizes = [
            (packed.offsets.len() as u64) * 4,
            (packed.columns.len() as u64 * 4).max(4),
            (packed.values.len() as u64 * 4).max(4),
            bytes,
            bytes,
        ];
        if sizes.iter().any(|&s| s > binding_limit)
            || sizes.iter().sum::<u64>() + bytes + 16 > SESSION_BYTES
        {
            return Err(ComputeError::ResourceLimit);
        }
        let initialized = |label, contents: &[u8]| {
            self.device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some(label),
                    contents: if contents.is_empty() {
                        &[0; 4]
                    } else {
                        contents
                    },
                    usage: wgpu::BufferUsages::STORAGE,
                })
        };
        let allocate = |label, size, usage| {
            self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size,
                usage,
                mapped_at_creation: false,
            })
        };
        let buffers = vec![
            initialized("row offsets", bytemuck::cast_slice(&packed.offsets)),
            initialized("column indices", bytemuck::cast_slice(&packed.columns)),
            initialized("matrix values", bytemuck::cast_slice(&packed.values)),
            allocate(
                "vectors",
                bytes,
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            ),
            allocate(
                "products",
                bytes,
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            ),
            allocate(
                "parameters",
                16,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            ),
            allocate(
                "readback",
                bytes,
                wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            ),
        ];
        let entries: Vec<_> = buffers[..6]
            .iter()
            .enumerate()
            .map(|(i, b)| wgpu::BindGroupEntry {
                binding: i as u32,
                resource: b.as_entire_binding(),
            })
            .collect();
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("sparse operator"),
            layout: &self.pipeline.get_bind_group_layout(0),
            entries: &entries,
        });
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("operator allocation failed".into()));
        }
        Ok(WgpuOperator {
            device: self.device.clone(),
            queue: self.queue.clone(),
            pipeline: self.pipeline.clone(),
            failed: self.failed.clone(),
            n,
            max_vectors,
            row_norm: packed.row_norm,
            bind_group,
            buffers,
        })
    }
}

impl PreparedOperator for WgpuOperator {
    fn precision(&self) -> Precision {
        Precision::ExperimentalF32
    }
    fn dimension(&self) -> usize {
        self.n
    }
    async fn apply_batch(&mut self, vectors: &[f64]) -> Result<Vec<f64>, ComputeError> {
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        let count = validate_batch(self.n, self.max_vectors, vectors)?;
        let values: Vec<f32> = vectors
            .iter()
            .map(|&v| checked_f32(v))
            .collect::<Result<_, _>>()?;
        let max_x = values
            .iter()
            .map(|v| f64::from(*v).abs())
            .fold(0.0, f64::max);
        if self.row_norm * max_x > f64::from(f32::MAX) / 4.0 {
            return Err(ComputeError::NumericRange);
        }
        self.queue
            .write_buffer(&self.buffers[3], 0, bytemuck::cast_slice(&values));
        self.queue.write_buffer(
            &self.buffers[5],
            0,
            bytemuck::cast_slice(&[self.n as u32, count as u32, 0, 0]),
        );
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.dispatch_workgroups(self.n.div_ceil(64) as u32, count as u32, 1);
        }
        let bytes = values.len() as u64 * 4;
        encoder.copy_buffer_to_buffer(&self.buffers[4], 0, &self.buffers[6], 0, bytes);
        let _submission = self.queue.submit([encoder.finish()]);
        let mapping = UnmapOnDrop(&self.buffers[6]);
        let slice = self.buffers[6].slice(..bytes);
        let (sender, receiver) = futures_channel::oneshot::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });
        #[cfg(not(target_arch = "wasm32"))]
        self.device
            .poll(wgpu::PollType::Wait {
                submission_index: Some(_submission),
                timeout: Some(std::time::Duration::from_secs(30)),
            })
            .map_err(|e| ComputeError::Device(e.to_string()))?;
        receiver
            .await
            .map_err(|e| ComputeError::Device(e.to_string()))?
            .map_err(|e| ComputeError::Device(e.to_string()))?;
        let result: Vec<f64> = {
            let view = slice.get_mapped_range();
            bytemuck::cast_slice::<u8, f32>(&view)
                .iter()
                .map(|&v| f64::from(v))
                .collect()
        };
        drop(mapping);
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("GPU execution failed".into()));
        }
        if result.iter().any(|v| !v.is_finite()) {
            return Err(ComputeError::NonFinite);
        }
        Ok(result)
    }
}

impl Drop for WgpuOperator {
    fn drop(&mut self) {
        for buffer in &self.buffers {
            buffer.destroy();
        }
    }
}

struct UnmapOnDrop<'a>(&'a wgpu::Buffer);
impl Drop for UnmapOnDrop<'_> {
    fn drop(&mut self) {
        self.0.unmap();
    }
}
