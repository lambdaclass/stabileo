/**
 * A joint's typology, designed: the one asked for or the one proposed (`propose.ts`), sized from a
 * light start until every check holds or a limit is reached. Sizing raises one thing at a time in
 * a fixed order — the bolt diameter, the rows, the plate, the weld, then stiffeners where the
 * column asks for them — so the result is the first arrangement that holds, not the heaviest.
 * What cannot be resolved here says why.
 */
import { designBase } from './base';
import { designEndPlate } from './end-plate';
import { designGusset } from './gusset';
import { designShearTab } from './shear-tab';
import { designSplice } from './splice';
import { proposeTypology } from './propose';
import type { Typology, TypologyContext, TypologyDesign, TypologyParams } from './types';

export * from './types';
export { proposeTypology } from './propose';

const BOLTS = [16, 20, 24, 27];

export function defaultParams(kind: Typology): TypologyParams {
  const base = kind === 'basePinned' || kind === 'baseFixed';
  return { plateT: base ? 15 : 10, boltD: 16, boltGrade: 'A325', rows: kind === 'endPlate' || kind === 'knee' || kind === 'apex' ? 1 : 2, weldLeg: 5, anchors: 4, anchorD: 20 };
}

function unresolved(kind: Typology, key: string, p: TypologyParams): TypologyDesign {
  return { kind, params: p, checks: [], parts: [], state: 'unresolved', unresolvedKey: key };
}

/** One evaluation of a typology with given parameters. */
export function designTypology(kind: Typology, ctx: TypologyContext, p: TypologyParams, mainId?: number): TypologyDesign {
  const main = ctx.members.find((m) => m.id === mainId) ?? ctx.members[0];
  if (!main) return unresolved(kind, 'joint.typ.unresolved.noMembers', p);
  const col = ctx.members.find((m) => m.kind === 'column' && m.id !== main.id) ?? null;
  const need = (m: typeof main | null) => !!m?.section;
  switch (kind) {
    case 'shearTab': return need(main) ? designShearTab(ctx, main, p) : unresolved(kind, 'joint.typ.unresolved.noSection', p);
    case 'endPlate': case 'knee': case 'apex': return need(main) ? designEndPlate(ctx, main, col, p, kind) : unresolved(kind, 'joint.typ.unresolved.noSection', p);
    case 'splice': return need(main) ? designSplice(ctx, main, p) : unresolved(kind, 'joint.typ.unresolved.noSection', p);
    case 'gusset': return designGusset(ctx, main, p);
    case 'basePinned': case 'baseFixed': {
      const c = ctx.members.find((m) => m.kind === 'column') ?? main;
      return need(c) ? designBase(ctx, c, p, kind === 'baseFixed') : unresolved(kind, 'joint.typ.unresolved.noSection', p);
    }
  }
}


/** Size a typology: from `start` (or the defaults), the first arrangement that holds. */
export function sizeTypology(kind: Typology, ctx: TypologyContext, mainId?: number, start?: Partial<TypologyParams>): TypologyDesign {
  let p: TypologyParams = { ...defaultParams(kind), ...start };
  let d = designTypology(kind, ctx, p, mainId);
  for (let k = 0; k < 60 && d.state === 'exceeded'; k++) {
    const fail = d.checks.filter((c) => c.ratio > 1 + 1e-9).map((c) => c.labelKey);
    const has = (s: string) => fail.some((f) => f.includes(s));
    const next = { ...p };
    const base = kind === 'basePinned' || kind === 'baseFixed';
    if (base) {
      // A base: the concrete by a larger plan, the plate by thickness, the anchors by diameter.
      if (has('base.bearing') && (d.params.plateN ?? 0) < 1200) { next.plateN = (d.params.plateN ?? 300) + 50; next.plateB = (d.params.plateB ?? 300) + 50; }
      else if (has('base.plate') && p.plateT < 60) next.plateT = p.plateT + 5;
      else if ((has('base.anchor') || has('base.breakout')) && (p.anchorD ?? 20) < 36) next.anchorD = (p.anchorD ?? 20) + 4;
      else if ((has('base.anchor') || has('base.breakout')) && (p.anchors ?? 4) < 8) next.anchors = (p.anchors ?? 4) + 2;
      else if ((has('weldMin') || has('check.weld')) && p.weldLeg < 16) next.weldLeg = p.weldLeg + 1;
      else break;
      p = next; d = designTypology(kind, ctx, p, mainId); continue;
    }
    if ((has('flangeBending') || has('webYielding')) && !p.stiffeners) next.stiffeners = true;
    else if (has('weldMax') && p.weldLeg > 3) next.weldLeg = p.weldLeg - 1;
    else if ((has('weldMin') || has('Weld') || has('check.weld')) && p.weldLeg < 16) next.weldLeg = p.weldLeg + 1;
    else if ((has('prying') || has('plate') || has('whitmore') || has('blockShear') || has('bearing')) && p.plateT < 50) next.plateT = p.plateT + 5;
    else if (has('bolt') && BOLTS.indexOf(p.boltD) < BOLTS.length - 1) next.boltD = BOLTS[BOLTS.indexOf(p.boltD) + 1]!;
    else if (p.rows < 8) next.rows = p.rows + 1;
    else break;
    p = next;
    d = designTypology(kind, ctx, p, mainId);
  }
  if (d.state === 'exceeded') return { ...d, unresolvedKey: 'joint.typ.unresolved.limits' };
  return d;
}

/** Propose a typology for the joint and size it. */
export function proposeAndSize(ctx: TypologyContext): TypologyDesign | { kind: null; reasonKey: string } {
  const pr = proposeTypology(ctx.members, ctx.support);
  if (!pr.kind) return { kind: null, reasonKey: pr.reasonKey ?? 'joint.typ.unresolved.unrecognized' };
  return sizeTypology(pr.kind, ctx, pr.mainId);
}
