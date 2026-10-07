/**
 * The loads the write card's slab form describes (`ProShellLoadForm.svelte`), on the shells picked,
 * or why it describes none: an area load with its direction, its field and its extent; a fluid to a
 * level; a force at a point.
 *
 * The numbers are read by the app's one rule (`write-load.ts`): a field that does not read as a
 * number refuses the add (`pro.loadUnreadable`) instead of becoming a zero or a default. A blank
 * value is 0 (a force component, a point's coordinate, a pressure at one end of a variation, a
 * corner of a list), and a blank datum the load cannot do without (γ, the level, a coordinate of
 * a variation or of the rectangle) is asked for. A list by corner has exactly one value per corner:
 * "5; 6O; 7; 9" on a triangle used to drop the unreadable value and apply 5, 7, 9 to the three
 * corners. The point inside a fluid is all three coordinates or none.
 *
 * What comes back is i18n keys and their values, as every refusal of the card (`WriteRefusal`).
 *
 * Pure: the caller adds what comes back in one undo step.
 */
import { parseDecimal } from '../../utils/numeric-input';
import { hydrostaticSurfaceLoads, shellPointNodalLoads, type ShellRef } from './shell-load-tools';
import type { WriteOutcome, WriteRefusal } from './write-load';
import type { Load, SurfaceLoad3D } from '../../store/model.svelte';
import type { Vec3 } from '../../engine/shell-load-integration';

export type ShellLoadKind = 'surface' | 'hydro' | 'shellPoint';
type Axis = 'X' | 'Y' | 'Z';

export interface ShellLoadFields {
  dirMode: 'down' | 'local' | 'global' | 'projected';
  dirAxis: Axis;
  field: 'uniform' | 'corners' | 'axis';
  q: string;
  /** Values by corner, separated by semicolons. */
  qc: string;
  va: { axis: Axis; c1: string; q1: string; c2: string; q2: string };
  partial: boolean;
  rect: { plane: 'XY' | 'XZ' | 'YZ'; u1: string; v1: string; u2: string; v2: string };
  gamma: string;
  level: string;
  inside: { x: string; y: string; z: string };
  at: { x: string; y: string; z: string };
  pf: { fx: string; fy: string; fz: string };
}

const AXIS: Record<Axis, Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const UNREADABLE: WriteRefusal = { error: 'pro.loadUnreadable' };
const ZERO: WriteRefusal = { error: 'writeLoad.zero' };

/** A field typed that does not read as a number. */
const unreadable = (s: string) => s.trim() !== '' && parseDecimal(s) === null;
/** A field's number, blank is 0. Read once none is unreadable. */
const num = (s: string): number => (s.trim() === '' ? 0 : parseDecimal(s) ?? 0);
/** A field's number, or null when it is blank. */
const opt = (s: string): number | null => (s.trim() === '' ? null : parseDecimal(s));

/** The fields of `kind` the form shows, the ones read. */
function fieldsRead(kind: ShellLoadKind, f: ShellLoadFields): string[] {
  if (kind === 'shellPoint') return [f.at.x, f.at.y, f.at.z, f.pf.fx, f.pf.fy, f.pf.fz];
  if (kind === 'hydro') return [f.gamma, f.level, f.inside.x, f.inside.y, f.inside.z];
  const out = f.field === 'uniform' ? [f.q] : f.field === 'corners' ? cornerTexts(f.qc) : [f.va.c1, f.va.q1, f.va.c2, f.va.q2];
  if (f.partial) out.push(f.rect.u1, f.rect.v1, f.rect.u2, f.rect.v2);
  return out;
}

/** The entries of a list by corner; one separator after the last value closes the list. */
const cornerTexts = (s: string): string[] => s.trim().replace(/;\s*$/, '').split(';');

/** A refusal naming shells: q for a quad, p for a triangle, as the shell tabs number them. */
const naming = (shells: readonly ShellRef[]) => shells.map((s) => `${s.on ? 'p' : 'q'}${s.id}`).join(', ');

