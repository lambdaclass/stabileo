/**
 * PRO's DXF of the envelope and of a magnitude set, on a fixed portal with a 6 m beam and two
 * combinations: W (a lateral load, antisymmetric beam moments, no member load) listed first, and D
 * (a UDL on the beam, hogging ends, sagging midspan).
 *
 * The envelope's end forces are each end's largest from whichever combination gives it, with the
 * first combination's member loads: integrated as one load state they drew the beam at 320 kN·m
 * against an envelope peak of 49. The DXF draws the envelope's own station curves, as the figures
 * do. An envelope or an SRSS set is no deflected state: neither has a deformed shape, and the
 * envelope's reactions are written as values, without an arrow composed of three combinations.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../../store/active-results';
import { proDxf } from '../../pro/dxf-export';
import { resultSet, type ResultSetKey } from '../../pro/export-results';
import { DXF_CONTENTS, layerName, type DxfContents } from '../../dxf/writer';
import { computeDiagram3D, formatDiagramValue3D } from '../../engine/diagrams-3d';
import { projectNodeToScene, shouldProjectModelToXZ } from '../../geometry/coordinate-system';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); resultsStore.clear3D(); });

const allOff: DxfContents = Object.fromEntries(DXF_CONTENTS.map((k) => [k, false])) as unknown as DxfContents;

/** The DXF's entities as [type, layer, the group codes after them]. */
function entities(dxf: string): Array<{ type: string; layer: string; codes: Map<string, string[]> }> {
  const lines = dxf.split('\n');
  const start = lines.indexOf('ENTITIES');
  const out: Array<{ type: string; layer: string; codes: Map<string, string[]> }> = [];
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    const code = lines[i]!, value = lines[i + 1]!;
    if (code === '0') {
      if (value === 'ENDSEC') break;
      out.push({ type: value, layer: '', codes: new Map() });
    } else if (out.length) {
      const e = out[out.length - 1]!;
      if (code === '8') e.layer = value;
      e.codes.set(code, [...(e.codes.get(code) ?? []), value]);
    }
  }
  return out;
}

/** The 3D polylines, as vertex lists, with their layer. */
function polylines(dxf: string): Array<{ layer: string; pts: Array<[number, number, number]> }> {
  const out: Array<{ layer: string; pts: Array<[number, number, number]> }> = [];
  let cur: { layer: string; pts: Array<[number, number, number]> } | null = null;
  for (const e of entities(dxf)) {
    if (e.type === 'POLYLINE') { cur = { layer: e.layer, pts: [] }; out.push(cur); }
    else if (e.type === 'VERTEX' && cur) cur.pts.push([Number(e.codes.get('10')![0]), Number(e.codes.get('20')![0]), Number(e.codes.get('30')![0])]);
    else if (e.type === 'SEQEND') cur = null;
  }
  return out;
}

/** The portal, W's combination listed before D's, solved and published. */
function portal() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(6, 0, 3), d = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b, 'frame');
  const beam = modelStore.addElement(b, c, 'frame');
  modelStore.addElement(d, c, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
  for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
  const dead = modelStore.addLoadCase('D', 'D'), wind = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, dead);
  modelStore.addNodalLoad3D(b, 60, 0, 0, 0, 0, 0, wind);
  const w = modelStore.addCombination('1.0W', [{ caseId: wind, factor: 1 }]);
  const dc = modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]);
  const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  return { b, c, beam, w, d: dc };
}

function scene(id: number): [number, number, number] {
  const flat = shouldProjectModelToXZ({
    analysisMode: uiStore.analysisMode, viewportPresentation3D: uiStore.viewportPresentation3D,
    nodes: modelStore.nodes.values(), supports: modelStore.supports.values(), loads: modelStore.loads,
    plateCount: modelStore.plates.size, quadCount: modelStore.quads.size,
  });
  const p = projectNodeToScene(modelStore.nodes.get(id)!, flat);
  return [p.x, p.y, p.z ?? 0];
}

/** The bending component that carries the beam's gravity moment, and the beam's envelope of it. */
function gravityEnvelope(beam: number) {
  const env = resultsStore.envelope3D!;
  const of = (k: 'momentY' | 'momentZ') => env[k].elements.find((e) => e.elementId === beam)!;
  const peak = (k: 'momentY' | 'momentZ') => Math.max(...of(k).posValues.map(Math.abs), ...of(k).negValues.map(Math.abs));
  const kind = peak('momentY') >= peak('momentZ') ? 'momentY' as const : 'momentZ' as const;
  return { kind, layer: layerName(`${t('dxf.layerMoments')}_${kind === 'momentZ' ? 'Mz' : 'My'}`), env: env[kind], beam: of(kind), peak: peak(kind) };
}

const momentDxf = (set: ResultSetKey) => proDxf({ contents: { ...allOff, moment: true }, projection: 'space', units: 'm', set, diagramFactor: 1 });

