/**
 * I-08, the joints half — through the REAL `compressSnapshot` / `decompressSnapshot`.
 *
 * The codec's own behaviour is covered in `connection/__tests__/joint-share.test.ts`. What is
 * covered here is the part only the whole path can answer: that the new key is in the payload,
 * that a link written before it exists still opens, that a link written with it can still be read
 * by a build that knows nothing about it, and what it costs in characters.
 *
 * Same shape as `provenance-url.test.ts`, and for the same reason: URL share is the one
 * persistence path that crosses a trust boundary.
 */
import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import { compressSnapshot, decompressSnapshot, MAX_URL_SAFE } from '../url-sharing';
import type { ModelSnapshot } from '../../store/history.svelte';
import type { JointChoices, StoredJointDesigns } from '../../connection/joint-choices';

const BOLTS: NonNullable<JointChoices['bolts']> = {
  diameterMm: 20, grade: 'A325', threads: 'excluded', count: 6, rows: 2,
  spacingMm: 60, edgeDistanceMm: 35, edgeFinish: 'rolled', exposure: 'painted',
  shearPlanes: 2, deformationConsidered: true,
};

const WELD: NonNullable<JointChoices['weld']> = {
  legMm: 6, lengthMm: 200, runs: 2, fexxMPa: 480, thickerPartMm: 12,
  thinnerPartMm: 8, process: 'manual', loading: 'other', demandKN: 150,
};

/** A shed frame: two columns, a rafter pair, and the eaves nodes joints get designed at. */
function shed(jointDesigns?: StoredJointDesigns): ModelSnapshot {
  return {
    analysisMode: 'pro',
    name: 'nave',
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 0, y: 6, z: 0 }],
      [3, { id: 3, x: 10, y: 7.5, z: 0 }],
      [4, { id: 4, x: 20, y: 6, z: 0 }],
      [5, { id: 5, x: 20, y: 0, z: 0 }],
    ],
    materials: [[1, { id: 1, name: 'F-24', e: 200000000, nu: 0.3, rho: 7850, fy: 235000 }]],
    sections: [[1, { id: 1, name: 'IPE 300', a: 0.00538, iz: 0.0000836, shape: 'I' }]],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1 }],
      [4, { id: 4, type: 'frame', nodeI: 4, nodeJ: 5, materialId: 1, sectionId: 1 }],
    ],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 5, type: 'fixed' }],
    ],
    loads: [],
    loadCases: [],
    combinations: [],
    ...(jointDesigns ? { jointDesigns } : {}),
    nextId: { node: 6, material: 2, section: 2, element: 5, support: 3, load: 1, loadCase: 1, combination: 1 },
  } as unknown as ModelSnapshot;
}

const eaves: StoredJointDesigns = {
  version: 1,
  joints: [
    { nodeId: 2, atMm: { x: 0, y: 6000, z: 0 }, memberCount: 2, choices: { bolts: BOLTS, plate: { thicknessMm: 12, fuMPa: 400 } } },
    { nodeId: 4, atMm: { x: 20000, y: 6000, z: 0 }, memberCount: 2, choices: { weld: WELD } },
  ],
};

/** The compact object a link actually carries, inflated back out of the payload. */
function compactOf(link: string): Record<string, unknown> {
  const b64 = link.slice(2).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(inflateSync(bytes)));
}

// ── A model with no joints ────────────────────────────────────────────────

describe('a shared model with no joints', () => {
  it('carries no joint key and comes back with the field absent', () => {
    const link = compressSnapshot(shed());
    expect('jd' in compactOf(link)).toBe(false);
    expect(decompressSnapshot(link)!.jointDesigns).toBeUndefined();
  });
});

// ── The designed nave ─────────────────────────────────────────────────────

describe('a shared model with designed joints', () => {
  it('brings both joints back with their choices', () => {
    const out = decompressSnapshot(compressSnapshot(shed(eaves)))!;
    expect(out.jointDesigns?.joints).toHaveLength(2);
    expect(out.jointDesigns!.joints[0].choices.bolts).toEqual(BOLTS);
    expect(out.jointDesigns!.joints[1].choices.weld).toEqual(WELD);
  });

  it('brings the fingerprints back, which is what keeps them with this model', () => {
    const out = decompressSnapshot(compressSnapshot(shed(eaves)))!;
    expect(out.jointDesigns!.joints[0].atMm).toEqual({ x: 0, y: 6000, z: 0 });
    expect(out.jointDesigns!.joints[0].memberCount).toBe(2);
  });

  it('carries no verification of any kind', () => {
    const wire = JSON.stringify(compactOf(compressSnapshot(shed(eaves))));
    for (const computed of ['capacityKN', 'utilisation', 'checks', 'holesM']) {
      expect(wire).not.toContain(computed);
    }
  });
});

