/**
 * The special slabs and foundations of the project, as the design reads them:
 *
 *  · slab panels declared ribbed or waffle, hollow-core or composite deck (`PhysicalData.typology`
 *    waffle | hollowCore | composite), each with its system (rib geometry, a plank type, a deck
 *    profile) and its rows, read from the panel's shells by `readSlabPanel`;
 *  · the heads of the flat slab's columns that carry a drop panel or a capital, with the drop's
 *    limits and the two-way shear at both critical sections;
 *  · the mat on springs (the nodes whose support has a vertical spring): the soil pressure and the
 *    lift-off of each combination;
 *  · the piles of each pile cap: their load against the strata's capacity and their section.
 *
 * The systems, plank types, deck profiles and heads live in the design data.
 */
import { modelStore } from './model.svelte';
import { physicalGroups } from './physical';
import { designData, patchOwnDesignData } from './design-data';
import { detailingStore } from './detailing.svelte';
import { activePerCombo3D, activeResultSet3D } from './active-results';
import { collectNodeReactions } from './detailing-footing-inputs';
import { readSlabPanel, type PanelReading } from './slab-panel-reading';
import { concreteFc } from '../model/design-data';
import { tributaryAreas } from '../engine/foundation-springs';
import { ribDesign, ribbedProperties, ribbedRules } from '../engine/design/slabs/ribbed';
import { deckSlabCheck, plankCheck, type DeckProfile, type PlankType } from '../engine/design/slabs/precast-floors';
import { dropPanelRules, headPunching } from '../engine/design/slabs/drop-panels';
import { matPressures, matRows, pileRows } from '../engine/foundation/geotech';
import { worstStatus, type CheckRow } from '../design-contract';
import type { HeadChoice, SlabSystemChoice, SpecialFloorsData } from '../model/special-floors';

export const SPECIAL_TYPOLOGIES = ['waffle', 'hollowCore', 'composite'] as const;
export type SpecialTypology = (typeof SPECIAL_TYPOLOGIES)[number];

export type { SlabSystemChoice, HeadChoice, SpecialFloorsData };

export const specialData = (): SpecialFloorsData => designData().specialFloors ?? {};
export const patchSpecial = (p: Partial<SpecialFloorsData>) => patchOwnDesignData({ specialFloors: { ...specialData(), ...p } });

export function setSlabSystem(key: string, c: SlabSystemChoice | null): void {
  const systems = { ...(specialData().systems ?? {}) };
  if (c) systems[key] = c; else delete systems[key];
  patchSpecial({ systems });
}
export function savePlankType(p: PlankType & { id: string }): void { patchSpecial({ plankTypes: [...(specialData().plankTypes ?? []).filter((x) => x.id !== p.id), p] }); }
export function saveDeckProfile(d: DeckProfile & { id: string }): void { patchSpecial({ deckProfiles: [...(specialData().deckProfiles ?? []).filter((x) => x.id !== d.id), d] }); }
export function setHead(nodeId: number, h: HeadChoice | null): void {
  const heads = { ...(specialData().heads ?? {}) };
  if (h && (h.drop || h.capital)) heads[String(nodeId)] = h; else delete heads[String(nodeId)];
  patchSpecial({ heads });
}

export interface SpecialPanel {
  key: string; groupId: number; name: string; typology: SpecialTypology;
  reading: PanelReading; choice: SlabSystemChoice | undefined;
  rows: CheckRow[]; status: CheckRow['status'];
  /** Ribbed: per m², concrete, self weight and the solid thickness of equal stiffness. */
  props?: ReturnType<typeof ribbedProperties>;
}

