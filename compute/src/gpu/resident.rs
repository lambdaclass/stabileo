use super::{UnmapOnDrop, WgpuBackend, SESSION_BYTES};
use crate::{
    packing::{checked_f32, repack_values, PackedMatrix},
    resident::{ResidentVectors, ResidualStats},
    solver::{PcgProblem, SolveReport},
    ComputeError,
};
use dedaliano_engine::linalg::CscMatrix;
use std::sync::{atomic::AtomicBool, atomic::Ordering, Arc};
use wgpu::util::DeviceExt;

/// Logical solve payloads, excluding preparation and driver internals; these
/// are not a measurement of physical bus traffic (including on unified memory).
#[derive(Default, Clone, Copy, Debug, serde::Serialize)]
pub struct Transfers {
    pub uploaded_bytes: u64,
    pub downloaded_bytes: u64,
    pub readbacks: u64,
}

#[derive(Debug, serde::Serialize)]
pub struct ResidentReport {
    #[serde(flatten)]
    pub solve: SolveReport,
    pub transfers: Transfers,
}

pub struct ResidentPcg {
    problem: PcgProblem,
    vectors: WgpuVectors,
    ready: bool,
}

impl ResidentPcg {
    /// Replace values in the original CSC order, retaining GPU indices/buffers.
    /// Invalid numeric input leaves the previous problem intact. Cancellation
    /// or device errors after upload starts block solving until a valid update.
    pub async fn update_values(&mut self, values: Vec<f64>) -> Result<Transfers, ComputeError> {
        if self.vectors.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        let candidate = self.problem.with_values(values)?;
        let inverse: Vec<_> = candidate
            .matrix()
            .diagonal()
            .iter()
            .map(|d| checked_f32(1. / d))
            .collect::<Result<_, _>>()?;
        let max_inverse = inverse.iter().map(|v| f64::from(*v)).fold(0., f64::max);
        let (packed, row_norm) = repack_values(
            candidate.matrix(),
            &self.vectors.offsets,
            self.vectors.entries,
            self.vectors.interleaved,
        )?;
        // No await or mutation above: rejected inputs cannot poison the old solver.
        // Keep this false across await so a dropped future cannot leave mismatched
        // CPU validation data and GPU coefficients available to solve().
        self.ready = false;
        let errors = self
            .vectors
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);
        self.vectors
            .queue
            .write_buffer(&self.vectors.buffers[2], 0, bytemuck::cast_slice(&packed));
        self.vectors.queue.write_buffer(
            &self.vectors.buffers[5],
            0,
            bytemuck::cast_slice(&inverse),
        );
        if let Some(error) = errors.pop().await {
            return Err(ComputeError::Device(error.to_string()));
        }
        if self.vectors.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("GPU coefficient update failed".into()));
        }
        self.problem = candidate;
        self.vectors.row_norm = row_norm;
        self.vectors.max_inverse = max_inverse;
        self.ready = true;
        Ok(Transfers {
            uploaded_bytes: (packed.len() as u64 + inverse.len() as u64) * 4,
            ..Transfers::default()
        })
    }

    pub async fn solve(
        &mut self,
        rhs: &[f64],
        tolerance: f64,
        max_iterations: usize,
    ) -> Result<ResidentReport, ComputeError> {
        if !self.ready {
            return Err(ComputeError::Device("coefficient update incomplete".into()));
        }
        self.vectors.transfers = Transfers::default();
        self.problem.validate_rhs(rhs, tolerance, max_iterations)?;
        let result =
            crate::resident::solve(&mut self.vectors, rhs, tolerance, max_iterations).await?;
        Ok(ResidentReport {
            solve: self.problem.report(rhs, tolerance, result)?,
            transfers: self.vectors.transfers,
        })
    }
}

struct WgpuVectors {
    device: wgpu::Device,
    queue: wgpu::Queue,
    failed: Arc<AtomicBool>,
    pipelines: Vec<wgpu::ComputePipeline>,
    group: wgpu::BindGroup,
    buffers: Vec<wgpu::Buffer>,
    n: usize,
    groups: u32,
    interleaved: bool,
    offsets: Vec<u32>,
    entries: usize,
    row_norm: f64,
    max_inverse: f64,
    maxima: [f64; 3], // r, z, x
    p_max: f64,
    ap_max: f64,
    transfers: Transfers,
}

#[derive(Clone)]
pub(super) struct ResidentPipelines {
    layout: wgpu::BindGroupLayout,
    pipelines: Vec<wgpu::ComputePipeline>,
}

