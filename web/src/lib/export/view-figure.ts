/**
 * Figures of the model and its results, for "Exportar vista" and the calculation report.
 *
 * In 2D a figure is the viewport's own drawing, done again off screen: the 2D viewport registers a
 * renderer (`registerFigure2D`) that runs its draw routine on another context, with what the
 * figure shows in place of what the screen shows, and without the interaction on top (selection,
 * tool previews, the grid). Drawn on `svg-context` it is a vector figure; on a canvas, a PNG.
 * Either way through `ink-context`, so it comes out on paper, in colour or in black and white.
 *
 * Each figure is framed twice: once to see where everything it draws lands (diagrams and loads
 * stand off the members by a fixed number of pixels, so the structure's box is not enough), and
 * once for real, with the page cut to that box and a margin. Nothing is clipped and no figure is
 * mostly empty.
 *
 * In 3D a figure is the model projected from where the reader's camera looks (`figure-3d.ts`),
 * drawn on the same contexts: the same paper, framing and output as in 2D.
 */
import { createSvgContext, type Bounds } from './svg-context';
import { inkContext } from './ink-context';
import type { InkStyle } from './paper-ink';
import { modelStore, resultsStore, uiStore } from '../store';
import { t } from '../i18n';
import { unitQ } from '../store/display-units.svelte';
import { resultSetName } from './figure';
import { magnitudeLabel } from '../engine/result-scopes';
import { createFigure3DRenderer, components3D } from './figure-3d';
import type { DiagramType } from '../store/results.svelte';
import type { AnalysisResults3D } from '../engine/types-3d';
import { shellComponentLabelKey, shellComponentMeta, type ShellContourComponent } from '../engine/shell-stress';

/** What a figure shows. `shellMap`, a shell result in colour, is a 3D figure of PRO's. */
export type FigureContent = 'model' | 'reactions' | 'moment' | 'shear' | 'axial' | 'deformed' | 'despiece' | 'shellMap';

export const FIGURE_CONTENTS: readonly FigureContent[] = ['model', 'reactions', 'despiece', 'moment', 'shear', 'axial', 'deformed'];

/** PRO's figures: Basic's, and its shells' results. */
export const PRO_FIGURE_CONTENTS: readonly FigureContent[] = [...FIGURE_CONTENTS, 'shellMap'];

/** Contents that need results. */
export const NEEDS_RESULTS: ReadonlySet<FigureContent> = new Set(['reactions', 'moment', 'shear', 'axial', 'deformed', 'despiece', 'shellMap']);

/** Where a 3D figure is looked at from: the reader's camera, or a fixed view. */
export type FigureView = 'screen' | 'top' | 'front' | 'side' | 'iso';

export interface FigureOptions {
  /** The loads on the model and reactions figures. */
  loads: boolean;
  /** Node and member numbers. */
  numbering: boolean;
  /** Member lengths. */
  lengths: boolean;
  /** Values on diagrams, the deformed shape and reactions. */
  values: boolean;
  /** A heading on each figure saying what it shows. */
  titles: boolean;
  style: InkStyle;
  /** Which pieces the free-body figure shows: the members, the joints, or both. */
  dcl?: 'members' | 'nodes' | 'all';
  /** 3D: where the figure is looked at from (the camera when absent). */
  view?: FigureView;
  /** 3D: the shells, drawn as faces under the members (true when absent). */
  shells?: boolean;
  /** The shell result a `shellMap` figure paints. */
  shellComponent?: ShellContourComponent;
  /** 3D: the results to draw, in place of the ones on screen, and their name for the heading. */
  results?: AnalysisResults3D | null;
  resultsName?: string;
  /** 3D: the load cases whose loads the model figure draws; the ones shown on screen when absent. */
  loadCases?: readonly number[];
}

export const DEFAULT_FIGURE_OPTIONS: FigureOptions = {
  loads: true, numbering: false, lengths: false, values: true, titles: true, style: 'color', dcl: 'members',
};

/** What the viewport draws for one figure. */
export interface ExportFrame {
  content: FigureContent;
  options: FigureOptions;
}

export interface FrameView { zoom: number; panX: number; panY: number }

export interface Figure2DRenderer {
  /** Draw `frame` on `ctx` (logical size w × h) with the given world-to-screen view. */
  render(ctx: CanvasRenderingContext2D, w: number, h: number, frame: ExportFrame, view: FrameView): void;
  /** The structure's nodes as the figure places them (a 3D figure, from the frame's view). */
  nodes(frame?: ExportFrame): Array<{ x: number; y: number }>;
}

let renderer2D: Figure2DRenderer | null = null;

/** Called by the 2D viewport while it is mounted; returns the unregister. */
export function registerFigure2D(r: Figure2DRenderer): () => void {
  renderer2D = r;
  return () => { if (renderer2D === r) renderer2D = null; };
}

let renderer3D: Figure2DRenderer | null = null;

/** The renderer for the workspace: the 2D view's own drawing, or the projected 3D figures. */
function rendererNow(): Figure2DRenderer | null {
  if (uiStore.is3DWorkspace) return (renderer3D ??= createFigure3DRenderer());
  return renderer2D;
}

