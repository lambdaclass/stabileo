/**
 * The project's listings by topic, each its own document: project data, combinations, beams by
 * region with what they need and what they hold and their deflection as L/x, the beams' steel by
 * face and stirrups, columns and walls, column forces by case, slabs, foundations, stairs, every
 * check with the article it stands on, quantities with indices per m² of floor, and surfaces and
 * volumes. Read from the same stores the screens read; written by `lib/listings/listing.ts`.
 */
import { teAt } from '../i18n/engine-text';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { detailingStore } from './detailing.svelte';
import { storedDecisions } from './design-decisions';
import { designData } from './design-data';
import { levelNamer, measure } from './takeoff';
import { deflectionChecks } from './serviceability';
import { stairChecks } from './stairs-pt';
import { corbelChecks, openingChecks } from './special-elements';
import { designLength } from './design-spans-store';
import { checkClause } from '../engine/design/check-clauses';
import { noticesOf } from '../engine/design/notice-catalogue';
import { holdText } from './member-verdict';
import { memberNames, wallNames } from './member-names';
import { configure, type Listing, type ListingConfig } from '../listings/listing';

export const LISTING_IDS = ['project', 'combinations', 'beams', 'beamSteel', 'columns', 'columnForces', 'slabs', 'foundation', 'stairs', 'checks', 'quantities', 'surfaces'] as const;
export type ListingId = (typeof LISTING_IDS)[number];

export interface ListingSettings { configs?: Partial<Record<ListingId, ListingConfig>>; wastePct?: number }
export const listingSettings = (): ListingSettings => (designData().listings ?? {}) as ListingSettings;

const kgPerM = (d: number) => Math.PI * (d / 2000) ** 2 * 7850;
const regionOf = (r?: [number, number]) => (!r ? '' : r[1] <= 0.34 ? 'start' : r[0] >= 0.66 ? 'end' : 'span');

/** One listing, built and configured as the project says. */
export function listing(id: ListingId, locale: string): Listing {
  return configure(buildListing(id, locale), listingSettings().configs?.[id]);
}

