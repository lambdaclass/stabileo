/**
 * A reinforced concrete beam's deflection on its cracked section: the service deflection the
 * solver gave on the gross section, scaled by Ig/Ie (Table 24.2.3.5) with Ma the largest service
 * moment along the span, and the long-term multiplier ξ/(1 + 50ρ′) with the compression steel at
 * midspan. The bars are those the reinforcement sheets adopted for the span; a project designed
 * before the sheets reads its members' own reinforcement. A beam with neither, or not rectangular,
 * keeps the gross section and λΔ = 2.
 */
import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { concreteFc } from '../model/design-data';
import { computeDiagram3D } from '../engine/diagrams-3d';
import { crackedInertia, crackingMoment, effectiveInertia, longTermMultiplier } from '../codes/cirsoc201/effective-inertia';
import type { ElementForces3D } from '../engine/types-3d';
import type { BeamRegions, LongBarGroup, RebarGroup, RebarLayer } from '../design-contract/reinforcement';
import { faceLayout, groupsArea } from '../rc-sheets/bars';
import { sheetBeamBars, type SheetBeamBarsReader } from './rc-sheets-reinforcement';

export interface CrackedBasis { Ig: number; Icr: number; Ie: number; Mcr: number; Ma: number; rhoPrime: number; lambda: number; scale: number; bars: 'sheets' | 'member' }

const area = (d: number) => (Math.PI * (d / 1000) ** 2) / 4;
const layersArea = (l?: RebarLayer[]) => (l ?? []).reduce((s, x) => s + x.count * area(x.diameter), 0);
const groupArea = (g?: RebarGroup) => (g ? g.count * area(g.diameter) : 0);
const memberGroupsArea = (gs?: LongBarGroup[], keep: (g: LongBarGroup) => boolean = () => true) => (gs ?? []).filter(keep).reduce((s, g) => s + layersArea(g.layers), 0);
const largest = (l?: RebarLayer[], g?: RebarGroup) => Math.max(0, ...(l ?? []).map((x) => x.diameter), g?.diameter ?? 0);

interface SpanSteel { As: number; AsPrime: number; d: number; dPrime: number; bars: CrackedBasis['bars'] }

function sheetSteel(span: number[], h: number, b: number, read: SheetBeamBarsReader): SpanSteel | null {
  const bars = span.map(read).find((x) => !!x);
  if (!bars || !bars.span.bottom.length) return null;
  const cover = designData().covers.beam;
  const As = groupsArea(bars.span.bottom) * 1e-4, AsPrime = groupsArea(bars.span.top) * 1e-4;
  const d = h - faceLayout(bars.span.bottom, b, cover, bars.stirrupDia).centroidFromFace;
  const dPrime = faceLayout(bars.span.top, b, cover, bars.stirrupDia).centroidFromFace;
  return { As, AsPrime, d, dPrime, bars: 'sheets' };
}

function memberSteel(r: BeamRegions, h: number): SpanSteel | null {
  const As = r.bottomGroups?.length ? memberGroupsArea(r.bottomGroups) : layersArea(r.bottomSpanLayers) || groupArea(r.bottomSpan);
  if (!(As > 0)) return null;
  // Compression steel at midspan: top bars that run through the span from one support to the other.
  const AsPrime = Math.max(memberGroupsArea(r.topStartGroups, (g) => g.continueEnd === true), memberGroupsArea(r.topEndGroups, (g) => g.continueStart === true));
  const dd = designData();
  const cover = dd.covers.beam, st = dd.stirrupDiaMm / 1000;
  const db = largest(r.bottomSpanLayers, r.bottomSpan) / 1000 || 0.016;
  return { As, AsPrime, d: h - cover - st - db / 2, dPrime: cover + st + 0.008, bars: 'member' };
}

/**
 * The basis for one span, from its bars and its first element's section and the service forces
 * given. `read` is the sheets' bars by element; pass one built once when checking many spans.
 */
export function crackedBasis(span: number[], forces: ReadonlyMap<number, ElementForces3D>, read: SheetBeamBarsReader = sheetBeamBars()): CrackedBasis | null {
  const e = modelStore.elements.get(span[0]!);
  const sec = e && modelStore.sections.get(e.sectionId);
  const mat = e && modelStore.materials.get(e.materialId);
  if (!e || !sec?.b || !sec.h || !mat) return null;
  if (sec.shape && sec.shape !== 'rect') return null;
  const fc = concreteFc(mat);
  if (!fc || !(mat.e > 0)) return null;
  const r = e.reinforcement?.regions as BeamRegions | undefined;
  const steel = sheetSteel(span, sec.h, sec.b, read) ?? (r ? memberSteel(r, sec.h) : null);
  if (!steel) return null;
  const { As, AsPrime, d, dPrime } = steel;
  const n = 200000 / mat.e;
  const Ig = (sec.b * sec.h ** 3) / 12;
  const { Icr } = crackedInertia({ b: sec.b, h: sec.h, d, dPrime, As, AsPrime, n });
  const Mcr = crackingMoment(sec.b, sec.h, fc);
  let Ma = 0;
  for (const id of span) {
    const ef = forces.get(id);
    if (!ef) continue;
    // The moment over the depth, the one the beam's vertical deflection comes from.
    for (const p of computeDiagram3D(ef, 'momentY').points) Ma = Math.max(Ma, Math.abs(p.value));
  }
  const Ie = effectiveInertia(Ig, Icr, Mcr, Ma);
  const rhoPrime = AsPrime / (sec.b * d);
  // The solver bent the beam on its section's own inertia about the depth.
  const Imodel = sec.iy ?? Ig;
  return { Ig, Icr, Ie, Mcr, Ma, rhoPrime, lambda: longTermMultiplier(rhoPrime), scale: Imodel / Ie, bars: steel.bars };
}
