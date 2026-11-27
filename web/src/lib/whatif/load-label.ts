/** How "What if?" names a load of the model: its type and magnitude, and the member or node it is on. */
import { planeDistributedLoad, planeGlobalValue, twoD } from '../axes/display';
import { userVecParts } from '../axes/user-names';
import { t } from '../i18n';
import { fmtQ, unitQ } from '../store/display-units.svelte';
import type { Quantity } from '../utils/units';
import type { Load } from '../store/model.svelte';
import {
  TWO_D_NODAL_LOAD_LABELS, get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical,
} from '../geometry/coordinate-system';

/** A load value in the chosen unit system, with its unit: the model keeps kN, kN/m and kN·m. */
const q = (v: number, k: Quantity) => `${fmtQ(v, k)} ${unitQ(k)}`;
const F = (v: number) => q(v, 'force');
const M = (v: number) => q(v, 'moment');

export function loadLabel(l: Load | undefined, i: number): string {
  if (!l) return t('whatif.loadFallback').replace('{n}', String(i + 1));
  if (l.type === 'nodal') {
    const d = l.data as { nodeId: number; fx: number; fz?: number; fy?: number; my?: number; mz?: number };
    const parts: string[] = [];
    if (d.fx) parts.push(`${TWO_D_NODAL_LOAD_LABELS.horizontal}=${F(twoD.x(d.fx))}`);
    if (get2DDisplayNodalLoadVertical(d)) parts.push(`${TWO_D_NODAL_LOAD_LABELS.vertical}=${F(twoD.z(get2DDisplayNodalLoadVertical(d)))}`);
    if (get2DDisplayNodalLoadMoment(d)) parts.push(`${TWO_D_NODAL_LOAD_LABELS.moment}=${M(twoD.rot(get2DDisplayNodalLoadMoment(d)))}`);
    return parts.length ? `${parts.join(', ')} (N${d.nodeId})` : t('whatif.nodalFallback').replace('{n}', String(i + 1));
  }
  if (l.type === 'distributed') {
    const d = l.data;
    const { qI, qJ } = planeDistributedLoad(d.qI, d.qJ, d.angle ?? 0, !!d.isGlobal);
    return `${qI === qJ ? `q=${q(qI, 'distributedLoad')}` : `q=${fmtQ(qI, 'distributedLoad')}→${q(qJ, 'distributedLoad')}`} (B${d.elementId})`;
  }
  if (l.type === 'pointOnElement') {
    // A point load on a member may be a force, an axial force, a moment, or any mix.
    const d = l.data as { p: number; px?: number; my?: number; mz?: number; elementId: number; isGlobal?: boolean };
    const m = d.my ?? d.mz;
    const parts: string[] = [];
    if (d.p) parts.push(`P=${F(d.isGlobal ? planeGlobalValue(d.p) : d.p)}`);
    if (d.px) parts.push(`Px=${F(d.px)}`);
    if (m) parts.push(`${TWO_D_NODAL_LOAD_LABELS.moment}=${M(twoD.rot(m))}`);
    return `${parts.join(', ') || 'P=0'} (B${d.elementId})`;
  }
  if (l.type === 'thermal') return t('whatif.thermal');
  if (l.type === 'nodal3d') {
    const d = l.data as { nodeId: number; fx: number; fy: number; fz: number; mx?: number; my?: number; mz?: number };
    const parts: string[] = [];
    for (const c of userVecParts('F', [d.fx, d.fy, d.fz])) if (c.value) parts.push(`${c.name}=${F(c.value)}`);
    for (const c of userVecParts('M', [d.mx ?? 0, d.my ?? 0, d.mz ?? 0], true)) if (c.value) parts.push(`${c.name}=${M(c.value)}`);
    return parts.length ? `${parts.join(', ')} (N${d.nodeId})` : `N${d.nodeId}`;
  }
  if (l.type === 'distributed3d') {
    const d = l.data;
    const components = (end: 'I' | 'J') => {
      const v: [number, number, number] = [d[`qX${end}`] ?? 0, d[`qY${end}`], d[`qZ${end}`]];
      return d.frame && d.frame !== 'local' ? userVecParts('q', v)
        : v.map((value, i) => ({ name: `q${'xyz'[i]}`, value }));
    };
    const end = components('J');
    const parts = components('I').flatMap(({ name, value }, i) => {
      const other = end[i]!.value;
      if (!value && !other) return [];
      const range = value === other ? '' : `${fmtQ(value, 'distributedLoad')}→`;
      return [`${name}=${range}${q(other, 'distributedLoad')}`];
    });
    return `${parts.join(', ') || `q=${q(0, 'distributedLoad')}`} (B${d.elementId})`;
  }
  if (l.type === 'pointOnElement3d') {
    const d = l.data as { elementId: number; frame?: string; px?: number; py: number; pz: number; mx?: number; my?: number; mz?: number };
    const parts: string[] = [];
    const global = d.frame === 'global';
    const forces = global ? userVecParts('P', [d.px ?? 0, d.py, d.pz]) : (['x', 'y', 'z'] as const).map((a) => ({ name: `P${a}`, value: d[`p${a}`] ?? 0 }));
    const moments = global ? userVecParts('M', [d.mx ?? 0, d.my ?? 0, d.mz ?? 0], true) : (['x', 'y', 'z'] as const).map((a) => ({ name: `M${a}`, value: d[`m${a}`] ?? 0 }));
    for (const c of forces) if (c.value) parts.push(`${c.name}=${F(c.value)}`);
    for (const c of moments) if (c.value) parts.push(`${c.name}=${M(c.value)}`);
    return `${parts.join(', ') || 'P=0'} (B${d.elementId})`;
  }
  if (l.type === 'prestress3d') return `${t('loads.prestress')} P=${F(l.data.force as number)} (B${l.data.elementId})`;
  if (l.type === 'displacement3d') return `${t('loads.imposedDisplacement')} (N${l.data.nodeId})`;
  // A triangle's load names it by quadId too, with `on: 'plate'`.
  const shell = (data: unknown) => {
    const d = data as { quadId: number; on?: 'plate' };
    return t(d.on === 'plate' ? 'results.plateLabel' : 'results.quadLabel').replace('{id}', String(d.quadId));
  };
  if (l.type === 'surface3d') return `q=${q((l.data as { q: number }).q, 'areaLoad')} (${shell(l.data)})`;
  if (l.type === 'thermalQuad3d') return `${t('whatif.thermal')} (${shell(l.data)})`;
  return t('whatif.loadFallback').replace('{n}', String(i + 1));
}
