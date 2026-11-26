use super::*;

// Bound the additional retained storage; larger models keep the original assembler.
const MAX_REFERENCE_BYTES: usize = 8 * 1024 * 1024;

struct Member<'a> {
    elem: &'a SolverElement3D,
    node_i: &'a SolverNode3D,
    node_j: &'a SolverNode3D,
    sec: &'a SolverSection3D,
    e: f64,
    g: f64,
    phi_y: f64,
    phi_z: f64,
    reference: Option<FrameReference3D>,
}

#[cfg(test)]
#[path = "prepared_3d/tests.rs"]
mod tests;

pub(super) struct PreparedCorotational3D<'a> {
    members: Vec<Member<'a>>,
}

fn fits_budget(count: usize) -> bool {
    // At most 14 DOFs and a 12x12 elastic matrix per member, including Vec headers.
    let bytes = std::mem::size_of::<Member<'_>>()
        + 14 * std::mem::size_of::<usize>()
        + 144 * std::mem::size_of::<f64>();
    count
        .checked_mul(bytes)
        .is_some_and(|n| n <= MAX_REFERENCE_BYTES)
}

impl<'a> PreparedCorotational3D<'a> {
    pub(super) fn new(
        input: &'a SolverInput3D,
        dofs: &DofNumbering,
        left_hand: bool,
    ) -> Option<Self> {
        if !fits_budget(input.elements.len()) {
            return None;
        }
        let nodes: std::collections::HashMap<_, _> = crate::ordered::values(&input.nodes)
            .map(|n| (n.id, n))
            .collect();
        let materials: std::collections::HashMap<_, _> = crate::ordered::values(&input.materials)
            .map(|m| (m.id, m))
            .collect();
        let sections: std::collections::HashMap<_, _> = crate::ordered::values(&input.sections)
            .map(|s| (s.id, s))
            .collect();
        let mut members = Vec::with_capacity(input.elements.len());
        // Keep the original key order, including duplicate contribution order.
        for elem in crate::ordered::values(&input.elements) {
            let (node_i, node_j, mat, sec) = (
                nodes[&elem.node_i],
                nodes[&elem.node_j],
                materials[&elem.material_id],
                sections[&elem.section_id],
            );
            let e = mat.e * 1000.0;
            let g = e / (2.0 * (1.0 + mat.nu));
            let (mut phi_y, mut phi_z) = (0.0, 0.0);
            let reference = if elem.elem_type == "truss" || elem.elem_type == "cable" {
                None
            } else {
                let dx = node_j.x - node_i.x;
                let dy = node_j.y - node_i.y;
                let dz = node_j.z - node_i.z;
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                if sec.as_y.is_some() || sec.as_z.is_some() {
                    let l2 = l * l;
                    phi_y = sec
                        .as_y
                        .map(|ay| {
                            if ay > 0.0 {
                                12.0 * e * sec.iy / (g * ay * l2)
                            } else {
                                0.0
                            }
                        })
                        .unwrap_or(0.0);
                    phi_z = sec
                        .as_z
                        .map(|az| {
                            if az > 0.0 {
                                12.0 * e * sec.iz / (g * az * l2)
                            } else {
                                0.0
                            }
                        })
                        .unwrap_or(0.0);
                }
                let elem_dofs = dofs.element_dofs(elem.node_i, elem.node_j);
                if elem_dofs.len() < 12 {
                    None
                } else {
                    // Only model-invariant quantities. Current-length, finite-state and
                    // convergence checks remain in the shared evaluation/solver path.
                    let (yx, yy, yz) = corot_local_y_ref(
                        node_i.x,
                        node_i.y,
                        node_i.z,
                        node_j.x,
                        node_j.y,
                        node_j.z,
                        elem.local_yx,
                        elem.local_yy,
                        elem.local_yz,
                    );
                    Some(FrameReference3D {
                        chord: (dx, dy, dz, l),
                        dofs: elem_dofs,
                        axes: compute_local_axes_3d(
                            node_i.x,
                            node_i.y,
                            node_i.z,
                            node_j.x,
                            node_j.y,
                            node_j.z,
                            yx,
                            yy,
                            yz,
                            elem.roll_angle,
                            left_hand,
                        ),
                        stiffness: frame_local_stiffness_3d(
                            e,
                            sec.a,
                            sec.iy,
                            sec.iz,
                            sec.j,
                            l,
                            g,
                            Hinge3D::from_elem(elem),
                            phi_y,
                            phi_z,
                        ),
                    })
                }
            };
            members.push(Member {
                elem,
                node_i,
                node_j,
                sec,
                e,
                g,
                phi_y,
                phi_z,
                reference,
            });
        }
        Some(Self { members })
    }

    pub(super) fn assemble(
        &self,
        dofs: &DofNumbering,
        u: &[f64],
        forces: &mut [f64],
        scatter: &mut impl FnMut(usize, usize, f64),
        left_hand: bool,
    ) {
        for m in &self.members {
            if m.elem.elem_type == "truss" || m.elem.elem_type == "cable" {
                assemble_truss_corotational_3d(
                    dofs, m.elem, m.node_i, m.node_j, m.e, m.sec.a, u, forces, scatter,
                );
            } else {
                assemble_frame_corotational_3d_prepared(
                    dofs,
                    m.elem,
                    m.node_i,
                    m.node_j,
                    m.e,
                    m.sec.a,
                    m.sec.iy,
                    m.sec.iz,
                    m.sec.j,
                    m.g,
                    m.phi_y,
                    m.phi_z,
                    u,
                    forces,
                    scatter,
                    left_hand,
                    m.reference.as_ref(),
                );
            }
        }
    }
}
