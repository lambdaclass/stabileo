export function niceStep(span: number, target = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}

export function ticks(min: number, max: number, target = 5): number[] {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

/**
 * Room in px for the τ tick labels of an axis that reaches about `extent`, so grouped large numbers never clip.
 * With `scales`, the widest of `extent × scale` is used, so the drawing does not move when only the unit changes.
 */
export function gutter(extent: number, signed: boolean, scales: number[] = [1]): number {
  const width = (e: number) => {
    const top = niceStep(e, 1);
    return new Intl.NumberFormat('en', { maximumFractionDigits: top >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(top)) + 1) }).format(top).length + (signed ? 1 : 0);
  };
  return Math.max(40, Math.round(14 + 7.4 * Math.max(...scales.map((s) => width(extent * s)))));
}

export interface Frame {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  scale: number;
  x: (v: number) => number;
  y: (v: number) => number;
}

/**
 * Data ranges widened so one unit is the same length on both axes, fitted into the box.
 * `flipY` puts positive values downward.
 */
export function equalFrame(box: { left: number; top: number; width: number; height: number }, xr: [number, number], yr: [number, number], flipY = false): Frame {
  let [x0, x1] = xr, [y0, y1] = yr;
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  if (x1 - x0 < 1e-9) { x0 -= span / 2; x1 += span / 2; }
  if (y1 - y0 < 1e-9) { y0 -= span / 2; y1 += span / 2; }
  const scale = Math.min(box.width / (x1 - x0), box.height / (y1 - y0));
  const padX = (box.width / scale - (x1 - x0)) / 2, padY = (box.height / scale - (y1 - y0)) / 2;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  return {
    xMin: x0, xMax: x1, yMin: y0, yMax: y1, scale,
    x: (v) => box.left + (v - x0) * scale,
    y: (v) => (flipY ? box.top + (v - y0) * scale : box.top + (y1 - v) * scale),
  };
}

export interface LabelGroup<K extends string> {
  keys: K[];
  value: number;
}

export function mergeCoincident<K extends string>(items: { key: K; value: number }[], tolerance: number): LabelGroup<K>[] {
  const groups: LabelGroup<K>[] = [];
  for (const item of items) {
    const g = groups.find((group) => Math.abs(group.value - item.value) <= tolerance);
    if (g) g.keys.push(item.key);
    else groups.push({ keys: [item.key], value: item.value });
  }
  return groups;
}

export function labelRows(positions: number[], gap: number): number[] {
  const order = positions.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const lastOnRow: number[] = [];
  const rows = new Array<number>(positions.length).fill(0);
  for (const [p, i] of order) {
    let row = lastOnRow.findIndex((last) => p - last >= gap);
    if (row === -1) row = lastOnRow.length;
    lastOnRow[row] = p;
    rows[i] = row;
  }
  return rows;
}

const wrap = (deg: number) => { const w = ((((deg + 180) % 360) + 360) % 360) - 180; return w === -180 ? 180 : w; };

/**
 * θ in degrees that puts X′ at the screen angle `angle` (radians, y down) of a circle whose X is at `angleX`.
 * X′ repeats every 180° of θ, so of those the one nearest `current` is returned.
 */
export function thetaOnCircle(angle: number, angleX: number, tauDown: boolean, current: number): number {
  const base = ((angle - angleX) * 180) / Math.PI / (tauDown ? -2 : 2);
  let best = wrap(base), gap = Infinity;
  for (let k = -2; k <= 2; k++) {
    const c = wrap(base + 180 * k), d = Math.abs(wrap(c - current));
    if (d < gap - 1e-9) { best = c; gap = d; }
  }
  return best;
}

/**
 * An SVG arc of radius `r` from angle `from` through `sweep` radians (screen angles, y down), drawn in two halves
 * so that a full turn, whose ends coincide, still shows.
 */
export function arcPath(cx: number, cy: number, r: number, from: number, sweep: number): string {
  const at = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const flag = sweep > 0 ? 1 : 0;
  return `M${at(from)} A${r} ${r} 0 0 ${flag} ${at(from + sweep / 2)} A${r} ${r} 0 0 ${flag} ${at(from + sweep)}`;
}

/** `theta` pulled onto the nearest of `targets` within `tolerance` degrees, measured around the circle. */
export function snapAngle(theta: number, targets: number[], tolerance: number): number {
  let best = theta, gap = tolerance;
  for (const t of targets) {
    const d = Math.abs(wrap(t - theta));
    if (d <= gap) { best = wrap(t); gap = d; }
  }
  return best;
}

export function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

const NEG = [74, 143, 212], MID = [143, 163, 179], POS = [232, 112, 95];

/** Blue for compression through slate to red for tension; `range` is the magnitude at full colour. */
export function divergingColor(value: number, range: number): string {
  const r = range > 0 ? Math.max(-1, Math.min(1, value / range)) : 0;
  const end = r < 0 ? NEG : POS, f = Math.abs(r);
  const c = MID.map((m, i) => Math.round(m + (end[i] - m) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