/** Whether figures can be drawn as vectors here: always in 3D, in 2D while its view is up. */
export function canDrawVector(): boolean {
  return rendererNow() !== null;
}

/** The viewport's diagram for a content. */
export function diagramFor(content: FigureContent): DiagramType {
  return content === 'model' || content === 'reactions' || content === 'shellMap' ? 'none' : content;
}

/** Heading of a figure: what it shows, its unit, and the results it comes from. */
export function figureTitle(content: FigureContent, options?: Pick<FigureOptions, 'shellComponent' | 'resultsName' | 'results'>): string {
  if (content === 'shellMap') {
    const meta = shellComponentMeta(options?.shellComponent ?? 'vonMises');
    const name = t(shellComponentLabelKey(meta.key));
    const set = withMagnitude(options?.resultsName ?? resultsLabel(), options);
    const what = `${t('figures.shellMap')}: ${name === shellComponentLabelKey(meta.key) ? meta.label : name} [${meta.unit}]`;
    return set ? `${what} — ${set}` : what;
  }
  const what =
    content === 'model' ? t('figures.model')
    : content === 'reactions' ? `${t('figures.reactions')} [${unitQ('force')}, ${unitQ('moment')}]`
    : content === 'despiece' ? t('figures.despiece')
    : content === 'moment' ? `${t('figures.moment')}${planes(content, options?.results)} [${unitQ('moment')}]`
    : content === 'shear' ? `${t('figures.shear')}${planes(content, options?.results)} [${unitQ('force')}]`
    : content === 'axial' ? `${t('figures.axial')} [${unitQ('force')}]`
    : t('figures.deformed');
  const set = NEEDS_RESULTS.has(content) ? withMagnitude(options?.resultsName ?? resultsLabel(), options) : '';
  return set ? `${what} — ${set}` : what;
}

/** The set's name, and what its numbers are when they are SRSS or ABS magnitudes, without a sign. */
function withMagnitude(set: string, options?: Pick<FigureOptions, 'results'>): string {
  const m = magnitudeLabel(options?.results ?? (uiStore.is3DWorkspace ? resultsStore.results3D : null), t);
  return m ? (set ? `${set} (${m})` : m) : set;
}

/** In 3D, which planes a bending or shear figure draws (", Mz y My"). */
function planes(content: 'moment' | 'shear', results?: AnalysisResults3D | null): string {
  const r3d = results ?? resultsStore.results3D;
  if (!uiStore.is3DWorkspace || !r3d) return '';
  const names = components3D(content, r3d).map((k) => ({ momentZ: 'Mz', momentY: 'My', shearY: 'Vy', shearZ: 'Vz' } as Record<string, string>)[k] ?? k);
  return names.length ? ` (${names.join(', ')})` : '';
}

/**
 * Which results a figure shows, when there is a choice to name: a combination, the envelope, or
 * one of several load cases. A model with one case and no combinations has nothing to tell apart.
 */
function resultsLabel(): string {
  if (!(resultsStore.results || resultsStore.results3D)) return '';
  const v = resultsStore.activeView;
  if (v === 'combo' || v === 'envelope') return resultSetName();
  const id = resultsStore.activeCaseId;
  if (id !== null && modelStore.loadCases.length > 1) return modelStore.getLoadCaseName(id) || '';
  return '';
}

/** Largest structure, in figure pixels, before the figure is cut to what was drawn. */
const FIT_W = 760, FIT_H = 500;
const PAD = 24;
/** Text grows with the figure: the viewport's sizes are for a screen, a page is read closer. */
const TEXT_SCALE = 1.15;
const TITLE_PX = 15;

/** A figure ready to draw: its size and the routine that paints it at the origin. */
export interface FigurePlan {
  content: FigureContent;
  title: string;
  width: number;
  height: number;
  paint(ctx: CanvasRenderingContext2D): void;
}

/**
 * The free body needs room at every joint for its values, so its figure may run taller: a page
 * holds a tall figure, while a cramped one forces the values away from the cuts they belong to.
 */
const FIT_H_FREE_BODY = 1000;

function fitView(nodes: Array<{ x: number; y: number }>, fitH = FIT_H): FrameView {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  if (!Number.isFinite(x0)) return { zoom: 100, panX: 0, panY: 0 };
  const sx = x1 - x0, sy = y1 - y0;
  const zoom = sx < 1e-9 && sy < 1e-9 ? 100
    : sy < 1e-9 ? FIT_W / sx
    : sx < 1e-9 ? fitH / sy
    : Math.min(FIT_W / sx, fitH / sy);
  // World x0 at screen 0, world y1 (the top) at screen 0.
  return { zoom, panX: -x0 * zoom, panY: y1 * zoom };
}

function textScale(): number {
  return TEXT_SCALE * (uiStore.labelScale || 1);
}

const TITLE_FONT = `bold ${TITLE_PX}px sans-serif`;

/** How wide the title is written: in its font, at the figure's text scale. */
function titleWidth(title: string, style: InkStyle): number {
  const ink = inkContext(createSvgContext(1, 1).ctx, style, textScale());
  ink.font = TITLE_FONT;
  return ink.measureText(title).width;
}