const missing = (key: string, title: string): CheckRow => ({ code: 'cirsoc-201', edition: '2025', clause: '—', title, titleKey: key, formula: 'system not chosen', inputs: [], ratio: null, status: 'notVerified' });
const statusOf = (rows: readonly CheckRow[]) => (rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified');

export function specialPanels(): SpecialPanel[] {
  const sd = specialData(), dd = designData(), out: SpecialPanel[] = [];
  for (const g of physicalGroups()) {
    const typ = g.physical.typology as SpecialTypology;
    if (g.physical.kind !== 'slab' || !SPECIAL_TYPOLOGIES.includes(typ)) continue;
    const key = `S${g.id}`, choice = sd.systems?.[key];
    const reading = readSlabPanel(g, choice?.direction);
    if (!reading) continue;
    const loads = { superDead: reading.dead, live: reading.live };
    let rows: CheckRow[] = [], props: SpecialPanel['props'];
    if (typ === 'waffle') {
      if (!choice?.ribbed) rows = [missing('check.ribbed.geometry', 'Rib geometry')];
      else {
        const geo = choice.ribbed;
        props = ribbedProperties(geo);
        rows = [...ribbedRules(geo)];
        const mat = { fc: reading.fc, fy: dd.rebarFy, cover: dd.covers.slab, barDia: 12 };
        for (const [dir, spacing] of [[reading.dir, reading.dir === 'x' ? geo.spacingX : geo.spacingY ?? geo.spacingX], ...(geo.spacingY ? [[reading.dir === 'x' ? 'y' : 'x', reading.dir === 'x' ? geo.spacingY : geo.spacingX]] : [])] as Array<['x' | 'y', number]>) {
          const r = dir === reading.dir ? reading : readSlabPanel(g, dir) ?? reading;
          const mPos = Math.max(0, ...r.pos.map((p) => p.m)), mNeg = Math.max(0, ...r.neg.map((p) => -p.m));
          const d = ribDesign(geo, { mPos, mNeg, v: r.vMax, at: dir }, mat, spacing);
          rows.push(...d.rows.map((x) => ({ ...x, title: `${x.title}, ${dir}`, location: `${dir}` })));
        }
      }
    } else if (typ === 'hollowCore') {
      const plank = sd.plankTypes?.find((p) => p.id === choice?.plankId);
      rows = plank ? plankCheck(plank, reading.span, loads) : [missing('check.plank.type', 'Plank type')];
    } else {
      const deck = sd.deckProfiles?.find((p) => p.id === choice?.deckId);
      rows = deck ? deckSlabCheck(deck, reading.quads[0]!.thickness, reading.fc, reading.span, loads) : [missing('check.deck.profile', 'Deck profile')];
    }
    out.push({ key, groupId: g.id, name: g.name, typology: typ, reading, choice, rows, status: statusOf(rows), ...(props ? { props } : {}) });
  }
  return out;
}

/** The columns under the flat slab with a drop or a capital: their limits and two-way shear. */
export function headChecks(): Array<{ nodeId: number; head: HeadChoice; rows: CheckRow[]; status: CheckRow['status'] }> {
  const heads = specialData().heads ?? {}, dd = designData(), m = modelStore.model;
  const joints = new Map<number, { Vu: number; position: string | null; comboName: string | null; columnElementId: number }>();
  for (const a of detailingStore.assemblies) for (const r of a.families ?? []) {
    if (r.family !== 'slab') continue;
    for (const p of r.punching) { const prev = joints.get(p.nodeId); if (!prev || p.Vu > prev.Vu) joints.set(p.nodeId, { Vu: p.Vu, position: p.position, comboName: p.governingCombination, columnElementId: p.columnElementId }); }
  }
  const axesX = (m.grid?.axes ?? []).filter((a) => a.axis === 'x').map((a) => a.at).sort((a, b) => a - b);
  const axesY = (m.grid?.axes ?? []).filter((a) => a.axis === 'y').map((a) => a.at).sort((a, b) => a - b);
  const bay = (axes: number[], v: number) => { const i = axes.findIndex((a) => Math.abs(a - v) < 0.05); return i < 0 ? 0 : Math.max(i > 0 ? axes[i]! - axes[i - 1]! : 0, i < axes.length - 1 ? axes[i + 1]! - axes[i]! : 0); };
  return Object.entries(heads).map(([key, head]) => {
    const nodeId = Number(key), node = m.nodes.get(nodeId), j = joints.get(nodeId);
    const shells = [...m.quads.values()].filter((q) => q.nodes.includes(nodeId));
    const h = shells.length ? Math.min(...shells.map((q) => q.thickness)) : 0.2;
    const mat = shells.length ? m.materials.get(shells[0]!.materialId) : undefined;
    const col = j ? m.elements.get(j.columnElementId) : undefined, sec = col ? m.sections.get(col.sectionId) : undefined;
    const rows: CheckRow[] = [];
    if (head.drop && node) rows.push(...dropPanelRules(head.drop, h, { x: bay(axesX, node.x) || head.drop.bx * 3, y: bay(axesY, node.y) || head.drop.by * 3 }));
    if (j && sec?.b && sec.h) {
      const pos = j.position === 'edge' || j.position === 'corner' ? j.position : 'interior';
      rows.push(...headPunching({ Vu: j.Vu, qu: 0, slabH: h, cover: dd.covers.slab, barDia: 12, fc: (mat ? concreteFc(mat) : undefined) ?? 25,
        column: { b: sec.b, h: sec.h, ...(head.capital ? { capital: head.capital } : {}) }, ...(head.drop ? { drop: head.drop } : {}), position: pos, ...(j.comboName ? { comboName: j.comboName } : {}) }));
    } else rows.push({ code: 'cirsoc-201', edition: '2025', clause: '22.6', title: 'Punching', titleKey: 'check.drop.noJoint', formula: 'run the floor design for the joint\'s Vu', inputs: [], ratio: null, status: 'notVerified' });
    return { nodeId, head, rows, status: statusOf(rows) };
  });
}

/** The nodes on vertical springs (the mat's), with the area each carries of the shells among them. */
export function matNodes(): Map<number, number> {
  const m = modelStore.model;
  const sprung = new Set([...m.supports.values()].filter((s) => (s as { kz?: number }).kz && (s as { kz?: number }).kz! > 0).map((s) => s.nodeId));
  if (sprung.size === 0) return new Map();
  const shells = [...m.quads.values(), ...m.plates.values()].filter((q) => q.nodes.every((n) => sprung.has(n))).map((q) => ({ nodes: [...q.nodes] }));
  return tributaryAreas(m.nodes as never, shells);
}

/** The mat: the worst soil pressure over every solved combination and where the mat lifts. */
export function matChecks(): { rows: CheckRow[]; status: CheckRow['status']; nodes: number } | null {
  const areas = matNodes();
  if (areas.size === 0) return null;
  const geo = modelStore.model.geotechnical;
  const profile = geo?.profiles.find((p) => p.id === geo.defaultProfileId) ?? geo?.profiles[0];
  const qadm = profile && profile.bearing.kind === 'allowablePressure' ? profile.bearing.allowableBearingKPa : null;
  const comboName = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));
  let per = [...activePerCombo3D()].map(([id, r]) => ({ name: comboName.get(id) ?? String(id), r }));
  const single = per.length === 0 ? activeResultSet3D() : null;
  if (single) per = [{ name: 'solve', r: single }];
  let worst: CheckRow[] | null = null, worstQ = -Infinity;
  for (const { name, r } of per) {
    const reactions = new Map((r.reactions ?? []).map((x) => [x.nodeId, x.fz]));
    const ps = matPressures(reactions, areas);
    const q = Math.max(0, ...ps.map((p) => p.q)), lifts = ps.some((p) => p.lift);
    const rows = matRows(ps, qadm, name);
    if (q > worstQ || (lifts && worst?.[1]?.status !== 'fail')) { worst = rows; worstQ = q; }
  }
  return worst ? { rows: worst, status: statusOf(worst), nodes: areas.size } : null;
}

