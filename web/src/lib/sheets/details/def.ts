/**
 * A detail of the catalogue: its own code, its family, the sheet it goes on unless the person
 * moves it, whether it belongs to seismic design, and how it is drawn from the project's values.
 * Its title and note are `plan.det.<id>.t` and `plan.det.<id>.n`; the note takes the values the
 * drawing writes, so the text and the figure say the same.
 */
import type { DrawingInput } from '../compose';
import type { Sketch } from './sketch';
import type { DetailFamily, DetailValues } from './values';

export type Tr = (key: string, params?: Record<string, string | number>) => string;

export interface DetailDef {
  id: string;
  code: string;
  family: DetailFamily;
  /** The plan kind whose sheets it goes on by default. */
  target: string;
  /** Drawn for frames and walls designed for earthquake. */
  seismic?: boolean;
  draw: (v: DetailValues, tr: Tr, fmt: (v: number, d: number) => string) => DrawingInput;
  /** The drawing with its technical note as text, for the catalogue on screen. */
  render: (v: DetailValues, tr: Tr, fmt: (v: number, d: number) => string) => { drawing: DrawingInput; note: string };
}

/** A drawn detail: the sketch closed with its code, title and note. */
export function finish(d: Pick<DetailDef, 'id' | 'code'>, sk: Sketch, tr: Tr, params: Record<string, string | number> = {}): DrawingInput {
  return sk.drawing(`detail-${d.id}`, tr(`plan.det.${d.id}.t`), tr(`plan.det.${d.id}.n`, params), { code: d.code });
}

type DrawBody = (v: DetailValues, tr: Tr, fmt: (v: number, d: number) => string) => { sk: Sketch; params?: Record<string, string | number> };

/** A detail from its drawing body. */
export function detail(id: string, code: string, family: DetailFamily, target: string, body: DrawBody, seismic?: boolean): DetailDef {
  const render: DetailDef['render'] = (v, tr, fmt) => { const r = body(v, tr, fmt); return { drawing: finish({ id, code }, r.sk, tr, r.params), note: tr(`plan.det.${id}.n`, r.params ?? {}) }; };
  return { id, code, family, target, ...(seismic ? { seismic } : {}), render, draw: (v, tr, fmt) => render(v, tr, fmt).drawing };
}
