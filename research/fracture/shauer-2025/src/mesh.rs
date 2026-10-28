//! Adapted from phasefield-jr-py, © 2025 Nathan Shauer (MIT).
//! See ../LICENSE-phasefield-jr-py for the complete upstream notice.
//!
//! Structured quadrilateral meshes. The generators reproduce the node and element numbering of
//! phasefield-jr-py (MIT License, (c) 2025 Nathan Shauer), so nodal fields can be compared with
//! the reference outputs entry by entry.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Mesh {
    pub nodes: Vec<[f64; 2]>,
    /// Counter-clockwise; node 0 is the corner at (xi, eta) = (-1, -1).
    pub elements: Vec<[usize; 4]>,
}

impl Mesh {
    pub fn n_nodes(&self) -> usize {
        self.nodes.len()
    }

    pub fn nodes_where(&self, pred: impl Fn(f64, f64) -> bool) -> Vec<usize> {
        (0..self.nodes.len()).filter(|&i| pred(self.nodes[i][0], self.nodes[i][1])).collect()
    }
}

/// Rectangle [0, length] x [0, height], `nx` x `ny` equal elements (reference example 1).
pub fn rectangle(nx: usize, ny: usize, length: f64, height: f64) -> Mesh {
    let mut nodes = Vec::with_capacity((nx + 1) * (ny + 1));
    for j in 0..=ny {
        for i in 0..=nx {
            nodes.push([i as f64 * length / nx as f64, j as f64 * height / ny as f64]);
        }
    }
    let mut elements = Vec::with_capacity(nx * ny);
    for j in 0..ny {
        for i in 0..nx {
            let n1 = j * (nx + 1) + i;
            let n3 = n1 + nx + 1;
            elements.push([n1, n1 + 1, n3 + 1, n3]);
        }
    }
    Mesh { nodes, elements }
}

/// Single-edge notched square [-0.5, 0.5]^2 with the notch on y = 0 from x = -0.5 to the tip at
/// x = 0, modelled by duplicated nodes (reference example 2). A band of `nx_fine` x `ny_fine`
/// square elements of side `h_fine` surrounds the tip on each side of the notch plane.
#[derive(Debug, Clone, Copy, Serialize, serde::Deserialize)]
pub struct NotchedSquare {
    pub nx: usize,
    pub ny: usize,
    pub nx_fine: usize,
    pub ny_fine: usize,
    pub h_fine: f64,
}

impl NotchedSquare {
    /// The mesh of `example2_sparse.py`.
    pub const REFERENCE: NotchedSquare = NotchedSquare { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 };

    pub fn validate(&self) -> Result<(), String> {
        if !self.h_fine.is_finite() || self.h_fine <= 0.0 {
            return Err("fine spacing must be finite and positive".into());
        }
        let half_ny = self.ny / 2;
        if self.nx % 2 != 0 || self.ny % 2 != 0 {
            return Err("nx and ny must be even".into());
        }
        if self.nx_fine % 2 != 0 || self.nx_fine >= self.nx || self.ny_fine >= half_ny {
            return Err("the refined band must be even in x and smaller than the mesh".into());
        }
        if (self.nx - self.nx_fine) % 2 != 0 {
            return Err("nx - nx_fine must be even so the tip is a node".into());
        }
        if self.h_fine * self.nx_fine as f64 >= 1.0 || self.h_fine * self.ny_fine as f64 >= 0.5 {
            return Err("the refined band does not fit in the plate".into());
        }
        Ok(())
    }

    pub fn build(&self) -> Mesh {
        let (length, height) = (1.0f64, 1.0f64);
        let nx = self.nx;
        let ny = self.ny / 2;
        let h = self.h_fine;
        let ny_large = ny - self.ny_fine;
        let nx_large = nx - self.nx_fine;
        let y_small = h * self.ny_fine as f64;
        let y_large = (height / 2.0 - y_small) / ny_large as f64;
        let x_small = h * self.nx_fine as f64;
        let x_large = (length - x_small) / nx_large as f64;
        let half_large = nx_large as f64 / 2.0;

        let mut nodes = Vec::new();
        for j in 0..=ny {
            let mut x = -0.5;
            for i in 0..=nx {
                let y = if j <= self.ny_fine { j as f64 * h } else { y_small + (j - self.ny_fine) as f64 * y_large };
                nodes.push([x, y]);
                let fi = i as f64;
                if fi < half_large || fi > half_large + self.nx_fine as f64 - 1.0 {
                    x += x_large;
                } else {
                    x += h;
                }
            }
        }
        let mut elements = Vec::new();
        for j in 0..ny {
            for i in 0..nx {
                let n1 = j * (nx + 1) + i;
                let n3 = n1 + nx + 1;
                elements.push([n1, n1 + 1, n3 + 1, n3]);
            }
        }
        let original = nodes.len();
        let mut map = vec![0usize; original];
        for i in 0..original {
            let [x, y] = nodes[i];
            if y.abs() > 1e-8 {
                map[i] = nodes.len();
                nodes.push([x, -y]);
            } else if x < -1e-8 {
                map[i] = nodes.len();
                nodes.push([x, y]);
            } else {
                map[i] = i;
            }
        }
        mirror_elements(&mut elements, &map);
        Mesh { nodes, elements }
    }
}

/// Three-point bending beam [-4, 4] x [0, 2] with a notch of depth 0.4 at x = 0 modelled by
/// duplicated nodes (reference example 3).
pub fn three_point_bending(nx: usize, ny: usize) -> Mesh {
    let (length, height) = (8.0f64, 2.0f64);
    let n_start_y = 8usize;
    let h = 0.00625f64;
    let notch = 0.4f64;
    let nx_small = 16usize;
    let ny_small = 32usize;
    let size_y_start = notch - h * ny_small as f64 / 2.0;
    let dy_start = size_y_start / n_start_y as f64;
    let size_y_end = height - (notch + h * ny_small as f64 / 2.0);
    let dy_end = size_y_end / ny as f64;
    let nely = n_start_y + ny_small + ny;
    let x_small = h * nx_small as f64;
    let size_x_end = length / 2.0 - h * nx_small as f64;
    let dx_end = size_x_end / nx as f64;
    let nelx = nx + nx_small;

    let mut nodes = Vec::new();
    for i in 0..=nelx {
        let mut y = 0.0;
        for j in 0..=nely {
            let x = if i <= nx_small { i as f64 * h } else { x_small + (i - nx_small) as f64 * dx_end };
            nodes.push([x, y]);
            if j < n_start_y {
                y += dy_start;
            } else if j < n_start_y + ny_small {
                y += h;
            } else {
                y += dy_end;
            }
        }
    }
    let mut elements = Vec::new();
    for i in 0..nelx {
        for j in 0..nely {
            let n1 = i * (nely + 1) + j;
            let n3 = n1 + nely + 1;
            elements.push([n1, n3, n3 + 1, n1 + 1]);
        }
    }
    let original = nodes.len();
    let mut map = vec![0usize; original];
    for i in 0..original {
        let [x, y] = nodes[i];
        if x.abs() > 1e-8 {
            map[i] = nodes.len();
            nodes.push([-x, y]);
        } else if y < notch - 1e-8 {
            map[i] = nodes.len();
            nodes.push([x, y]);
        } else {
            map[i] = i;
        }
    }
    mirror_elements(&mut elements, &map);
    Mesh { nodes, elements }
}

fn mirror_elements(elements: &mut Vec<[usize; 4]>, map: &[usize]) {
    let original = elements.len();
    for e in 0..original {
        let [a, b, c, d] = elements[e];
        elements.push([map[d], map[c], map[b], map[a]]);
    }
}
