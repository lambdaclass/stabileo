/**
 * A figure of the viewport: the picture, a caption that says what it shows ("1,2D+1,6L: Mz"),
 * and the colour scale drawn INTO the image.
 *
 * The on-screen legends are HTML over the canvas, so a PNG of the canvas carried the colours and
 * not what they mean. Here the legend is rebuilt from the same data the legends read (the scale
 * the member painters publish, the shell contour field) and drawn with the same ramps, onto a
 * copy of the picture with a caption band under it. One routine for the PNG export and the
 * report's figures.
 */
import { resultsStore, modelStore } from '../store';
import { t } from '../i18n';
import { viewportCanvas } from '../utils/viewport-canvas';
import { colourRampCss } from '../three/colour-ramp';
import { shellContourColor } from '../three/stress-heatmap';
import { shellContourField } from '../engine/shell-contour-field';
import { shellComponentLabelKey, shellComponentMeta } from '../engine/shell-stress';
import { contourOptions } from '../store/contour-options.svelte';
import { bandValue } from '../engine/contour-scale';
import { colourScaleSource } from '../store/result-view';

export interface FigureLegend {
  title: string;
  unit: string;
  min: number;
  max: number;
  /** Colour at a fraction 0…1 of the scale, as CSS. */
  colourAt: (f: number) => string;
}

const QUANTITY: Record<string, string> = {
  momentZ: 'Mz', momentY: 'My', shearY: 'Vy', shearZ: 'Vz', axial: 'N', torsion: 'T', moment: 'M', shear: 'V',
};

/** Which result set is on screen, by name. */
export function resultSetName(): string {
  const v = resultsStore.activeView;
  if (v === 'combo' && resultsStore.activeComboId !== null) {
    return modelStore.combinations.find((c) => c.id === resultsStore.activeComboId)?.name ?? `${t('pro.comboN')}${resultsStore.activeComboId}`;
  }
  // A single load case is the single view with a case chosen.
  if (v === 'single' && resultsStore.activeCaseId !== null && resultsStore.perCase3D.size > 0) {
    return modelStore.loadCases.find((c) => c.id === resultsStore.activeCaseId)?.name ?? `${t('pro.caseN')}${resultsStore.activeCaseId}`;
  }
  if (v === 'envelope') return resultsStore.viewedEnvelopeName ?? t('tables.mode.envelope');
  return t('tables.shown');
}

/** What the viewport shows, as a caption: the result set and the quantity drawn. */
export function figureCaption(): string {
  const dt = resultsStore.diagramType;
  let what = '';
  if (dt === 'deformed') what = t('annot.deformed');
  else if (dt === 'colorMap') {
    const k = resultsStore.colorMapKind;
    what = k === 'shellVonMises' || k === 'shellBending' || (k === 'stress' && resultsStore.stressShowShells)
      ? t(shellComponentLabelKey(resultsStore.shellContourComponent))
      : QUANTITY[k] ?? k;
  } else if (dt !== 'none') what = QUANTITY[dt] ?? dt;
  const name = modelStore.model.name?.trim();
  const set = resultsStore.results3D || resultsStore.results ? resultSetName() : '';
  return [name, [set, what].filter(Boolean).join(': ')].filter(Boolean).join(' — ');
}

/** The colour scale on screen, or null when nothing on screen is coloured by value. */
export function figureLegend(): FigureLegend | null {
  if (resultsStore.diagramType !== 'colorMap') return null;
  const r = resultsStore.results3D;
  const k = resultsStore.colorMapKind;
  const shells = k === 'shellVonMises' || k === 'shellBending' || (k === 'stress' && resultsStore.stressShowShells);
  if (shells && r && ((r.plateStresses?.length ?? 0) + (r.quadStresses?.length ?? 0)) > 0) {
    const f = shellContourField(
      { plates: r.plateStresses ?? [], quads: r.quadStresses ?? [] },
      (key) => (key.startsWith('p') ? modelStore.plates.get(+key.slice(1))?.nodes : modelStore.quads.get(+key.slice(1))?.nodes),
      resultsStore.shellContourComponent, contourOptions,
    );
    const { min, max } = f.range;
    const meta = shellComponentMeta(resultsStore.shellContourComponent);
    const bands = contourOptions.bands;
    return {
      title: t(shellComponentLabelKey(meta.key)), unit: meta.unit, min, max,
      colourAt: (u) => '#' + shellContourColor(bandValue(min + u * (max - min), min, max, bands), min, max).toString(16).padStart(6, '0'),
    };
  }
  const s = resultsStore.colourScale;
  if (s && s.source === colourScaleSource()) {
    return { title: QUANTITY[k] ?? k, unit: s.unit, min: 0, max: s.max, colourAt: (u) => colourRampCss(Math.max(0, Math.min(1, u))) };
  }
  return null;
}

const fmt = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2 ? v.toExponential(2) : v.toFixed(Math.abs(v) >= 100 ? 0 : 2));

/**
 * The figure as a PNG data URL: the picture, the legend at its lower right, the caption in a band
 * under it. Null when there is no viewport to take it from, or the browser refuses to read it.
 */
export function composeFigure(source: HTMLCanvasElement, caption: string, legend: FigureLegend | null): string | null {
  const W = source.width, H = source.height;
  const band = Math.max(28, Math.round(H * 0.05));
  const out = document.createElement('canvas');
  out.width = W; out.height = H + band;
  const g = out.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, out.width, out.height);
  try { g.drawImage(source, 0, 0); } catch { return null; }
  const px = Math.max(11, Math.round(band * 0.45));
  if (legend) {
    const bh = Math.min(200, Math.round(H * 0.35)), bw = Math.max(14, Math.round(px * 1.2));
    const x = W - bw - px * 6, y = H - bh - px * 2;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x - px, y - px * 2.2, bw + px * 7, bh + px * 3.4);
    for (let i = 0; i < bh; i++) { g.fillStyle = legend.colourAt(1 - i / (bh - 1)); g.fillRect(x, y + i, bw, 1); }
    g.strokeStyle = '#555'; g.strokeRect(x, y, bw, bh);
    g.fillStyle = '#222'; g.font = `${px}px sans-serif`; g.textBaseline = 'middle';
    g.fillText(`${legend.title} [${legend.unit}]`, x - px * 0.5, y - px * 1.1);
    for (const f of [1, 0.5, 0]) g.fillText(fmt(legend.min + f * (legend.max - legend.min)), x + bw + px * 0.5, y + (1 - f) * bh);
  }
  g.fillStyle = '#f2f2f2'; g.fillRect(0, H, W, band);
  g.fillStyle = '#111'; g.font = `${px}px sans-serif`; g.textBaseline = 'middle';
  g.fillText(caption, px, H + band / 2);
  try { return out.toDataURL('image/png'); } catch { return null; }
}

/** The viewport as a figure, captioned and with its scale. */
export function captureFigure(caption = figureCaption()): { dataUrl: string; caption: string } | null {
  const c = viewportCanvas();
  if (!c) return null;
  const dataUrl = composeFigure(c, caption, figureLegend());
  return dataUrl ? { dataUrl, caption } : null;
}
