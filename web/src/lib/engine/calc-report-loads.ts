/**
 * The components of a load, as the calc report's load list names them.
 *
 * Every non-zero component, named by its axis, to four significant figures. Kept out of the
 * dialog so it can be read against the store's own field names: a 2D nodal load is stored as
 * fx, fz, my (fy and mz are legacy aliases, and `addNodalLoad` writes neither), and reading the
 * aliases reported a 10 kN load with a 5 kN·m moment as no load at all.
 */

import { toDisplay, unitLabel, type Quantity, type UnitSystem } from '../utils/units';
import { planeGlobalAngle, planeGlobalValue, twoD, userRot, userVec } from '../axes/display';

/** Four significant figures, and never «-0». */
export function reportNumber(v: number): string {
  const r = +Number(v).toPrecision(4);
  return Object.is(r, -0) ? '0' : String(r);
}

const nonZero = (v: number | undefined): v is number => v !== undefined && Math.abs(v) > 1e-12;

/*
 * Every value is converted to the unit system the report is written in. The
 * zero test is made on the stored SI value, so what counts as «no load» does
 * not depend on the units it is read in.
 */
const val = (v: number, q: Quantity, us: UnitSystem) => reportNumber(toDisplay(v, q, us));

type Component = [name: string, value: number | undefined, q: Quantity];

const named = (comps: Component[], us: UnitSystem) =>
  comps.filter(([, v]) => nonZero(v)).map(([k, v, q]) => `${k}=${val(v!, q, us)} ${unitLabel(q, us)}`);

/**
 * A line load from I to J, kept when EITHER end carries load: a triangular load starting at
 * zero (0 → 5) is a load. A missing J end reads as uniform.
 */
function line(axis: string, i: number | undefined, j: number | undefined, us: UnitSystem): string[] {
  const at = { i: i ?? 0, j: j ?? i ?? 0 };
  const q = (v: number) => val(v, 'distributedLoad', us);
  return nonZero(at.i) || nonZero(at.j) ? [`q${axis}=${q(at.i)} → ${q(at.j)} ${unitLabel('distributedLoad', us)}`] : [];
}

/**
 * Where a partial line load sits, measured from node I: «, a=1 m, b=2 m». Without it a load on
 * one metre of a six-metre member reads as covering all six. A start with no end runs to the
 * end of the member (`b=L`); a load with neither is full-length and says nothing.
 */
function range(d: { a?: number; b?: number }, us: UnitSystem): string {
  if (d.a === undefined && d.b === undefined) return '';
  const len = (v: number) => `${val(v, 'length', us)} ${unitLabel('length', us)}`;
  return `, a=${len(d.a ?? 0)}, b=${d.b !== undefined ? len(d.b) : 'L'}`;
}

/** The words a 2D member load needs from the caller's language: the engine holds no prose. */
export interface MemberLoadWords { global: string }

/** «, θ=30°» when the load is turned from its base direction, and the axes when they are global. */
function direction(d: { angle?: number; isGlobal?: boolean }, words: MemberLoadWords): string {
  const angle = d.isGlobal && d.angle !== undefined ? planeGlobalAngle(d.angle) + 0 : d.angle;
  return (nonZero(angle) ? `, θ=${reportNumber(angle)}°` : '') + (d.isGlobal ? `, ${words.global}` : '');
}

const shownGlobal = (v: number | undefined, isGlobal?: boolean) => (v !== undefined && isGlobal ? planeGlobalValue(v) + 0 : v);

/**
 * A 2D line load: both ends, its range when partial, its angle and its axes. The angle and the
 * axes change what the numbers mean, so a report that drops them reports a different load.
 */
export function distributedText(
  d: { qI: number; qJ?: number; a?: number; b?: number; angle?: number; isGlobal?: boolean },
  words: MemberLoadWords,
  us: UnitSystem = 'SI',
): string {
  const q = (v: number) => val(v, 'distributedLoad', us);
  return `q=${q(shownGlobal(d.qI, d.isGlobal)!)} → ${q(shownGlobal(d.qJ ?? d.qI, d.isGlobal)!)} ${unitLabel('distributedLoad', us)}${range(d, us)}${direction(d, words)}`;
}

/**
 * A 2D point load on a member: P, and the axial force and moment it may carry with it (the
 * moment under its legacy alias for old data), then where it sits. '' when every component is
 * zero, which the caller says in words.
 */
