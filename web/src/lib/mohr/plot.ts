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

const NEG = [74, 143, 212], MID = [143, 163, 179], POS = [232, 112, 95];

/** Blue for compression through slate to red for tension; `range` is the magnitude at full colour. */
export function divergingColor(value: number, range: number): string {
  const r = range > 0 ? Math.max(-1, Math.min(1, value / range)) : 0;
  const end = r < 0 ? NEG : POS, f = Math.abs(r);
  const c = MID.map((m, i) => Math.round(m + (end[i] - m) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