/** One listing with every column and row, before the project's choice. */
export function buildListing(id: ListingId, locale: string): Listing {
  const tr = (k: string, p?: Record<string, string | number>) => teAt({ key: k, ...(p ? { params: p } : {}) }, locale);
  const col = (key: string, unit?: string, align: 'left' | 'right' = 'left', digits?: number) => ({ key, label: tr(`list.col.${key}`), ...(unit ? { unit } : {}), align, ...(digits !== undefined ? { digits } : {}) });
  const title = tr(`list.${id}.title`);
  const m = modelStore.model, st = listingSettings();
  const ctxOf = (x: number) => verificationStore.contextFor(x);
  const status = (s?: string) => (s ? tr(`list.status.${s}`) : '—');
  /**
   * The member's verdict, as the desk and the inspector state it (`memberVerdict`): its checks
   * AND what holds it (an open detailing condition, a refusal, its analysis). A row of checks that
   * pass says «verifica» for that check; the member's status says whether the member does. They
   * read apart on the QA of 20-oct: «verifica» in the listing, «no verifica» in the panel.
   */
  const names = memberNames();
  /** A span's pieces share one context: listed once, under the piece it is designed under. */
  const listed = (eid: number) => { const sp = ctxOf(eid)?.span; return !sp || sp.representative === eid; };
  const verdictOf = (eid: number) => {
    const v = verificationStore.memberVerdict(eid);
    const key = v.status === 'unavailable' ? 'notVerified' : v.status;
    return { verdict: status(key), held: v.holds.length ? v.holds.map((h) => holdText(h, tr)).join(' · ') : '' };
  };
  let l: Listing;
  switch (id) {
    case 'project': {
      const i = m.projectInfo, d = designData();
      const conc = [...m.materials.values()].filter((x) => (x as { fc?: number }).fc !== undefined).map((x) => `${x.name} (f'c ${(x as { fc?: number }).fc} MPa)`).join(', ');
      const kv: Array<[string, string | undefined]> = [
        ['job', i?.job], ['jobNumber', i?.jobNumber], ['site', i?.site], ['client', i?.client],
        ['designer', i?.designer?.name], ['checker', i?.checker?.name], ['approver', i?.approver?.name],
        ['concrete', conc || undefined], ['steel', `${d.rebarGrade} (fy ${d.rebarFy} MPa)`],
        ['covers', Object.entries(d.covers).map(([k, v]) => `${tr(`list.kind.${k}`)} ${Math.round(v * 1000)} mm`).join(' · ')],
      ];
      l = { id, title, columns: [col('item'), col('value')], rows: kv.map(([k, v]) => ({ item: tr(`list.item.${k}`), value: v ?? null })) };
      break;
    }
    case 'combinations': {
      const cases = m.loadCases;
      l = {
        id, title,
        columns: [col('combo'), col('method'), ...cases.map((c) => ({ key: `c${c.id}`, label: c.name, align: 'right' as const, digits: 2 }))],
        rows: m.combinations.map((c) => ({ combo: c.name, method: tr(`list.method.${c.method ?? 'linear'}`), ...Object.fromEntries(cases.map((lc) => [`c${lc.id}`, c.factors.find((f) => f.caseId === lc.id)?.factor ?? null])) })),
      };
      break;
    }
    case 'beams': {
      const defl = deflectionChecks().rows;
      const rows: Listing['rows'] = [];
      for (const [eid, ctx] of verificationStore.contexts) {
        if (ctx.elementType !== 'beam' || !listed(eid)) continue;
        const v = verificationStore.providedFor(eid);
        const dv = defl.get(eid), L = designLength(eid, ctxOf);
        const lx = dv && dv.measured > 1e-9 ? `L/${Math.round(L / dv.measured)}` : '—';
        for (const c of v?.checks ?? []) {
          const reg = regionOf(c.regionRange);
          rows.push({
            member: names.name(eid), section: m.sections.get(m.elements.get(eid)?.sectionId ?? -1)?.name ?? '', region: reg ? tr(`list.region.${reg}`) : '—',
            check: c.category, demand: c.demand ?? null, capacity: c.capacity ?? null, required: c.required ?? null, provided: c.provided ?? null,
            unit: c.unit, ratio: c.ratio, status: status(c.status), article: checkClause(c, 'beam') ?? '—', deflection: lx, ...verdictOf(eid),
          });
        }
        // A member with no checks (refused, no bars) is listed all the same, with what holds it.
        if (!v?.checks?.length) rows.push({ member: names.name(eid), section: m.sections.get(m.elements.get(eid)?.sectionId ?? -1)?.name ?? '', region: '—', check: '—', demand: null, capacity: null, required: null, provided: null, unit: '', ratio: null, status: status('none'), article: '—', deflection: lx, ...verdictOf(eid) });
      }
      l = { id, title, columns: [col('member'), col('section'), col('region'), col('check'), col('demand', undefined, 'right'), col('capacity', undefined, 'right'), col('required', undefined, 'right'), col('provided', undefined, 'right'), col('unit'), col('ratio', undefined, 'right'), col('status'), col('article'), col('deflection'), col('verdict'), col('held')], rows };
      break;
    }
    case 'beamSteel': {
      const beams = new Set([...verificationStore.contexts].filter(([, c]) => c.elementType === 'beam').map(([id]) => id));
      const acc = new Map<string, { member: string; part: string; diameter: number; count: number; length: number }>();
      for (const a of detailingStore.assemblies) for (const b of a.bars) {
        const owner = b.ownerElementIds.find((x) => beams.has(x));
        if (owner === undefined) continue;
        const part = b.role === 'transverse' ? 'stirrups' : (b.layerId ?? '').includes(':top') ? 'top' : 'bottom';
        const k = `${owner}|${part}|${b.diameterMm}`, cur = acc.get(k) ?? { member: `#${owner}`, part: tr(`list.part.${part}`), diameter: b.diameterMm, count: 0, length: 0 };
        cur.count += 1; cur.length += b.cuttingLength / Math.max(1, b.ownerElementIds.length);
        acc.set(k, cur);
      }
      l = { id, title, columns: [col('member'), col('part'), col('diameter', 'mm', 'right', 0), col('count', undefined, 'right', 0), col('length', 'm', 'right', 2), col('mass', 'kg', 'right', 1)], rows: [...acc.values()].sort((p, q) => p.member.localeCompare(q.member, undefined, { numeric: true }) || p.part.localeCompare(q.part) || p.diameter - q.diameter).map((r) => ({ ...r, mass: r.length * kgPerM(r.diameter) })) };
      break;
    }
    case 'columns': {
      const rows: Listing['rows'] = [];
      for (const [eid, ctx] of verificationStore.contexts) {
        if (ctx.elementType !== 'column' && ctx.elementType !== 'wall') continue;
        const r = m.elements.get(eid)?.reinforcement;
        const n = r?.column ? 4 + r.column.nBottom + r.column.nTop + r.column.nLeft + r.column.nRight : r?.shaped?.count ?? r?.longitudinal?.count;
        const d = r?.column?.cornerDia ?? r?.shaped?.diameter ?? r?.longitudinal?.diameter;
        const As = r?.column ? 4 * Math.PI * (r.column.cornerDia / 20) ** 2 + (n! - 4) * Math.PI * (r.column.faceDia / 20) ** 2 : n && d ? n * Math.PI * (d / 20) ** 2 : 0;
        const Ag = ctx.section.b * ctx.section.h * 1e4;
        rows.push({ member: names.name(eid), kind: tr(`list.kind.${ctx.elementType}`), section: m.sections.get(m.elements.get(eid)?.sectionId ?? -1)?.name ?? '', bars: n && d ? `${n}Ø${d}` : '—', ties: r?.stirrups ? `eØ${r.stirrups.diameter} c/${Math.round(r.stirrups.spacing * 100)}` : '—', rho: Ag > 0 && As > 0 ? (As / Ag) * 100 : null, ratio: verificationStore.getDisplayRatio(eid), status: verdictOf(eid).verdict, held: verdictOf(eid).held });
      }
      const saved = storedDecisions().walls ?? {};
      const wallName = wallNames(detailingStore.lastFloorRun?.walls ?? []);
      for (const w of detailingStore.lastFloorRun?.walls ?? []) {
        const r = saved[w.wallId] ?? w.reinforcement;
        rows.push({ member: wallName.get(w.wallId) ?? w.wallId, kind: tr('list.kind.wall'), section: `${Math.round(w.input.thickness * 100)} cm`, bars: `V Ø${r.vertical.diameter} c/${Math.round(r.vertical.spacing * 100)}`, ties: `H Ø${r.horizontal.diameter} c/${Math.round(r.horizontal.spacing * 100)}`, rho: null, ratio: Math.max(w.shear.utilization, w.axialFlexure.utilization), status: '—' });
      }
      l = { id, title, columns: [col('member'), col('kind'), col('section'), col('bars'), col('ties'), col('rho', '%', 'right', 2), col('ratio', undefined, 'right', 2), col('status'), col('held')], rows };
      break;
    }
    case 'columnForces': {
      const rows: Listing['rows'] = [];
      const caseName = (cid: number) => m.loadCases.find((c) => c.id === cid)?.name ?? `#${cid}`;
      for (const [eid, ctx] of verificationStore.contexts) {
        if (ctx.elementType !== 'column') continue;
        for (const [cid, r] of resultsStore.perCase3D) {
          const f = r.elementForces.find((x) => x.elementId === eid);
          if (!f) continue;
          rows.push({ member: names.name(eid), case: caseName(cid), n: f.nStart, vy: f.vyStart, vz: f.vzStart, my: f.myStart, mz: f.mzStart, t: f.mxStart });
        }
      }
      l = { id, title, columns: [col('member'), col('case'), col('n', 'kN', 'right', 1), col('vy', 'kN', 'right', 1), col('vz', 'kN', 'right', 1), col('my', 'kN·m', 'right', 1), col('mz', 'kN·m', 'right', 1), col('t', 'kN·m', 'right', 1)], rows, notes: [tr('list.columnForces.note')] };
      break;
    }
    case 'slabs': {
      const saved = storedDecisions().slabs ?? {};
      const rows: Listing['rows'] = [];
      for (const s of detailingStore.lastFloorRun?.slabs ?? []) {
        if (!s.panel) continue;
        const r = saved[s.panelId] ?? s.panel.reinforcement;
        const base = (['bottomX', 'bottomY', 'topX', 'topY'] as const).map((k) => (r.base[k] ? `${k}: Ø${r.base[k]!.diameter} c/${Math.round(r.base[k]!.spacing * 100)}` : '')).filter(Boolean).join(' · ');
        rows.push({ member: s.panelId, base: base || '—', bands: r.bands.length, ratio: s.panel.check.worst, status: status(s.panel.check.worst > 1 ? 'fail' : 'ok') });
      }
      l = { id, title, columns: [col('member'), col('base'), col('bands', undefined, 'right', 0), col('ratio', undefined, 'right', 2), col('status')], rows };
      break;
    }
    case 'foundation': {
      const run = detailingStore.lastFootingRun;
      const rows = [...m.footings.values()].map((f) => {
        const o = run?.outcomes.find((x) => x.footingId === f.id);
        const mats = f.mats;
        return { member: o?.name ?? `#${f.id}`, size: `${f.B.toFixed(2)} × ${f.L.toFixed(2)} × ${f.thickness.toFixed(2)}`, mats: mats ? `Ø${mats.bottomX.diameterMm} c/${Math.round(mats.bottomX.spacing * 100)} · Ø${mats.bottomY.diameterMm} c/${Math.round(mats.bottomY.spacing * 100)}` : '—', status: status(o?.check?.status === 'OK' ? 'ok' : o?.check?.status === 'FAIL' ? 'fail' : o?.check?.status === 'UNSUPPORTED' ? 'unsupported' : 'notVerified') };
      });
      l = { id, title, columns: [col('member'), col('size', 'm'), col('mats'), col('status')], rows };
      break;
    }
    case 'stairs': {
      l = { id, title, columns: [col('member'), col('bars'), col('status')], rows: stairChecks().map((s) => ({ member: s.entry.name, bars: s.design.bars.map((b) => `${b.mark} ${b.count}Ø${b.diameterMm} c/${Math.round(b.spacing * 100)}`).join(' · '), status: status(s.status) })) };
      break;
    }
    case 'checks': {
      const rows: Listing['rows'] = [];
      for (const [eid, ctx] of verificationStore.contexts) {
        if (!listed(eid)) continue;
        const kind = ctx.elementType === 'column' ? 'column' : ctx.elementType === 'wall' ? 'wall' : 'beam';
        const v = verificationStore.providedFor(eid);
        const code = noticesOf(verificationStore.outcomeFor(eid)).map((n) => n.code).join(' ') || '';
        const vd = verdictOf(eid);
        for (const c of v?.checks ?? []) rows.push({ family: tr(`list.kind.${kind}`), member: names.name(eid), check: c.category, computed: c.demand ?? c.required ?? null, limit: c.capacity ?? c.provided ?? null, unit: c.unit, ratio: c.ratio, status: status(c.status), article: checkClause(c, kind) ?? '—', notice: c.status === 'fail' ? code : '', ...vd });
        if (!v?.checks?.length) rows.push({ family: tr(`list.kind.${kind}`), member: names.name(eid), check: '—', computed: null, limit: null, unit: '', ratio: null, status: status('none'), article: '—', notice: code, ...vd });
      }
      const special = (fam: string, name: string, rs: ReadonlyArray<{ title: string; clause?: string; demand?: number; capacity?: number; unit?: string; ratio: number | null; status: string }>) => {
        for (const r of rs) rows.push({ family: fam, member: name, check: r.title, computed: r.demand ?? null, limit: r.capacity ?? null, unit: r.unit ?? '', ratio: r.ratio, status: status(r.status), article: r.clause ?? '—', notice: '', verdict: status(r.status), held: '' });
      };
      for (const c of corbelChecks()) special(tr('list.kind.corbel'), c.entry.name, c.rows);
      for (const o of openingChecks()) special(tr('list.kind.opening'), `#${o.entry.elementId}`, o.rows);
      for (const s of stairChecks()) special(tr('list.kind.stair'), s.entry.name, s.rows);
      l = { id, title, columns: [col('family'), col('member'), col('check'), col('computed', undefined, 'right'), col('limit', undefined, 'right'), col('unit'), col('ratio', undefined, 'right'), col('status'), col('article'), col('notice'), col('verdict'), col('held')], rows };
      break;
    }
    case 'quantities': {
      const w = Math.max(0, st.wastePct ?? 0) / 100;
      const byDia = new Map<number, number>();
      for (const a of detailingStore.assemblies) for (const b of a.bars) byDia.set(b.diameterMm, (byDia.get(b.diameterMm) ?? 0) + b.cuttingLength * kgPerM(b.diameterMm));
      const meas = measure(), concrete = meas.items.reduce((s, x) => s + x.concrete, 0), formwork = meas.items.reduce((s, x) => s + x.formwork, 0);
      const area = floorArea(), steel = [...byDia.values()].reduce((s, x) => s + x, 0);
      const rows: Listing['rows'] = [...byDia].sort((p, q) => p[0] - q[0]).map(([d, kg]) => ({ item: `Ø${d}`, unit: 'kg', net: kg, gross: kg * (1 + w), index: area > 0 ? (kg * (1 + w)) / area : null }));
      rows.push({ item: tr('list.item.steelTotal'), unit: 'kg', net: steel, gross: steel * (1 + w), index: area > 0 ? (steel * (1 + w)) / area : null });
      rows.push({ item: tr('list.item.concrete'), unit: 'm³', net: concrete, gross: concrete, index: area > 0 ? concrete / area : null });
      rows.push({ item: tr('list.item.formwork'), unit: 'm²', net: formwork, gross: formwork, index: area > 0 ? formwork / area : null });
      l = { id, title, columns: [col('item'), col('unit'), col('net', undefined, 'right', 2), col('gross', undefined, 'right', 2), col('index', tr('list.perM2'), 'right', 3)], rows, notes: [tr('list.quantities.note', { w: Math.round(w * 1000) / 10, a: area.toFixed(2) })] };
      break;
    }
    case 'surfaces': {
      const meas = measure(), levels = new Map<string, { concrete: number; formwork: number; byKind: Map<string, number> }>();
      for (const x of meas.items) { const v = levels.get(x.level) ?? { concrete: 0, formwork: 0, byKind: new Map() }; v.concrete += x.concrete; v.formwork += x.formwork; v.byKind.set(x.kind, (v.byKind.get(x.kind) ?? 0) + x.concrete); levels.set(x.level, v); }
      const areas = floorAreaByZ();
      l = { id, title, columns: [col('level'), col('area', 'm²', 'right', 2), col('concrete', 'm³', 'right', 3), col('formwork', 'm²', 'right', 2), col('detail')], rows: [...levels].map(([lv, v]) => ({ level: lv, area: areas.get(lv) ?? null, concrete: v.concrete, formwork: v.formwork, detail: [...v.byKind].map(([k, c]) => `${tr(`list.kind.${k}`)} ${c.toFixed(2)}`).join(' · ') })) };
      break;
    }
  }
  return l;
}