impl WgpuBackend {
    async fn resident_pipelines(&mut self) -> Result<ResidentPipelines, ComputeError> {
        if let Some(pipelines) = &self.resident_pipelines {
            return Ok(pipelines.clone());
        }
        let errors = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let layout_entries: Vec<_> = (0..8)
            .map(|binding| wgpu::BindGroupLayoutEntry {
                binding,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: if binding == 7 {
                        wgpu::BufferBindingType::Uniform
                    } else {
                        wgpu::BufferBindingType::Storage {
                            read_only: matches!(binding, 0 | 1 | 2 | 5),
                        }
                    },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            })
            .collect();
        let layout = self
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("resident PCG"),
                entries: &layout_entries,
            });
        let pipeline_layout = self
            .device
            .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("resident PCG"),
                bind_group_layouts: &[Some(&layout)],
                immediate_size: 0,
            });
        let shader = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("resident PCG"),
                source: wgpu::ShaderSource::Wgsl(include_str!("../resident.wgsl").into()),
            });
        let pipelines = ["initialize", "direction", "curvature", "update"]
            .iter()
            .map(|entry| {
                self.device
                    .create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                        label: Some(entry),
                        layout: Some(&pipeline_layout),
                        module: &shader,
                        entry_point: Some(entry),
                        compilation_options: Default::default(),
                        cache: None,
                    })
            })
            .collect();
        if let Some(error) = errors.pop().await {
            return Err(ComputeError::Device(error.to_string()));
        }
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device(
                "resident pipeline creation failed".into(),
            ));
        }
        let compiled = ResidentPipelines { layout, pipelines };
        self.resident_pipelines = Some(compiled.clone());
        Ok(compiled)
    }
}

impl WgpuBackend {
    pub async fn prepare_resident_pcg(
        &mut self,
        matrix: CscMatrix,
    ) -> Result<ResidentPcg, ComputeError> {
        crate::validate_matrix(&matrix)?;
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        let n = matrix.n;
        let limits = self.device.limits();
        // Retain the sparse operator's dimension, binding and total-memory limits.
        if n >= u32::MAX as usize
            || n.div_ceil(64) > limits.max_compute_workgroups_per_dimension as usize
        {
            return Err(ComputeError::ResourceLimit);
        }
        let groups = n.div_ceil(256) as u32;
        let vector_bytes = n as u64 * 4;
        let partial_bytes = groups as u64 * 32;
        let staging_bytes = vector_bytes.max(partial_bytes);
        let fixed = (n as u64 + 1) * 4 + vector_bytes * 6 + partial_bytes + staging_bytes + 48;
        let remaining = SESSION_BYTES
            .checked_sub(fixed)
            .ok_or(ComputeError::ResourceLimit)?;
        if remaining < 8 {
            return Err(ComputeError::ResourceLimit);
        }
        let binding_limit = limits
            .max_storage_buffer_binding_size
            .min(limits.max_buffer_size);
        if vector_bytes * 4 > binding_limit
            || partial_bytes > binding_limit
            || staging_bytes > limits.max_buffer_size
        {
            return Err(ComputeError::ResourceLimit);
        }
        let mut packed =
            PackedMatrix::new(&matrix, (remaining / 8).min(binding_limit / 4) as usize)?;
        let interleaved = packed.interleave_rows(remaining + (n as u64 + 1) * 4, binding_limit);
        let diagonal = matrix.diagonal();
        let problem = PcgProblem::new(matrix)?;
        let inverse: Vec<f32> = diagonal
            .iter()
            .map(|d| checked_f32(1. / d))
            .collect::<Result<_, _>>()?;
        let max_inverse = inverse.iter().map(|v| f64::from(*v)).fold(0., f64::max);
        let sizes = [
            packed.offsets.len() as u64 * 4,
            (packed.columns.len() as u64 * 4).max(4),
            (packed.values.len() as u64 * 4).max(4),
            vector_bytes * 4,
            vector_bytes,
            vector_bytes,
            partial_bytes,
            48,
            staging_bytes,
        ];
        if sizes.iter().sum::<u64>() > SESSION_BYTES
            || sizes[..7].iter().any(|v| *v > binding_limit)
        {
            return Err(ComputeError::ResourceLimit);
        }
        let compiled = self.resident_pipelines().await?;
        let errors = self.device.push_error_scope(wgpu::ErrorFilter::Validation);
        let initialized = |data: &[u8]| {
            self.device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("resident matrix/diagonal"),
                    contents: if data.is_empty() { &[0; 4] } else { data },
                    usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                })
        };
        let allocate = |size, usage| {
            self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("resident PCG"),
                size,
                usage,
                mapped_at_creation: false,
            })
        };
        let buffers = vec![
            initialized(bytemuck::cast_slice(&packed.offsets)),
            initialized(bytemuck::cast_slice(&packed.columns)),
            initialized(bytemuck::cast_slice(&packed.values)),
            allocate(
                sizes[3],
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            ),
            allocate(
                sizes[4],
                wgpu::BufferUsages::STORAGE
                    | wgpu::BufferUsages::COPY_DST
                    | wgpu::BufferUsages::COPY_SRC,
            ),
            initialized(bytemuck::cast_slice(&inverse)),
            allocate(
                sizes[6],
                wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            ),
            allocate(
                48,
                wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            ),
            allocate(
                staging_bytes,
                wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            ),
        ];
        let entries: Vec<_> = buffers[..8]
            .iter()
            .enumerate()
            .map(|(i, b)| wgpu::BindGroupEntry {
                binding: i as u32,
                resource: b.as_entire_binding(),
            })
            .collect();
        let group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("resident PCG"),
            layout: &compiled.layout,
            entries: &entries,
        });
        if let Some(error) = errors.pop().await {
            return Err(ComputeError::Device(error.to_string()));
        }
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("resident allocation failed".into()));
        }
        Ok(ResidentPcg {
            problem,
            ready: true,
            vectors: WgpuVectors {
                device: self.device.clone(),
                queue: self.queue.clone(),
                failed: self.failed.clone(),
                pipelines: compiled.pipelines,
                group,
                buffers,
                n,
                groups,
                interleaved,
                offsets: packed.offsets,
                entries: packed.values.len(),
                row_norm: packed.row_norm,
                max_inverse,
                maxima: [0.; 3],
                p_max: 0.,
                ap_max: 0.,
                transfers: Transfers::default(),
            },
        })
    }
}

