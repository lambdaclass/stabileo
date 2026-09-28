/**
 * A plane model, shown standing in the space workspace, becomes a space model
 * — the first time it is edited there.
 *
 * ── The defect ─────────────────────────────────────────────────────
 *
 * A plane model stores its vertical in `y` (z = 0). The space workspace shows
 * it standing in the X–Z plane for as long as it stays flat, by reading each
 * `y` as a height. The first node added there switched the reading: the node
 * came in with space coordinates (its `y` a depth), the workspace stopped
 * projecting, and every existing `y` became a depth too — a three-storey
 * frame lay down on the X–Y plane. Back in 2D it looked right again, because
 * the plane view reads `y` as a height, while the new node sat somewhere that
 * meant nothing in either.
 *
 * ── The fix ────────────────────────────────────────────────────────
 *
 * Before the first edit that makes the model a space one (a node, a move, a
 * space support or load), the model is rewritten in space coordinates exactly
 * as it is shown: (x, y) → (x, 0, y). Its conditions are rewritten with the
 * very mapping the space solve already applies to an embedded plane model —
 * `buildSolverLoads3D` for the loads, the embedded support table for the
 * supports — so the structure, and its results, do not change. The edit then
 * lands in the coordinates it was made in. Going back to 2D is then what it
 * should be: a model with depth, which the 2D switch asks how to bring.
 */
import type { Element, Load, Support } from './model.svelte';
import { EMBED_XZ_DOF_PERMUTATION } from '../engine/expand-joints-3d';
import { buildSolverLoads3D, shouldEmbedFlat2DModelIn3D, type ModelData } from '../engine/solver-service';

type Dofs = { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean };

/** The embedded-plane support table of buildSolverInput3D, as model restraints. */
function planeSupportDofs(type: string): Dofs {
  switch (type) {
    case 'fixed': return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
    case 'pinned': return { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true };
    case 'rollerX': return { tx: false, ty: true, tz: true, rx: true, ry: false, rz: true };
    case 'rollerY':
    case 'rollerZ': return { tx: true, ty: true, tz: false, rx: true, ry: false, rz: true };
    case 'spring': return { tx: false, ty: true, tz: false, rx: true, ry: false, rz: true };
    default: return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
  }
}

const PLANE_SUPPORTS = new Set(['fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'spring']);

/** True when the model is a plane model the space workspace is showing standing up. */
export function isStandingPlaneModel(model: ModelData): boolean {
  return shouldEmbedFlat2DModelIn3D(model);
}

/**
 * Rewrite a standing plane model in space coordinates, in place. Returns
 * whether anything was rewritten. `nextLoadId` hands out ids for loads that
 * split (an inclined load's axial part becomes nodal forces, as in the solve).
 */
export function materializeStandingPlaneModel(model: ModelData, nextLoadId: () => number): boolean {
  if (!isStandingPlaneModel(model)) return false;

  // Loads first, while the geometry is still the plane one the mapping reads.
  const loads: Load[] = [];
  for (const l of model.loads) {
    const caseId = (l.data as { caseId?: number }).caseId;
    const origId = (l.data as { id?: number }).id;
    const wire = buildSolverLoads3D(model, [l], false, false);
    wire.forEach((w, k) => {
      const id = k === 0 && origId !== undefined ? origId : nextLoadId();
      const c = caseId !== undefined ? { caseId } : {};
      const d = w.data as unknown as Record<string, number>;
      switch (w.type) {
        case 'nodal':
          loads.push({ type: 'nodal3d', data: { id, nodeId: d.nodeId, fx: d.fx, fy: d.fy, fz: d.fz, mx: d.mx, my: d.my, mz: d.mz, ...c } } as Load);
          break;
        case 'distributed':
          loads.push({ type: 'distributed3d', data: { id, elementId: d.elementId, qYI: d.qYI, qYJ: d.qYJ, qZI: d.qZI, qZJ: d.qZJ, ...(d.a !== undefined ? { a: d.a } : {}), ...(d.b !== undefined ? { b: d.b } : {}), ...c } } as Load);
          break;
        case 'pointOnElement':
          loads.push({ type: 'pointOnElement3d', data: { id, elementId: d.elementId, a: d.a, py: d.py, pz: d.pz, ...c } } as Load);
          break;
        case 'thermal':
          // The space mapping sends ΔTg as −dtGradientZ; the model keeps ΔTg.
          loads.push({ type: 'thermal', data: { id, elementId: d.elementId, dtUniform: d.dtUniform, dtGradient: -(d.dtGradientZ ?? 0), ...c } } as Load);
          break;
        default:
          break;
      }
    });
  }

  const supports = new Map<number, Support>();
  for (const [id, s] of model.supports) {
    if (!PLANE_SUPPORTS.has(s.type) || s.dofRestraints) { supports.set(id, s); continue; }
    const dofRestraints = planeSupportDofs(s.type);
    const all = Object.values(dofRestraints).every(Boolean);
    const next: Support = {
      id: s.id,
      nodeId: s.nodeId,
      type: all ? 'fixed3d' : (s.type === 'spring' ? 'spring3d' : 'custom3d'),
      dofRestraints,
      dofFrame: 'global',
    } as Support;
    if (s.type === 'spring') {
      if (s.kx) next.kx = s.kx;
      if (s.ky) next.kz = s.ky;                       // the plane's vertical spring
      const rot = s.kry ?? s.kz;                      // the plane's rotational spring
      if (rot) next.kry = rot;
    }
    if (s.dx) next.dx = s.dx;
    const dz = s.dz ?? s.dy;
    if (dz) next.dz = dz;
    const dry = s.dry ?? s.drz;
    if (dry) next.dry = dry;
    supports.set(id, next);
  }

  /*
   * Members: the plane's hinge is stored as `mz`, and the embedded solve
   * releases the in-plane moment for it — My in space. A space model reads
   * `mz` as Mz, the out-of-plane one, so it moves to `my`. A 3D joint mask is
   * permuted exactly as the embedded solve permutes it.
   */
  const perm = EMBED_XZ_DOF_PERMUTATION;
  const joint = (j: Element['jointI']) => (j ? { dof: j.dof.map((_, k) => j.dof[perm[k]]) as typeof j.dof } : j);
  model.elements = new Map([...model.elements].map(([id, e]) => [id, {
    ...e,
    releaseI: { ...e.releaseI, my: e.releaseI?.mz === true, mz: false },
    releaseJ: { ...e.releaseJ, my: e.releaseJ?.mz === true, mz: false },
    ...(e.jointI ? { jointI: joint(e.jointI) } : {}),
    ...(e.jointJ ? { jointJ: joint(e.jointJ) } : {}),
  }]));

  model.nodes = new Map([...model.nodes].map(([id, n]) => [id, { ...n, y: 0, z: n.y }]));
  model.supports = supports;
  model.loads = loads;
  return true;
}
