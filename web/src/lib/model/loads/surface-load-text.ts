/**
 * A surface load in words, for the load table and the report: the shell it is on, where it
 * points, how it varies and where it acts. The numbers are in SI as the model keeps them.
 */
import { t, tp } from '../../i18n';
import type { SurfaceLoad3D } from '../../store/model.svelte';

const AXES = ['X', 'Y', 'Z'] as const;
const n = (v: number) => String(+v.toFixed(3));

/** A unit direction as an axis when it is one (−Z), else as its components. */
export function directionText(d: readonly number[]): string {
  const i = d.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-9);
  if (i >= 0) return `${d[i]! < 0 ? '−' : '+'}${AXES[i]}`;
  return `(${d.map((v) => n(v)).join(', ')})`;
}

/** The shell a load is on: a quad or a triangle, by id. */
export const shellText = (d: Pick<SurfaceLoad3D, 'quadId' | 'on'>) => tp(d.on === 'plate' ? 'loads.surface.onPlate' : 'loads.surface.onQuad', { id: d.quadId });

/** The value or values of a load: q, q per corner, or q₁…q₂. */
export function surfaceValueText(d: SurfaceLoad3D): string {
  if (d.qNodes) return `[${d.qNodes.map(n).join(', ')}]`;
  if (d.vary) return `${n(d.vary.q1)} … ${n(d.vary.q2)}`;
  return n(d.q);
}

/** Where it points, how it varies and where it acts; empty for a plain downward load. */
export function surfaceHowText(d: SurfaceLoad3D): string {
  const parts: string[] = [];
  if (d.frame === 'local') parts.push(t('loads.surface.local'));
  else if (d.frame === 'global') parts.push(tp('loads.surface.global', { dir: directionText(d.dir ?? [0, 0, -1]) }));
  else if (d.frame === 'projected') parts.push(tp('loads.surface.projected', { dir: directionText(d.dir ?? [0, 0, -1]) }));
  if (d.qNodes) parts.push(t('loads.surface.byCorner'));
  if (d.vary) parts.push(tp('loads.surface.vary', { dir: directionText(d.vary.dir), c1: n(d.vary.c1), c2: n(d.vary.c2) }));
  if (d.region) parts.push(d.region.holes?.length ? tp('loads.surface.regionHoles', { n: d.region.holes.length }) : t('loads.surface.region'));
  if (d.fromDef !== undefined) parts.push(tp('loads.surface.fromDef', { id: d.fromDef }));
  return parts.join(' · ');
}