/** Each pile cap's piles: an equal share of the column's load against capacity and section. */
export function pileChecks(): Array<{ footingId: number; rows: CheckRow[]; status: CheckRow['status'] }> {
  const m = modelStore.model, geo = m.geotechnical, sd = specialData();
  const caps = [...m.footings.values()].filter((f) => f.kind === 'pileCap' && f.piles);
  if (!caps.length) return [];
  const reactions = collectNodeReactions(caps.map((f) => f.nodeId));
  return caps.map((f) => {
    const profile = geo?.profiles.find((p) => p.id === (f.soilProfileId ?? geo.defaultProfileId)) ?? geo?.profiles[0];
    const r = reactions.get(f.nodeId), n = f.piles!.count;
    const service = (r?.cases ?? []).filter((c) => c.caseType === 'D' || c.caseType === 'L').reduce((s, c) => s + c.fz, 0) / n;
    const gov = [...(r?.factored ?? [])].sort((a, b) => b.fz - a.fz)[0];
    const fc = 25, ag = (Math.PI * f.piles!.diameter ** 2) / 4;
    const rows = pileRows(profile?.strata ?? [], f.piles!, { service, factored: (gov?.fz ?? 0) / n, ...(gov ? { comboName: gov.combinationName } : {}) }, { fc, fy: designData().rebarFy, as: (sd.pileSteelRatio ?? 0.01) * ag });
    return { footingId: f.id, rows, status: statusOf(rows) };
  });
}
