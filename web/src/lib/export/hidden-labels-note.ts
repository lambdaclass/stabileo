import { tp } from '../i18n';

/** Under an exported figure, how many values had no room to be written; the tables carry them all. */
export function drawHiddenLabelsNote(ctx: CanvasRenderingContext2D, height: number, hidden: number): void {
  if (hidden <= 0) return;
  ctx.save();
  ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8fa3b3';
  ctx.fillText(tp('figures.labelsHidden', { n: hidden }), 8, height - 6);
  ctx.restore();
}
