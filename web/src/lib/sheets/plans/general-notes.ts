/**
 * The general notes every set carries: the materials, the clear covers by element, the codes the
 * design follows, the units, and the rules a site reads before the drawings (dimensions govern
 * over the scale, laps and hooks per the details sheet, nothing is concreted before the steel is
 * inspected).
 */
import type { DrawingInput } from '../compose';
import { drawNotes } from './table';
import type { Tr } from './details';

export interface NotesInput {
  concrete?: string;
  rebar?: string;
  steel?: string;
  covers: Partial<Record<'beam' | 'column' | 'slab' | 'wall' | 'footing', number>>;
  exposure?: string;
  codes: string[];
}

export function generalNotes(i: NotesInput, tr: Tr): DrawingInput {
  const cm = (v: number) => String(Math.round(v * 1000));
  const notes: string[] = [];
  if (i.concrete) notes.push(tr('plan.notes.concrete', { v: i.concrete }));
  if (i.rebar) notes.push(tr('plan.notes.rebar', { v: i.rebar }));
  if (i.steel) notes.push(tr('plan.notes.steel', { v: i.steel }));
  const covers = (['beam', 'column', 'slab', 'wall', 'footing'] as const).filter((c) => i.covers[c] !== undefined).map((c) => `${tr(`plan.notes.el.${c}`)} ${cm(i.covers[c]!)} mm`);
  if (covers.length) notes.push(tr('plan.notes.covers', { v: covers.join(', ') }));
  if (i.exposure) notes.push(tr('plan.notes.exposure', { v: i.exposure }));
  if (i.codes.length) notes.push(tr('plan.notes.codes', { v: i.codes.join('; ') }));
  for (const key of ['units', 'dims', 'laps', 'inspect', 'levels']) notes.push(tr(`plan.notes.${key}`));
  const n = drawNotes(tr('plan.notes.title'), notes, 180);
  return { key: 'general-notes', title: tr('plan.notes.title'), primitives: n.primitives, width: n.width, height: n.height, origin: { x: 0, y: 0 }, paper: true };
}