// A fourfold margin also covers f32 rounding of the conservative bounds.
fn bound(value: f64) -> Result<f32, ComputeError> {
    if !value.is_finite() || value < 0. || value > f64::from(f32::MAX) / 4. {
        return Err(ComputeError::NumericRange);
    }
    // Zero vectors need a nonzero normal divisor for the scaled reductions.
    checked_f32(if value == 0. { 1. } else { value })
}

impl WgpuVectors {
    async fn dispatch<T>(
        &mut self,
        stages: &[usize],
        parameters: [f32; 6],
        solution: bool,
        read: impl FnOnce(&[f32]) -> Result<T, ComputeError>,
    ) -> Result<T, ComputeError> {
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        if !solution {
            let mut uniforms = [0u32; 12];
            uniforms[0] = self.n as u32;
            uniforms[1] = self.groups;
            uniforms[2] = u32::from(self.interleaved);
            for (slot, value) in uniforms[4..10].iter_mut().zip(parameters) {
                *slot = value.to_bits();
            }
            self.queue
                .write_buffer(&self.buffers[7], 0, bytemuck::cast_slice(&uniforms));
            self.transfers.uploaded_bytes += 48;
        }
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        for &stage in stages {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
            pass.set_pipeline(&self.pipelines[stage]);
            pass.set_bind_group(0, &self.group, &[]);
            pass.dispatch_workgroups(self.groups, 1, 1);
        }
        let bytes = if solution {
            self.n as u64 * 4
        } else {
            self.groups as u64 * 32
        };
        encoder.copy_buffer_to_buffer(
            &self.buffers[if solution { 3 } else { 6 }],
            0,
            &self.buffers[8],
            0,
            bytes,
        );
        let _submission = self.queue.submit([encoder.finish()]);
        let mapping = UnmapOnDrop(&self.buffers[8]);
        let slice = self.buffers[8].slice(..bytes);
        let (sender, receiver) = futures_channel::oneshot::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = sender.send(r);
        });
        self.transfers.readbacks += 1;
        self.transfers.downloaded_bytes += bytes;
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
        let result = {
            let view = slice.get_mapped_range();
            let values = bytemuck::cast_slice::<u8, f32>(&view);
            if values.iter().any(|v| !v.is_finite()) {
                return Err(ComputeError::NonFinite);
            }
            read(values)
        };
        drop(mapping);
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("resident GPU execution failed".into()));
        }
        result
    }

    async fn summarize(
        &mut self,
        stages: &[usize],
        parameters: [f32; 6],
    ) -> Result<[f64; 3], ComputeError> {
        let count = self.groups as usize;
        let (sums, maxima) = self
            .dispatch(stages, parameters, false, |values| {
                let mut sums = [0.; 3];
                let mut maxima = [0f64; 3];
                let (groups, tail) = values.as_chunks::<8>();
                if !tail.is_empty() || groups.len() != count {
                    return Err(ComputeError::InvalidBatch);
                }
                for group in groups {
                    if group[7] != 0. {
                        return Err(ComputeError::NumericRange);
                    }
                    for i in 0..3 {
                        sums[i] += f64::from(group[i]);
                        maxima[i] = maxima[i].max(f64::from(group[4 + i]));
                    }
                }
                Ok((sums, maxima))
            })
            .await?;
        self.maxima = maxima;
        Ok(sums)
    }
}

