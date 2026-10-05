/**
 * Whether a wind case may also enter a combination with the opposite sign.
 *
 * Reversing a case by sign stands for the wind blowing the other way. That is exact for a case
 * of horizontal forces — a lateral wind on the storeys, or on the columns of a façade — and wrong
 * for one that pushes vertically anywhere: roof suction times −1 is roof pressure, a pattern the
 * code never prescribes, and the regulation generator makes the other direction as a case of its
 * own (`wind-cases.ts`). So a case is reversible when every load in it acts horizontally.
 *
 * What decides is the direction a load acts in, not how it was entered: a line load on a column
 * is horizontal whichever local axis carries it, and one along a beam's local z is vertical.
 * An area load acts along global −Z, so a case holding one is never reversible.
 */
import { shouldEmbedFlat2DModelIn3D, type ModelData } from '../engine/solver-service';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { projectNodeToScene } from '../geometry/coordinate-system';

/** Vertical component allowed, relative to the load's own size. */
const REL_TOL = 1e-6;

type V3 = [number, number, number];

export function windCaseReversible(model: ModelData, caseId: number): boolean {
  const loads = model.loads.filter((l) => ((l.data as { caseId?: number }).caseId ?? 1) === caseId);
  if (loads.length === 0) return false;
  const embed = shouldEmbedFlat2DModelIn3D(model);
  return loads.every((l) => actsHorizontally(model, l, embed));
}

const horizontal = (v: V3) => Math.abs(v[2]) <= REL_TOL * Math.hypot(v[0], v[1], v[2]) + 1e-12;

function axesOf(model: ModelData, elementId: number, embed: boolean) {
  const e = model.elements.get(elementId);
  const ni = e && model.nodes.get(e.nodeI), nj = e && model.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return null;
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  const roll = (e.rollAngle ?? 0) + (model.sections.get(e.sectionId)?.rotation ?? 0);
  try {
    return computeLocalAxes3D({ id: e.nodeI, ...projectNodeToScene(ni, embed) }, { id: e.nodeJ, ...projectNodeToScene(nj, embed) }, localY, roll);
  } catch {
    return null;
  }
}

/** The global vector of a 3D member load given by its local y and z components. */
function local3D(model: ModelData, elementId: number, embed: boolean, y: number, z: number): V3 | null {
  const ax = axesOf(model, elementId, embed);
  if (!ax) return null;
  return [0, 1, 2].map((k) => ax.ey[k]! * y + ax.ez[k]! * z) as V3;
}

/** The vertical share of a plane member load: θ the member's angle, a the load's. */
function plane2DVertical(model: ModelData, elementId: number, angleDeg: number, isGlobal: boolean): number | null {
  const e = model.elements.get(elementId);
  const ni = e && model.nodes.get(e.nodeI), nj = e && model.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return null;
  const a = (angleDeg * Math.PI) / 180;
  if (isGlobal) return Math.cos(a);
  return Math.cos(Math.atan2(nj.y - ni.y, nj.x - ni.x) - a);
}

function actsHorizontally(model: ModelData, l: ModelData['loads'][number], embed: boolean): boolean {
  const d = l.data as unknown as Record<string, number | boolean | undefined>;
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : 0);
  switch (l.type) {
    case 'nodal3d': return horizontal([n('fx'), n('fy'), n('fz')]);
    // A plane model's vertical is its second component (fz, or fy in older files).
    case 'nodal': return Math.abs(d.fz !== undefined ? n('fz') : n('fy')) <= REL_TOL * Math.hypot(n('fx'), n('fz'), n('fy')) + 1e-12;
    case 'distributed3d': {
      const id = n('elementId');
      const ends = [local3D(model, id, embed, n('qYI'), n('qZI')), local3D(model, id, embed, n('qYJ'), n('qZJ'))];
      return ends.every((v) => v !== null && horizontal(v));
    }
    case 'pointOnElement3d': {
      if (d.frame === 'global') return horizontal([n('px'), n('py'), n('pz')]);
      const ax = axesOf(model, n('elementId'), embed);
      const v = local3D(model, n('elementId'), embed, n('py'), n('pz'));
      return v !== null && !!ax && horizontal([0, 1, 2].map((k) => v[k]! + ax.ex[k]! * n('px')) as V3);
    }
    case 'distributed':
    case 'pointOnElement': {
      const vertical = plane2DVertical(model, n('elementId'), n('angle'), d.isGlobal === true);
      return vertical !== null && Math.abs(vertical) <= REL_TOL;
    }
    default:
      // Area loads act along global −Z; thermal and anything else are not wind to reverse.
      return false;
  }
}
