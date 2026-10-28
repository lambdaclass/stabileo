//! A compact recording of a run for the page's autoplay: the mesh once, then per load step the
//! nodal damage (u8) and displacement (i8 per component, scaled per step), plus every step's
//! scalar results at full precision.
//!
//! Layout (little-endian): b"SRPL", u32 version = 1, u32 header length, header JSON, padding to
//! 4 bytes, nodes as f32 [x0, y0, ...], elements as u16 [4 per element], then per step
//! damage u8[n], ux i8[n], uy i8[n].
//! Damage d is stored as round(d / DAMAGE_MAX * 255) (d clamped to [0, DAMAGE_MAX]); a
//! displacement component as round(u / s * 127) with s the step's largest |u|.

use serde::{Deserialize, Serialize};

use crate::mesh::Mesh;
use crate::solver::StepResult;

pub const DAMAGE_MAX: f64 = 1.05;
const MAGIC: &[u8; 4] = b"SRPL";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    pub nodes: usize,
    pub elements: usize,
    pub damage_max: f64,
    /// Largest |u| of each step, the scale of its i8 displacements.
    pub displacement_scale: Vec<f64>,
    pub steps: Vec<serde_json::Value>,
    pub config: serde_json::Value,
}

pub struct Frame {
    pub damage: Vec<f64>,
    pub displacement: Vec<f64>,
}

pub fn encode(mesh: &Mesh, config: serde_json::Value, steps: &[StepResult], frames: &[(Vec<f64>, Vec<f64>)]) -> Result<Vec<u8>, String> {
    let n = mesh.nodes.len();
    if n > u16::MAX as usize {
        return Err("replay: more than 65535 nodes".into());
    }
    let scales: Vec<f64> = frames.iter().map(|(_, u)| u.iter().fold(0.0f64, |m, v| m.max(v.abs()))).collect();
    let header = Header {
        nodes: n,
        elements: mesh.elements.len(),
        damage_max: DAMAGE_MAX,
        displacement_scale: scales.clone(),
        steps: steps.iter().map(|s| serde_json::to_value(s).unwrap()).collect(),
        config,
    };
    let json = serde_json::to_vec(&header).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&(json.len() as u32).to_le_bytes());
    out.extend_from_slice(&json);
    while out.len() % 4 != 0 {
        out.push(b' ');
    }
    for p in &mesh.nodes {
        out.extend_from_slice(&(p[0] as f32).to_le_bytes());
        out.extend_from_slice(&(p[1] as f32).to_le_bytes());
    }
    for e in &mesh.elements {
        for &a in e {
            out.extend_from_slice(&(a as u16).to_le_bytes());
        }
    }
    for ((d, u), s) in frames.iter().zip(&scales) {
        out.extend(d.iter().map(|&v| (v.clamp(0.0, DAMAGE_MAX) / DAMAGE_MAX * 255.0).round() as u8));
        let q = |v: f64| if *s > 0.0 { (v / s * 127.0).round() as i8 as u8 } else { 0 };
        out.extend((0..n).map(|i| q(u[2 * i])));
        out.extend((0..n).map(|i| q(u[2 * i + 1])));
    }
    Ok(out)
}

pub fn decode(bytes: &[u8]) -> Result<(Header, Vec<[f64; 2]>, Vec<[usize; 4]>, Vec<Frame>), String> {
    let rd = |o: usize| u32::from_le_bytes(bytes[o..o + 4].try_into().unwrap()) as usize;
    if bytes.len() < 12 || &bytes[0..4] != MAGIC || rd(4) != 1 {
        return Err("replay: not a version 1 SRPL file".into());
    }
    let len = rd(8);
    let header: Header = serde_json::from_slice(&bytes[12..12 + len]).map_err(|e| e.to_string())?;
    let mut o = (12 + len).div_ceil(4) * 4;
    let n = header.nodes;
    let f32_at = |o: usize| f32::from_le_bytes(bytes[o..o + 4].try_into().unwrap()) as f64;
    let nodes: Vec<[f64; 2]> = (0..n).map(|i| [f32_at(o + 8 * i), f32_at(o + 8 * i + 4)]).collect();
    o += 8 * n;
    let elements: Vec<[usize; 4]> = (0..header.elements)
        .map(|e| {
            let at = |k: usize| u16::from_le_bytes(bytes[o + 8 * e + 2 * k..o + 8 * e + 2 * k + 2].try_into().unwrap()) as usize;
            [at(0), at(1), at(2), at(3)]
        })
        .collect();
    o += 8 * header.elements;
    let mut frames = Vec::new();
    for s in &header.displacement_scale {
        let damage = bytes[o..o + n].iter().map(|&b| b as f64 / 255.0 * header.damage_max).collect();
        let mut displacement = vec![0.0; 2 * n];
        for i in 0..n {
            displacement[2 * i] = bytes[o + n + i] as i8 as f64 / 127.0 * s;
            displacement[2 * i + 1] = bytes[o + 2 * n + i] as i8 as f64 / 127.0 * s;
        }
        frames.push(Frame { damage, displacement });
        o += 3 * n;
    }
    if o != bytes.len() {
        return Err("replay: trailing bytes".into());
    }
    Ok((header, nodes, elements, frames))
}