// ── An old link ───────────────────────────────────────────────────────────

describe('a link written before joints travelled', () => {
  /** Hand-built at sv:4, the version that shipped without a `jd` key. */
  function v4Link(): string {
    const compact = {
      m: 'pro', nm: 'nave', sv: 4,
      n: [[1, 0, 0], [2, 0, 6]],
      mt: [[1, 'F-24', 200000000, 0.3, 7850]],
      sc: [[1, 'IPE 300', 0.00538, 0.0000836, { s: 'I' }]],
      e: [[1, 0, 1, 2, 1, 1]],
      s: [[1, 1, 'fixed']],
      l: [],
      ni: [3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(compact));
    const deflated = deflateSync(bytes, { level: 9 });
    let bin = '';
    for (let i = 0; i < deflated.length; i++) bin += String.fromCharCode(deflated[i]);
    return '2.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  it('still opens', () => {
    const out = decompressSnapshot(v4Link());
    expect(out).not.toBeNull();
    expect(out!.nodes).toHaveLength(2);
    expect(out!.name).toBe('nave');
  });

  it('opens with no joint decisions rather than with empty joints designed', () => {
    expect(decompressSnapshot(v4Link())!.jointDesigns).toBeUndefined();
  });
});

// ── M1 ↔ M2 ───────────────────────────────────────────────────────────────

describe('compatibility between a build with joints and one without', () => {
  /**
   * M1 has no `jointDesigns` field at all, so the two directions are:
   *
   * · a link from M1 has no `jd`, which the case above covers;
   * · a link from M2 has a `jd`, and M1's decoder reads the keys it knows and ignores the rest.
   *
   * The second cannot be run here — M1's decoder is not in this build — so what is asserted is
   * the property that makes it true: `jd` is a new TOP-LEVEL key, and nothing else about the
   * payload changed. No tuple grew a position, which is the one change that would not be
   * ignorable.
   */
  it('adds exactly one top-level key and changes nothing else', () => {
    const without = compactOf(compressSnapshot(shed()));
    const with_ = compactOf(compressSnapshot(shed(eaves)));
    const added = Object.keys(with_).filter((k) => !(k in without));
    expect(added).toEqual(['jd']);
    for (const key of Object.keys(without)) {
      expect(with_[key], `top-level key ${key} changed`).toEqual(without[key]);
    }
  });

  it('keeps the schema tag at a value the old migrations still read as current', () => {
    // sv ≥ 3 is the iy/iz convention and sv ≥ 4 the typed releases. A reader that only knows
    // those two thresholds must still take both branches on a link written now.
    const sv = compactOf(compressSnapshot(shed(eaves))).sv as number;
    expect(sv).toBeGreaterThanOrEqual(4);
  });

  it('rebuilds everything but the joints identically, joints or no joints', () => {
    const a = decompressSnapshot(compressSnapshot(shed()))!;
    const b = decompressSnapshot(compressSnapshot(shed(eaves)))!;
    const { jointDesigns: _a, ...restA } = a;
    const { jointDesigns: _b, ...restB } = b;
    expect(restB).toEqual(restA);
  });
});

// ── What it costs ─────────────────────────────────────────────────────────

describe('the length budget', () => {
  /**
   * `MAX_URL_SAFE` is a limit `ToolbarProject` actually checks, so the joints were measured
   * rather than assumed. Twenty designed joints — bolts, plate and weld on every one — is the
   * case that matters.
   *
   * **Measured: 391 characters for the twenty, 19,6 per joint.** The first one costs 203 and
   * each one after it about 10, because the key names are identical across joints and that is
   * precisely what deflate collapses. Short keys were chosen for URL length and this is the
   * number that says how much they bought.
   *
   * The budget is 30, which is the measured cost with half again on top. It is not a round
   * number for its own sake: it fails if a future field makes a joint cost several times what it
   * costs now, which is the only way the joints become the thing that pushes a real model over
   * the limit.
   */
  it('costs a bounded number of characters for a fully designed shed', () => {
    const twenty: StoredJointDesigns = {
      version: 1,
      joints: Array.from({ length: 20 }, (_, i) => ({
        nodeId: i + 1,
        atMm: { x: i * 1000, y: 6000, z: 0 },
        memberCount: 3,
        choices: { bolts: BOLTS, weld: WELD, plate: { thicknessMm: 12, fuMPa: 400 } },
      })),
    };
    const bare = compressSnapshot(shed()).length;
    const designed = compressSnapshot(shed(twenty)).length;
    const perJoint = (designed - bare) / 20;
    expect(perJoint).toBeLessThan(30);
    expect(designed).toBeLessThan(MAX_URL_SAFE);
  });
});
