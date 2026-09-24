/**
 * The model as code: lossless both ways, complete by construction, and safe to apply.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { COVERED_FIELDS, DERIVED_FIELDS, DERIVED_SUBFIELDS } from '../coverage';
import { modelToCode, codeToModel } from '../format';
import { applyCode } from '../apply';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

/** The covered part of a snapshot, produced subfields removed — what the code must reproduce. */
function covered(snap: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const f of COVERED_FIELDS) {
    if (snap[f] === undefined) continue;
    out[f] = f === 'elements'
      ? snap.elements.map(([id, e]: [number, any]) => {
          const c = { ...e };
          for (const k of DERIVED_SUBFIELDS.elements ?? []) delete c[k];
          return [id, c];
        })
      : snap[f];
  }
  return JSON.parse(JSON.stringify(out));
}

function roundTrip() {
  const snap = modelStore.snapshot() as unknown as Record<string, any>;
  const code = modelToCode(snap as never);
  const r = codeToModel(code);
  expect(r.errors, r.errors.map((e) => `${e.line}: ${e.message}`).join('\n')).toEqual([]);
  const back = covered(r.snapshot as Record<string, any>);
  const orig = covered(snap);
  // Empty families come back as empty lists; an absent family and an empty one are one thing.
  for (const f of Object.keys(back)) if (Array.isArray(back[f]) && (back[f] as unknown[]).length === 0 && orig[f] === undefined) delete back[f];
  for (const f of Object.keys(orig)) if (Array.isArray(orig[f]) && (orig[f] as unknown[]).length === 0 && back[f] === undefined) delete orig[f];
  expect(back).toEqual(orig);
  return code;
}

describe('round trip', () => {
  for (const example of ['pro-edificio-7p', 'rc-design-qa-8', '3d-nave-industrial', 'mat-foundation', 'cable-stayed-bridge', 'portal-frame']) {
    it(`reads back what it wrote: ${example}`, async () => {
      await modelStore.loadExample(example);
      roundTrip();
    });
  }

  it('carries the rare fields: offsets, joints, curve tags, groups with data, a mass source', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0.5);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, {
      rollAngle: 12.5, localYx: 0, localYy: 1, localYz: 0,
      offset: { frame: 'local', j: { x: 0, y: 0.05, z: -0.1 } },
      jointJ: { dof: [false, false, false, false, true, false] },
      releaseI: { my: true, mz: false, t: false },
      arc: { id: 17, spec: { start: { x: 0, y: 0, z: 0 }, through: { x: 2, y: 1, z: 0 }, end: { x: 4, y: 0, z: 0.5 }, segments: 8 } },
    } as never);
    modelStore.addGroup('Pieza P-1', 'precastPiece', { elements: [e] }, { data: { mould: 'M4', rules: { lift: [1, 3] } } });
    modelStore.setMassSource({ kind: 'preset', presetId: 'cirsoc103-2018', params: { occupancy: 'high' } });
    modelStore.addDistributedLoad3D(e, 0, 0, -3, -7, 0.5, 3, 1);
    roundTrip();
  });

  it('keeps a negative zero', () => {
    modelStore.addNode(-0, 0, 0);
    modelStore.addNode(1, 0, 0);
    const code = roundTrip();
    expect(code).toContain('node 1 -0 0');
  });
});

describe('coverage — every field of the snapshot is either carried or declared derived', () => {
  const src = readFileSync(new URL('../../../store/history.svelte.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export interface ModelSnapshot'));
  const block = body.slice(0, body.indexOf('\n}\n'));
  const declared = [...block.matchAll(/^ {2}([A-Za-z]+)\??:/gm)].map((m) => m[1]!);

  it('reads the declared fields', () => {
    expect(declared.length).toBeGreaterThan(20);
  });

  it('has no field that is neither', () => {
    const known = new Set<string>([...COVERED_FIELDS, ...Object.keys(DERIVED_FIELDS)]);
    expect(declared.filter((f) => !known.has(f)), 'add each to COVERED_FIELDS or to DERIVED_FIELDS with its reason').toEqual([]);
  });

  it('lists nothing the snapshot no longer has, and gives every derived field a reason', () => {
    const d = new Set(declared);
    expect([...COVERED_FIELDS, ...Object.keys(DERIVED_FIELDS)].filter((f) => !d.has(f))).toEqual([]);
    for (const [f, why] of Object.entries(DERIVED_FIELDS)) expect(why.length, f).toBeGreaterThan(20);
    expect(COVERED_FIELDS.filter((f) => f in DERIVED_FIELDS)).toEqual([]);
  });
});

describe('reading errors', () => {
  it('points at the line, and applies nothing', () => {
    const text = [
      'stabileo-model 1',
      'node 1 0 0 0',
      'node 2 0 0 three',
      'member 1 frame 1 9',
      'node 1 5 5 5',
      'bogus 4',
      'combination 1 "c" 1x1.2',
    ].join('\n');
    const r = codeToModel(text);
    expect(r.snapshot).toBeNull();
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(r.errors.find((e) => e.line === 4)!.message).toContain('node 9 is not defined');
    expect(r.errors.find((e) => e.line === 5)!.message).toContain('first on line 2');
  });

  it('refuses a text without its header', () => {
    expect(codeToModel('node 1 0 0 0').errors[0]!.message).toContain('stabileo-model');
  });
});

describe('applying code', () => {
  it('edits the open model in one undo step, and keeps what the design produced', async () => {
    await modelStore.loadExample('rc-design-qa-8');
    const e1 = [...modelStore.elements.keys()][0]!;
    modelStore.updateElement(e1, { reinforcement: { marker: 'kept' } } as never);
    historyStore.clear();
    const code = modelToCode(modelStore.snapshot()).replace(/^node 1 (\S+) (\S+)/m, 'node 1 $1 7.5');
    const r = applyCode(code);
    expect(r).toEqual({ applied: true, keptReinforcement: 1 });
    expect(modelStore.nodes.get(1)!.y).toBe(7.5);
    expect((modelStore.elements.get(e1) as any).reinforcement).toEqual({ marker: 'kept' });
    expect(historyStore.undoCount).toBe(1);
    historyStore.undo();
    expect(modelStore.nodes.get(1)!.y).not.toBe(7.5);
  });

  it('never moves an id counter backwards', async () => {
    await modelStore.loadExample('rc-design-qa-8');
    const before = { ...(modelStore.snapshot().nextId as Record<string, number>) };
    const code = modelToCode(modelStore.snapshot()).split('\n').filter((l) => !l.startsWith('load ')).join('\n');
    applyCode(code);
    const after = modelStore.snapshot().nextId as Record<string, number>;
    for (const k of Object.keys(before)) expect(after[k]!, k).toBeGreaterThanOrEqual(before[k]!);
  });
});
