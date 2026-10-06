/**
 * The components of a load, as the calc report's load list names them.
 *
 * Every non-zero component, named by its axis, to four significant figures. Kept out of the
 * dialog so it can be read against the store's own field names: a 2D nodal load is stored as
 * fx, fz, my (fy and mz are legacy aliases, and `addNodalLoad` writes neither), and reading the
 * aliases reported a 10 kN load with a 5 kN·m moment as no load at all.
 */

/** Four significant figures, and never «-0». */
export function reportNumber(v: number): string {
  const r = +Number(v).toPrecision(4);
  return Object.is(r, -0) ? '0' : String(r);
}

const nonZero = (v: number | undefined): v is number => v !== undefined && Math.abs(v) > 1e-12;

type Component = [name: string, value: number | undefined, unit: string];

const named = (comps: Component[]) =>
  comps.filter(([, v]) => nonZero(v)).map(([k, v, u]) => `${k}=${reportNumber(v!)} ${u}`);

/**
 * A line load from I to J, kept when EITHER end carries load: a triangular load starting at
 * zero (0 → 5) is a load. A missing J end reads as uniform.
 */
function line(axis: string, i: number | undefined, j: number | undefined): string[] {
  const at = { i: i ?? 0, j: j ?? i ?? 0 };
  return nonZero(at.i) || nonZero(at.j) ? [`q${axis}=${reportNumber(at.i)} → ${reportNumber(at.j)} kN/m`] : [];
}

/**
 * Where a partial line load sits, measured from node I: «, a=1 m, b=2 m». Without it a load on
 * one metre of a six-metre member reads as covering all six. A start with no end runs to the
 * end of the member (`b=L`); a load with neither is full-length and says nothing.
 */
function range(d: { a?: number; b?: number }): string {
  if (d.a === undefined && d.b === undefined) return '';
  return `, a=${reportNumber(d.a ?? 0)} m, b=${d.b !== undefined ? `${reportNumber(d.b)} m` : 'L'}`;
}

/** The words a 2D member load needs from the caller's language: the engine holds no prose. */
export interface MemberLoadWords { global: string }

/** «, θ=30°» when the load is turned from its base direction, and the axes when they are global. */
function direction(d: { angle?: number; isGlobal?: boolean }, words: MemberLoadWords): string {
  return (nonZero(d.angle) ? `, θ=${reportNumber(d.angle)}°` : '') + (d.isGlobal ? `, ${words.global}` : '');
}

/**
 * A 2D line load: both ends, its range when partial, its angle and its axes. The angle and the
 * axes change what the numbers mean, so a report that drops them reports a different load.
 */
export function distributedText(
  d: { qI: number; qJ?: number; a?: number; b?: number; angle?: number; isGlobal?: boolean },
  words: MemberLoadWords,
): string {
  return `q=${reportNumber(d.qI)} → ${reportNumber(d.qJ ?? d.qI)} kN/m${range(d)}${direction(d, words)}`;
}

/**
 * A 2D point load on a member: P, and the axial force and moment it may carry with it (the
 * moment under its legacy alias for old data), then where it sits. '' when every component is
 * zero, which the caller says in words.
 */
export function pointOnElementText(
  d: { a: number; p: number; px?: number; my?: number; mz?: number; angle?: number; isGlobal?: boolean },
  words: MemberLoadWords,
): string {
  const comps = named([['P', d.p, 'kN'], ['Px', d.px, 'kN'], ['My', d.my ?? d.mz, 'kN·m']]);
  return comps.length ? `${comps.join(', ')}, a=${reportNumber(d.a)} m${direction(d, words)}` : '';
}

/**
 * The named components of a nodal, nodal3d or distributed3d load, comma-separated; '' when every
 * component is zero (the caller says so in words), and also for any other load type.
 */
export function loadComponentsText(type: string, d: Record<string, any>): string {
  if (type === 'nodal') {
    // The 2D plane is XZ: the store's names, with the legacy aliases as a fallback for old data.
    return named([['Fx', d.fx, 'kN'], ['Fz', d.fz ?? d.fy, 'kN'], ['My', d.my ?? d.mz, 'kN·m']]).join(', ');
  }
  if (type === 'nodal3d') {
    return named([
      ['Fx', d.fx, 'kN'], ['Fy', d.fy, 'kN'], ['Fz', d.fz, 'kN'],
      ['Mx', d.mx, 'kN·m'], ['My', d.my, 'kN·m'], ['Mz', d.mz, 'kN·m'],
    ]).join(', ');
  }
  if (type === 'distributed3d') {
    const ax = d.frame === 'global' || d.frame === 'projected' ? ['X', 'Y', 'Z'] : ['x', 'y', 'z'];
    const comps = [...line(ax[0]!, d.qXI, d.qXJ), ...line(ax[1]!, d.qYI, d.qYJ), ...line(ax[2]!, d.qZI, d.qZJ)];
    return comps.length ? comps.join(', ') + range(d) : '';
  }
  return '';
}
