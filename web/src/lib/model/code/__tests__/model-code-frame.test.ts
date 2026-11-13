import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { COVERED_FIELDS, DERIVED_SUBFIELDS } from '../coverage';
import { modelToCode, codeToModel } from '../format';
import { allChoices, type AxesChoice } from '../../../axes/frame';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

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
  const o = JSON.parse(JSON.stringify(out));
  for (const [, n] of (o.nodes ?? []) as Array<[number, Record<string, unknown>]>) if (n.z === 0) delete n.z;
  for (const f of Object.keys(o)) if (Array.isArray(o[f]) && o[f].length === 0) delete o[f];
  return o;
}

function roundTrip(choice: AxesChoice) {
  const snap = modelStore.snapshot() as unknown as Record<string, any>;
  const code = modelToCode(snap as never, choice);
  const r = codeToModel(code);
  expect(r.errors, r.errors.map((e) => `${e.line}: ${e.message}`).join('\n')).toEqual([]);
  const back = covered(r.snapshot as Record<string, any>), orig = covered(snap);
  for (const k of Object.keys(orig)) expect(back[k], `${k} (${JSON.stringify(choice)})`).toEqual(orig[k]);
  expect(Object.keys(back).sort()).toEqual(Object.keys(orig).sort());
  return code;
}

function smallSpaceModel() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 1, 3);
  modelStore.addElement(a, b, 'frame');
  modelStore.addElement(b, c, 'frame');
  modelStore.addSupport(a, 'fixed3d' as never);
  modelStore.addNodalLoad3D(c, 1, -2, -10, 0.5, 0, 3, 1);
}

describe('model code in the user axes', () => {
  it('declares its axes on the second line and writes the coordinates in them', () => {
    smallSpaceModel();
    const code = modelToCode(modelStore.snapshot(), { up: '+Y', right: '+X', hand: 'right' });
    const lines = code.split('\n');
    expect(lines[1]).toBe('frame up="+Y" right="+X" hand="right"');
    expect(code).toContain('node 2 0 3 0');
    expect(code).toContain('node 3 4 3 -1');
  });

  it('reads back the same model in every one of the 48 frames (a zero elevation may come back unwritten)', () => {
    smallSpaceModel();
    for (const c of allChoices()) roundTrip(c);
  });

  for (const example of ['pro-edificio-7p', 'portal-frame', '3d-nave-industrial']) {
    it(`reads back ${example} written with Y up and a left-handed frame`, async () => {
      await modelStore.loadExample(example);
      roundTrip({ up: '+Y', right: '-Z', hand: 'left' });
    });
  }

  it('reads code with no frame line in the model axes, as before', () => {
    smallSpaceModel();
    const plain = modelToCode(modelStore.snapshot());
    expect(plain.split('\n').some((l) => l.startsWith('frame '))).toBe(false);
    expect(covered(codeToModel(plain).snapshot as Record<string, any>)).toEqual(covered(modelStore.snapshot() as never));
  });

  it('refuses a frame with the same axis up and to the right', () => {
    const r = codeToModel('stabileo-model 1\nframe up="+Z" right="-Z" hand="right"\n');
    expect(r.snapshot).toBeNull();
    expect(r.errors[0].line).toBe(2);
  });
});