describe('the DXF of the envelope', () => {
  it("draws the beam's envelope at midspan, where D's sagging governs though W is listed first", () => {
    const { b, c, beam } = portal();
    const g = gravityEnvelope(beam);
    const mid = g.beam.tPositions.findIndex((x) => Math.abs(x - 0.5) < 1e-9);
    const envMid = Math.max(Math.abs(g.beam.posValues[mid]!), Math.abs(g.beam.negValues[mid]!)) / g.env.globalMax;

    const pI = scene(b), pJ = scene(c);
    const ax = [pJ[0] - pI[0], pJ[1] - pI[1], pJ[2] - pI[2]] as const;
    const L = Math.hypot(...ax);
    /** A vertex's place along the beam (0..1) and its distance off it. */
    const along = (v: [number, number, number]) => {
      const w = [v[0] - pI[0], v[1] - pI[1], v[2] - pI[2]];
      const s = (w[0]! * ax[0] + w[1]! * ax[1] + w[2]! * ax[2]) / L;
      return { t: s / L, off: Math.sqrt(Math.max(0, w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2 - s * s)) };
    };
    const all = polylines(momentDxf('envelope')).filter((p) => p.layer === g.layer);
    // Every member's curve stands off its own base line; the largest of all is the global maximum.
    const maxOffset = Math.max(...all.flatMap((pl) => {
      const s = pl.pts[0]!, e = pl.pts[pl.pts.length - 1]!;
      const u = [e[0] - s[0], e[1] - s[1], e[2] - s[2]], l = Math.hypot(...u) || 1;
      return pl.pts.map((v) => {
        const w = [v[0] - s[0], v[1] - s[1], v[2] - s[2]], tt = (w[0]! * u[0]! + w[1]! * u[1]! + w[2]! * u[2]!) / l;
        return Math.sqrt(Math.max(0, w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2 - tt * tt));
      });
    }));
    const near = (p: number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) < 1e-6;
    const onBeam = all.filter((pl) => near(pl.pts[0]!, pI) && near(pl.pts[pl.pts.length - 1]!, pJ));
    expect(onBeam.length).toBeGreaterThan(0);
    const drawnMid = onBeam.map((pl) => pl.pts.slice(1, -1).map(along).reduce((p, q) => (Math.abs(q.t - 0.5) < Math.abs(p.t - 0.5) ? q : p)).off / maxOffset);
    expect(drawnMid.some((x) => Math.abs(x - envMid) < 0.02)).toBe(true);
  });

  it("prints the beam's envelope peak, on the envelope's set and on the screen's", () => {
    const { beam } = portal();
    const g = gravityEnvelope(beam);
    const labels = (dxf: string) => entities(dxf).filter((e) => e.type === 'TEXT' && e.layer === g.layer).map((e) => Math.abs(Number(e.codes.get('1')![0])));
    // The mixed end forces integrated with W's (no) member loads printed 320.59 here.
    expect(labels(momentDxf('envelope')).some((v) => Math.abs(v - g.peak) < 0.01)).toBe(true);
    expect(Math.max(...labels(momentDxf('envelope')))).toBeLessThanOrEqual(g.env.globalMax + 0.01);
    resultsStore.activeView = 'envelope';
    expect(labels(momentDxf('screen')).some((v) => Math.abs(v - g.peak) < 0.01)).toBe(true);
  });

  it('has no deformed shape, and its reactions are values without arrows', () => {
    portal();
    const dxf = proDxf({ contents: { ...allOff, deformed: true, reactions: true }, projection: 'space', units: 'm', set: 'envelope', diagramFactor: 1 });
    const ents = entities(dxf);
    expect(ents.some((e) => e.layer === layerName(t('dxf.layerDeformed')))).toBe(false);
    const reactions = ents.filter((e) => e.layer === layerName(t('dxf.layerReactions')));
    expect(reactions.some((e) => e.type === 'TEXT')).toBe(true);
    expect(reactions.some((e) => e.type === 'LINE')).toBe(false);
    // The RESULTS layer says why the deformed shape is not there.
    expect(dxf).toContain(t('dxf.noDeformedEnvelope'));
  });
});

describe('the DXF of an SRSS combination', () => {
  it('has no deformed shape: its displacements are magnitudes without a sign', () => {
    const { d } = portal();
    modelStore.updateCombination(d, { method: 'srss' });
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    expect(resultsStore.perCombo3D.get(d)?.magnitude?.method).toBe('srss');
    const dxf = proDxf({ contents: { ...allOff, deformed: true, reactions: true }, projection: 'space', units: 'm', set: `combo:${d}`, diagramFactor: 1 });
    const ents = entities(dxf);
    expect(ents.some((e) => e.layer === layerName(t('dxf.layerDeformed')))).toBe(false);
    expect(ents.some((e) => e.layer === layerName(t('dxf.layerReactions')) && e.type === 'LINE')).toBe(false);
    expect(dxf).toContain(t('dxf.noDeformedMagnitude'));
  });
});

describe('the DXF of one combination', () => {
  it('prints its moments in the sign the 3D view prints them, and keeps its deformed shape', () => {
    const { beam, d } = portal();
    const g = gravityEnvelope(beam);
    const dg = computeDiagram3D(resultSet(`combo:${d}`).results!.elementForces.find((f) => f.elementId === beam)!, g.kind);
    const screen = parseFloat(formatDiagramValue3D(dg.maxAbsValue, g.kind));
    const labels = entities(momentDxf(`combo:${d}`)).filter((e) => e.type === 'TEXT' && e.layer === g.layer).map((e) => Number(e.codes.get('1')![0]));
    expect(labels.some((v) => Math.abs(v - screen) < 0.06)).toBe(true);
    const dxf = proDxf({ contents: { ...allOff, deformed: true, reactions: true }, projection: 'space', units: 'm', set: `combo:${d}`, diagramFactor: 1 });
    expect(entities(dxf).some((e) => e.layer === layerName(t('dxf.layerDeformed')))).toBe(true);
    expect(entities(dxf).some((e) => e.layer === layerName(t('dxf.layerReactions')) && e.type === 'LINE')).toBe(true);
  });
});
