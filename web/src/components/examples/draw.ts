import type { View } from './define';

export class Sketch {
  xy: number[] = [];
  cells: number[] = [];
  values: number[] = [];
  category = 0;

  line(a: number, b: number, c: number, d: number) {
    const n = this.xy.length / 2;
    this.xy.push(a, b, c, d);
    this.cells.push(n, n + 1);
    this.values.push(this.category);
  }

  polyline(points: [number, number][]) {
    for (let i = 1; i < points.length; i++) this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  arrow(x: number, y: number, dx: number, dy: number) {
    this.line(x, y, x + dx, y + dy);
    this.line(x + dx, y + dy, x + dx - dx * .25 + dy * .15, y + dy - dy * .25 - dx * .15);
    this.line(x + dx, y + dy, x + dx - dx * .25 - dy * .15, y + dy - dy * .25 + dx * .15);
  }

  support(x: number, y: number, type: 'fixed' | 'pinned' | 'roller', h: number) {
    if (type === 'fixed') {
      this.line(x - h, y, x + h, y);
      for (const s of [-h, 0, h]) this.line(x + s, y, x + s - h * .6, y - h * .6);
      return;
    }
    this.line(x, y, x - h, y - h);
    this.line(x - h, y - h, x + h, y - h);
    this.line(x + h, y - h, x, y);
    if (type === 'roller') this.line(x - h, y - 1.4 * h, x + h, y - 1.4 * h);
  }

  view(field: string, unit: string, bounds: View['bounds']): View {
    return { xy: this.xy, cells: this.cells, cellSize: 2, values: this.values, perCell: true, range: { min: -1, max: 1 }, field, unit, geometryOnly: true, lineWidth: 3, bounds };
  }
}

export function boundsOf(points: number[], pad: number): View['bounds'] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]);
    y0 = Math.min(y0, points[i + 1]); y1 = Math.max(y1, points[i + 1]);
  }
  const p = pad * Math.max(x1 - x0, y1 - y0, 1e-9);
  return [x0 - p, y0 - p, x1 + p, y1 + p];
}
