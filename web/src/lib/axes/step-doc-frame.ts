import type { Block, StepDoc } from '../engine/steps/doc';
import type { Sketch } from '../engine/steps/sketch';
import { planeSigns, type AxesFrame } from './frame';
import { planeMirrored } from './plane-input';

/** Global components written in the documents' TeX and figure labels: R_x, u_z, F_x, Δu_x, a support's A_x. */
const TEX_GLOBAL = /(?<![A-Za-z\\])((?:R|u|F|P|[A-Z]|\\Delta u)_\{?)([xz])(?![A-Za-z])/g;
const LABEL_GLOBAL = /(?<![A-Za-z])([A-Z])([xz])(?= =)/g;

/** Sentences of the documents that name the global axes ("R_x toward +x, R_z up"); their local x and y stay. */
export const STEP_GLOBAL_KEYS: ReadonlySet<string> = new Set([
  'steps.frames.react.caption', 'steps.trusses.reactionsCaption', 'steps.trusses.joints.cosLead',
  'steps.trusses.compat.signs', 'steps.trusses.compat.qWhyTruss', 'steps.trusses.compat.qWhyFrame',
  'steps.trusses.compat.dir.ux', 'steps.trusses.compat.dir.uz', 'steps.m.castigliano.reactionsCaption',
  'steps.m.castigliano.signWhy', 'steps.deformation.signs.frame', 'steps.deformation.dir.x', 'steps.deformation.dir.z',
  'steps.cuts.reac.unknownsCaption', 'steps.trusses.eq.sumFx', 'steps.trusses.eq.sumFz',
]);
const UPPER_ONLY: ReadonlySet<string> = new Set(['steps.cuts.intro.membersCaption']);

function letters(f: AxesFrame): (l: string) => string {
  const p = planeSigns(f);
  return (l) => {
    const name = l.toLowerCase() === 'x' ? p.h : p.v;
    return l === l.toUpperCase() ? name : name.toLowerCase();
  };
}

export function stepTexIn(f: AxesFrame, tex: string): string {
  if (f.identity) return tex;
  const to = letters(f);
  return tex.replace(TEX_GLOBAL, (_, lead: string, l: string) => `${lead}${to(l)}`);
}

function labelIn(f: AxesFrame, s: string): string {
  const to = letters(f);
  return stepTexIn(f, s).replace(LABEL_GLOBAL, (_, n: string, l: string) => `${n}${to(l)}`);
}

export function stepTextIn(f: AxesFrame, key: string, text: string): string {
  if (f.identity) return text;
  const to = letters(f);
  if (UPPER_ONLY.has(key)) return text.replace(/(?<![A-Za-z])([XZ])(?![A-Za-z])/g, (l) => to(l));
  if (!STEP_GLOBAL_KEYS.has(key)) return text;
  return stepTexIn(f, text).replace(/(?<![A-Za-z])([xzXZ])(?![A-Za-z'′])/g, (l) => to(l));
}

function sketchIn(f: AxesFrame, s: Sketch, mirror: [number, number] | null): Sketch {
  const out: Sketch = {
    ...s,
    forces: s.forces?.map((x) => (x.label ? { ...x, label: labelIn(f, x.label) } : x)),
    couples: s.couples?.map((x) => (x.label ? { ...x, label: labelIn(f, x.label) } : x)),
  };
  return mirror ? { ...out, mirror } : out;
}

function texCell<T>(f: AxesFrame, c: T): T {
  const cell = c as unknown as { tex?: unknown };
  return (cell && typeof cell === 'object' && typeof cell.tex === 'string' ? { ...cell, tex: stepTexIn(f, cell.tex) } : c) as T;
}

function blockIn(f: AxesFrame, b: Block, mirror: [number, number] | null): Block {
  switch (b.kind) {
    case 'eq': return { ...b, tex: stepTexIn(f, b.tex) };
    case 'calc': return { ...b, formula: stepTexIn(f, b.formula), subst: b.subst && stepTexIn(f, b.subst), result: stepTexIn(f, b.result), check: b.check && stepTexIn(f, b.check) };
    case 'table': return { ...b, head: b.head.map((c) => texCell(f, c)), rows: b.rows.map((r) => r.map((c) => texCell(f, c))) };
    case 'matrix': return { ...b, name: stepTexIn(f, b.name), rowLabels: b.rowLabels?.map((l) => stepTexIn(f, l)), colLabels: b.colLabels?.map((l) => stepTexIn(f, l)) };
    case 'fig': return { ...b, sketch: sketchIn(f, b.sketch, mirror) };
    case 'sub': return { ...b, blocks: b.blocks.map((x) => blockIn(f, x, mirror)) };
    case 'compare': return { ...b, rows: b.rows.map((r) => ({ ...r, label: stepTexIn(f, r.label) })) };
    default: return b;
  }
}

/** A document built on the plane model in the user's coordinates (`planeInputIn`), its global components named as the user's and its figures drawn as the viewport draws the structure. */
export function stepDocIn(doc: StepDoc, f: AxesFrame): StepDoc {
  if (f.identity) return doc;
  const p = planeSigns(f);
  const mirror: [number, number] | null = planeMirrored(f) ? [p.sx, p.sz] : null;
  return {
    ...doc,
    intro: doc.intro.map((b) => blockIn(f, b, mirror)),
    steps: doc.steps.map((s) => ({ ...s, blocks: s.blocks.map((b) => blockIn(f, b, mirror)) })),
  };
}