/** The loads the form describes, on the shells picked; a reason when it describes none. */
export function buildShellLoads(kind: ShellLoadKind, f: ShellLoadFields, shells: readonly ShellRef[], caseId: number | undefined): WriteOutcome | WriteRefusal {
  if (!shells.length) return { error: 'writeLoad.noTarget' };
  if (fieldsRead(kind, f).some(unreadable)) return UNREADABLE;
  const c = caseId !== undefined ? { caseId } : {};

  if (kind === 'shellPoint') {
    const F: Vec3 = [num(f.pf.fx), num(f.pf.fy), num(f.pf.fz)];
    if (F.every((v) => v === 0)) return ZERO;
    const nodal = shellPointNodalLoads(shells, [num(f.at.x), num(f.at.y), num(f.at.z)], F);
    if (!nodal) return { error: 'writeLoad.shell.pointOutside' };
    return { loads: nodal.map((n) => ({ type: 'nodal3d', data: { id: 0, ...n, ...c } }) as Load) };
  }

  if (kind === 'hydro') {
    const g = opt(f.gamma), z = opt(f.level);
    if (g === null || g === 0 || z === null) return { error: 'writeLoad.shell.hydroIncomplete' };
    const pt = [opt(f.inside.x), opt(f.inside.y), opt(f.inside.z)];
    const given = pt.filter((v) => v !== null).length;
    if (given !== 0 && given !== 3) return { error: 'writeLoad.shell.insideIncomplete' };
    const r = hydrostaticSurfaceLoads(shells, g, z, given === 3 ? (pt as Vec3) : undefined);
    if ('refused' in r) return { error: 'writeLoad.shell.hydroSideUnknown', params: { list: naming(r.shells) } };
    if (!r.loads.length) return { error: 'writeLoad.shell.hydroNothing' };
    return { loads: r.loads.map((l) => ({ type: 'surface3d', data: { id: 0, ...l, ...c } }) as Load) };
  }

  const extra: Partial<SurfaceLoad3D> = {};
  if (f.dirMode !== 'down') extra.frame = f.dirMode;
  if (f.dirMode === 'global' || f.dirMode === 'projected') extra.dir = AXIS[f.dirAxis];
  let qv = 0;
  if (f.field === 'uniform') {
    qv = num(f.q);
    if (qv === 0) return ZERO;
  } else if (f.field === 'corners') {
    // One value per corner, exactly: three on a triangle, four on a quad, a blank one 0.
    if (f.qc.trim() === '') return { error: 'writeLoad.shell.cornersIncomplete' };
    const vals = cornerTexts(f.qc).map(num);
    const counts = new Set(shells.map((s) => s.pts.length));
    if (counts.size > 1) return { error: 'writeLoad.shell.cornersMixed' };
    if (!counts.has(vals.length)) return { error: 'writeLoad.shell.cornersIncomplete' };
    if (vals.every((v) => v === 0)) return ZERO;
    extra.qNodes = vals;
  } else {
    const [c1, c2] = [opt(f.va.c1), opt(f.va.c2)];
    const [q1, q2] = [num(f.va.q1), num(f.va.q2)];
    if (c1 === null || c2 === null || c1 === c2) return { error: 'writeLoad.shell.varyIncomplete' };
    if (q1 === 0 && q2 === 0) return ZERO;
    extra.vary = { dir: AXIS[f.va.axis], c1, q1, c2, q2 };
  }
  if (f.partial) {
    // The rectangle as a region: its plane's two axes, projected along the third.
    const { plane } = f.rect;
    const [u1, v1, u2, v2] = [opt(f.rect.u1), opt(f.rect.v1), opt(f.rect.u2), opt(f.rect.v2)];
    if (u1 === null || v1 === null || u2 === null || v2 === null || u1 === u2 || v1 === v2) return { error: 'writeLoad.shell.rectIncomplete' };
    const put = (u: number, v: number): Vec3 => (plane === 'XY' ? [u, v, 0] : plane === 'XZ' ? [u, 0, v] : [0, u, v]);
    const normal: Vec3 = plane === 'XY' ? [0, 0, 1] : plane === 'XZ' ? [0, 1, 0] : [1, 0, 0];
    extra.region = { normal, points: [put(u1, v1), put(u2, v1), put(u2, v2), put(u1, v2)] };
  }
  return {
    loads: shells.map((s) => ({
      type: 'surface3d',
      data: { id: 0, quadId: s.id, ...(s.on ? { on: s.on } : {}), q: qv, ...extra, ...(extra.qNodes ? { qNodes: [...extra.qNodes] } : {}), ...c },
    }) as Load),
  };
}