export function pointOnElementText(
  d: { a: number; p: number; px?: number; my?: number; mz?: number; angle?: number; isGlobal?: boolean },
  words: MemberLoadWords,
  us: UnitSystem = 'SI',
): string {
  const couple = d.my ?? d.mz;
  const comps = named([['P', shownGlobal(d.p, d.isGlobal), 'force'], ['Px', d.px, 'force'], [`M${twoD.normal.toLowerCase()}`, couple === undefined ? undefined : twoD.rot(couple) + 0, 'moment']], us);
  return comps.length ? `${comps.join(', ')}, a=${val(d.a, 'length', us)} ${unitLabel('length', us)}${direction(d, words)}` : '';
}

/**
 * The named components of a nodal, nodal3d or distributed3d load, comma-separated; '' when every
 * component is zero (the caller says so in words), and also for any other load type.
 */
export function loadComponentsText(type: string, d: Record<string, any>, us: UnitSystem = 'SI'): string {
  if (type === 'nodal') {
    // The 2D plane is XZ: the store's names, with the legacy aliases as a fallback for old data.
    const opt = (v: number | undefined, f: (x: number) => number) => (v === undefined ? undefined : f(v) + 0);
    const lower = (s: string) => s.toLowerCase();
    return named([
      [`F${lower(twoD.horizontal)}`, opt(d.fx, twoD.x), 'force'], [`F${lower(twoD.vertical)}`, opt(d.fz ?? d.fy, twoD.z), 'force'],
      [`M${lower(twoD.normal)}`, opt(d.my ?? d.mz, twoD.rot), 'moment'],
    ], us).join(', ');
  }
  if (type === 'nodal3d') {
    const [fx, fy, fz] = userVec(d.fx ?? 0, d.fy ?? 0, d.fz ?? 0), [mx, my, mz] = userRot(d.mx ?? 0, d.my ?? 0, d.mz ?? 0);
    return named([
      ['Fx', fx + 0, 'force'], ['Fy', fy + 0, 'force'], ['Fz', fz + 0, 'force'],
      ['Mx', mx + 0, 'moment'], ['My', my + 0, 'moment'], ['Mz', mz + 0, 'moment'],
    ], us).join(', ');
  }
  if (type === 'distributed3d') {
    const global = d.frame === 'global' || d.frame === 'projected';
    const ax = global ? ['X', 'Y', 'Z'] : ['x', 'y', 'z'];
    const [xi, yi, zi] = global ? userVec(d.qXI ?? 0, d.qYI ?? 0, d.qZI ?? 0) : [d.qXI, d.qYI, d.qZI];
    const [xj, yj, zj] = global ? userVec(d.qXJ ?? d.qXI ?? 0, d.qYJ ?? d.qYI ?? 0, d.qZJ ?? d.qZI ?? 0) : [d.qXJ, d.qYJ, d.qZJ];
    const comps = [...line(ax[0]!, xi, xj, us), ...line(ax[1]!, yi, yj, us), ...line(ax[2]!, zi, zj, us)];
    return comps.length ? comps.join(', ') + range(d, us) : '';
  }
  return '';
}

/**
 * A thermal load: the uniform change and the gradient. Both are differences of
 * temperature, so in imperial 20 °C reads 36 °F, not the 68 °F of a temperature.
 *
 * Named as the mode that wrote it names them: Basic's ΔTg (the change) and ∇T (the gradient),
 * PRO's ΔT, ΔTgz and ΔTgy (its tables and load card). In PRO «ΔTg» is a gradient, so Basic's
 * names in a PRO report read the uniform change as one. The side-to-side gradient, which only
 * PRO writes, is given when it is there.
 */
export function thermalText(
  d: { dtUniform?: number; dtGradient?: number; dtGradientY?: number }, us: UnitSystem = 'SI', mode: 'basic' | 'pro' = 'basic',
): string {
  const dt = (v: number | undefined) => `${val(v ?? 0, 'temperatureDelta', us)}${unitLabel('temperatureDelta', us)}`;
  if (mode === 'basic') return `ΔTg=${dt(d.dtUniform)}, ∇T=${dt(d.dtGradient)}`;
  return `ΔT=${dt(d.dtUniform)}, ΔTgz=${dt(d.dtGradient)}` + (nonZero(d.dtGradientY) ? `, ΔTgy=${dt(d.dtGradientY)}` : '');
}