impl ResidentVectors for WgpuVectors {
    fn dimension(&self) -> usize {
        self.n
    }
    async fn initialize(&mut self, rhs: &[f64]) -> Result<ResidualStats, ComputeError> {
        if self.failed.load(Ordering::Acquire) {
            return Err(ComputeError::Device("device unavailable".into()));
        }
        let rhs: Vec<f32> = rhs
            .iter()
            .map(|v| checked_f32(*v))
            .collect::<Result<_, _>>()?;
        let max_r = rhs.iter().map(|v| f64::from(*v).abs()).fold(0., f64::max);
        let r_scale = bound(max_r)?;
        let z_scale = bound(max_r * self.max_inverse)?;
        self.queue
            .write_buffer(&self.buffers[4], 0, bytemuck::cast_slice(&rhs));
        self.transfers.uploaded_bytes += rhs.len() as u64 * 4;
        let sums = self
            .summarize(&[0], [0., 0., r_scale, z_scale, 1., 1.])
            .await?;
        self.p_max = self.maxima[1];
        Ok(ResidualStats {
            norm: sums[0].sqrt() * f64::from(r_scale),
            rz: sums[1] * f64::from(r_scale) * f64::from(z_scale),
        })
    }
    async fn curvature(&mut self, beta: Option<f64>) -> Result<f64, ComputeError> {
        let beta32 = checked_f32(beta.unwrap_or(0.))?;
        let p_bound = if beta.is_some() {
            self.maxima[1] + f64::from(beta32).abs() * self.p_max
        } else {
            self.p_max
        };
        let p_scale = bound(p_bound)?;
        let ap_scale = bound(self.row_norm * p_bound)?;
        let old = self.maxima;
        let sums = self
            .summarize(
                if beta.is_some() { &[1, 2] } else { &[2] },
                [0., beta32, 1., 1., p_scale, ap_scale],
            )
            .await?;
        // Curvature reports p/Ap maxima, not r/z/x maxima; preserve those until update.
        self.p_max = self.maxima[0];
        self.ap_max = self.maxima[1];
        self.maxima = old;
        Ok(sums[2] * f64::from(p_scale) * f64::from(ap_scale))
    }
    async fn update(&mut self, alpha: f64) -> Result<ResidualStats, ComputeError> {
        let alpha32 = checked_f32(alpha)?;
        let magnitude = f64::from(alpha32).abs();
        bound(self.maxima[2] + magnitude * self.p_max)?;
        let r_bound = self.maxima[0] + magnitude * self.ap_max;
        let r_scale = bound(r_bound)?;
        let z_scale = bound(r_bound * self.max_inverse)?;
        let sums = self
            .summarize(&[3], [alpha32, 0., r_scale, z_scale, 1., 1.])
            .await?;
        Ok(ResidualStats {
            norm: sums[0].sqrt() * f64::from(r_scale),
            rz: sums[1] * f64::from(r_scale) * f64::from(z_scale),
        })
    }
    async fn solution(&mut self) -> Result<Vec<f64>, ComputeError> {
        // x occupies the first n floats of state; no extraction kernel or f32 copy.
        self.dispatch(&[], [0., 0., 1., 1., 1., 1.], true, |values| {
            Ok(values.iter().copied().map(f64::from).collect())
        })
        .await
    }
}

impl Drop for WgpuVectors {
    fn drop(&mut self) {
        for buffer in &self.buffers {
            buffer.destroy();
        }
    }
}
