/**
 * A sheet as SVG, for the screen and the goldens: the same primitives the DXF and the PDF write,
 * y flipped (SVG grows down), colours and weights from the layer table.
 */
import { dimensionGeometry, type Primitive } from './primitives';
import { aciRgb, layerDef, type LayerStyle } from './layers';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number) => (Math.round(v * 100) / 100).toString();

export function sheetToSvg(width: number, height: number, ps: readonly Primitive[], layerOf: LayerStyle = layerDef): string {
  const Y = (y: number) => height - y;
  const style = (layer: string, fill = false) => {
    const d = layerOf(layer), [r, g, b] = aciRgb(d.color), c = `rgb(${r},${g},${b})`;
    return `stroke="${fill ? 'none' : c}" stroke-width="${d.weight}" fill="${fill ? c : 'none'}"${d.dashed ? ' stroke-dasharray="3 2"' : ''} data-layer="${esc(layer)}"`;
  };
  const text = (layer: string, x: number, y: number, s: string, h: number, rot = 0, align: 'left' | 'center' | 'right' = 'left') => {
    const [r, g, b] = aciRgb(layerOf(layer).color);
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    return `<text x="${n(x)}" y="${n(Y(y))}" font-size="${n(h)}" font-family="Helvetica, Arial, sans-serif" fill="rgb(${r},${g},${b})" text-anchor="${anchor}"${rot ? ` transform="rotate(${n(-rot)} ${n(x)} ${n(Y(y))})"` : ''} data-layer="${esc(layer)}">${esc(s)}</text>`;
  };
  const out: string[] = [];
  for (const p of ps) {
    switch (p.kind) {
      case 'line': out.push(`<line x1="${n(p.a.x)}" y1="${n(Y(p.a.y))}" x2="${n(p.b.x)}" y2="${n(Y(p.b.y))}" ${style(p.layer)}/>`); break;
      case 'polyline': out.push(`<${p.closed ? 'polygon' : 'polyline'} points="${p.points.map((q) => `${n(q.x)},${n(Y(q.y))}`).join(' ')}" ${style(p.layer, p.fill)}/>`); break;
      case 'circle': out.push(`<circle cx="${n(p.c.x)}" cy="${n(Y(p.c.y))}" r="${n(p.r)}" ${style(p.layer, p.fill)}/>`); break;
      case 'arc': {
        const a0 = (p.start * Math.PI) / 180, a1 = (p.end * Math.PI) / 180, large = ((p.end - p.start + 360) % 360) > 180 ? 1 : 0;
        out.push(`<path d="M ${n(p.c.x + p.r * Math.cos(a0))} ${n(Y(p.c.y + p.r * Math.sin(a0)))} A ${n(p.r)} ${n(p.r)} 0 ${large} 0 ${n(p.c.x + p.r * Math.cos(a1))} ${n(Y(p.c.y + p.r * Math.sin(a1)))}" ${style(p.layer)}/>`);
        break;
      }
      case 'text': out.push(text(p.layer, p.at.x, p.at.y, p.text, p.height, p.rotation ?? 0, p.align ?? 'left')); break;
      case 'dimension': {
        const g = dimensionGeometry(p);
        const parts = [...g.ext, g.line].map(([a, b]) => `<line x1="${n(a.x)}" y1="${n(Y(a.y))}" x2="${n(b.x)}" y2="${n(Y(b.y))}" ${style(p.layer)}/>`);
        const ticks = g.line.map((e) => `<line x1="${n(e.x - 0.8)}" y1="${n(Y(e.y - 0.8))}" x2="${n(e.x + 0.8)}" y2="${n(Y(e.y + 0.8))}" ${style(p.layer)}/>`);
        out.push(`<g data-kind="dimension">${parts.join('')}${ticks.join('')}${text(p.layer, g.textAt.x, g.textAt.y, p.text ?? `${Math.round(g.length)}`, p.height ?? 2.5, g.angle, 'center')}</g>`);
        break;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}mm" height="${n(height)}mm"><rect width="100%" height="100%" fill="white"/>${out.join('')}</svg>`;
}