/** Plan one 2D figure; null when there is no 2D viewport to draw it. */
export function plan2D(content: FigureContent, options: FigureOptions): FigurePlan | null {
  const r = rendererNow();
  if (!r) return null;
  const frame: ExportFrame = { content, options };
  const view = fitView(r.nodes(frame), content === 'despiece' ? FIT_H_FREE_BODY : FIT_H);
  // First pass: where does the drawing land?
  const probe = createSvgContext(FIT_W, FIT_H);
  r.render(inkContext(probe.ctx, options.style, textScale()), FIT_W, FIT_H, frame, view);
  let b: Bounds = probe.bounds();
  if (!(b.x1 > b.x0)) b = { x0: 0, y0: 0, x1: FIT_W, y1: FIT_H };
  const title = options.titles ? figureTitle(content, options) : '';
  const head = title ? Math.round(TITLE_PX * 2.2) : 0;
  // The title is written above the drawing, outside its box: the page is as wide as the longer
  // of the two (a single column is a drawing a few pixels wide), the drawing centred under it.
  const titleW = title ? titleWidth(title, options.style) : 0;
  const drawingW = b.x1 - b.x0;
  const width = Math.ceil(Math.max(drawingW, titleW) + 2 * PAD);
  const height = Math.ceil(b.y1 - b.y0 + 2 * PAD + head);
  const inset = (width - 2 * PAD - drawingW) / 2;
  const shifted: FrameView = { zoom: view.zoom, panX: view.panX + PAD + inset - b.x0, panY: view.panY + PAD + head - b.y0 };
  return {
    content, title, width, height,
    paint(ctx) {
      // The ground is set on the context itself: through the ink, white would be read as a light
      // neutral and come out as ink.
      ctx.save(); ctx.fillStyle = options.style === 'screen' ? '#0c1620' : '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.restore();
      const ink = inkContext(ctx, options.style, textScale());
      ink.save();
      if (title) {
        ink.fillStyle = options.style === 'screen' ? '#f4f7fa' : '#c7d3dd';
        ink.font = TITLE_FONT;
        ink.textAlign = 'left';
        ink.textBaseline = 'alphabetic';
        ink.fillText(title, PAD, PAD + TITLE_PX);
      }
      ink.restore();
      r.render(ink, width, height, frame, shifted);
    },
  };
}

/** Gap between figures on a sheet. */
const SHEET_GAP = 18;

/** Several figures, one under the other, as one. */
export function sheetOf(plans: FigurePlan[], style: InkStyle): FigurePlan {
  const width = Math.max(...plans.map((p) => p.width));
  const height = plans.reduce((h, p) => h + p.height, 0) + SHEET_GAP * (plans.length - 1);
  return {
    content: plans[0]!.content, title: '', width, height,
    paint(ctx) {
      ctx.save();
      ctx.fillStyle = style === 'screen' ? '#0c1620' : '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      let y = 0;
      for (const p of plans) {
        ctx.save();
        ctx.translate(Math.round((width - p.width) / 2), y);
        p.paint(ctx);
        ctx.restore();
        y += p.height + SHEET_GAP;
      }
    },
  };
}

/** The figure as an SVG document. */
export function toSvg(plan: FigurePlan): string {
  const svg = createSvgContext(plan.width, plan.height);
  plan.paint(svg.ctx);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}">\n${svg.body()}\n</svg>\n`;
}

/** Pixels per figure pixel in a PNG: about 300 dpi when the figure is printed 16 cm wide. */
export const PNG_SCALE = 3;

/**
 * The largest canvas every browser encodes: iOS Safari gives no picture from one over 16.7 MP
 * (4096 × 4096), and none takes a side over 32 767 px. Past either `toBlob` hands back null,
 * and a sheet of seven figures at 3× is 2427 × 10026, 24.3 MP.
 */
const MAX_CANVAS_PIXELS = 16_777_216;
const MAX_CANVAS_SIDE = 32_767;

/**
 * Device pixels per figure pixel for a figure: `scale`, or less when the canvas would be over
 * what a browser encodes. Sized with a pixel to spare on each side for the rounding.
 */
export function canvasScale(plan: { width: number; height: number }, scale = PNG_SCALE): number {
  const w = Math.max(1, plan.width) + 1, h = Math.max(1, plan.height) + 1;
  return Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)), MAX_CANVAS_SIDE / Math.max(w, h));
}

/**
 * The figure drawn on a canvas, `wanted` device pixels per figure pixel, fewer when a large
 * figure (a sheet of several) would be over what the browser can encode (`canvasScale`).
 */
export function toCanvas(plan: FigurePlan, wanted = PNG_SCALE): HTMLCanvasElement {
  const scale = canvasScale(plan, wanted);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(plan.width * scale));
  c.height = Math.max(1, Math.round(plan.height * scale));
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.lineJoin = 'round';
  plan.paint(g);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob | null> {
  return new Promise((res) => c.toBlob((b) => res(b), type, type === 'image/jpeg' ? 0.92 : undefined));
}