/** Every listing's columns as built, for the column chooser. */
export const listingColumns = (id: ListingId, locale: string) => buildListing(id, locale).columns;

/** The floor area the slabs make, m² (their shells' plan area). */
function floorArea(): number { return [...floorAreaByZ().values()].reduce((s, a) => s + a, 0); }
function floorAreaByZ(): Map<string, number> {
  const m = modelStore.model, out = new Map<string, number>(), names = levelNamer();
  for (const q of m.quads.values()) {
    const ps = q.nodes.map((id) => m.nodes.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    if (ps.length < 3 || !ps.every((p) => Math.abs((p.z ?? 0) - (ps[0]!.z ?? 0)) < 0.01)) continue;
    let a = 0;
    for (let i = 0; i < ps.length; i++) { const p = ps[i]!, n = ps[(i + 1) % ps.length]!; a += p.x * n.y - n.x * p.y; }
    const key = names.name(ps[0]!.z ?? 0);
    out.set(key, (out.get(key) ?? 0) + Math.abs(a) / 2);
  }
  return out;
}

export function setListingConfig(id: ListingId, c: ListingConfig | undefined): void {
  const cur = listingSettings(), configs = { ...cur.configs };
  if (c) configs[id] = c; else delete configs[id];
  modelStore.setDesignData({ ...designData(), listings: { ...cur, configs } });
}
export function setWastePct(p: number): void {
  modelStore.setDesignData({ ...designData(), listings: { ...listingSettings(), wastePct: Math.max(0, Math.min(50, p)) } });
}
