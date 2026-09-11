/**
 * The joint share codec — I-08, the joints half.
 *
 * These test the code that runs. `url-sharing.test.ts` inlines its own copy of the encoder
 * because the module it covers imports four stores; this codec was split into a pure module for
 * exactly that reason, so nothing here is a mirror of the implementation.
 *
 * The round-trips through the REAL `compressSnapshot`/`decompressSnapshot` live in
 * `utils/__tests__/joint-share-url.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  packJointDesigns, unpackJointDesigns, JOINT_SHARE_FIELDS,
} from '../joint-share';
import {
  reconcileJointDesigns, JOINT_DESIGNS_SCHEMA_VERSION,
  type JointChoices, type StoredJointDesigns,
} from '../joint-choices';
import { BOLT_GRADES, type BoltLayoutChoice } from '../bolted-joint';
import type { WeldInput } from '../fillet-weld';

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * Every field of `BoltLayoutChoice`, populated.
 *
 * Typed `Required<…>` on purpose: it is the first half of the drift guard. Add a field to the
 * interface and this object stops compiling, which is a typecheck failure rather than a field
 * that quietly stops travelling. The second half is the completeness test at the bottom, which
 * compares these keys against the codec's field table.
 */
const BOLTS: Required<BoltLayoutChoice> = {
  diameterMm: 20, grade: 'A325', threads: 'excluded', count: 6, rows: 2,
  spacingMm: 60, edgeDistanceMm: 35, edgeFinish: 'rolled', exposure: 'painted',
  shearPlanes: 2, deformationConsidered: true,
};

const WELD: Required<WeldInput> = {
  legMm: 6, lengthMm: 200, runs: 2, fexxMPa: 480, thickerPartMm: 12,
  thinnerPartMm: 8, process: 'manual', loading: 'other', demandKN: 150,
};

const PLATE: Required<NonNullable<JointChoices['plate']>> = { thicknessMm: 12, fuMPa: 400 };

const BATTENS: Required<NonNullable<JointChoices['battens']>> = {
  arrangement: 'doubleBack', gapMm: 10, lengthM: 0.3, segments: 3,
  chordRiMm: 22.5, memberId: 7,
};

function designs(...joints: Array<{
  nodeId: number; atMm?: { x: number; y: number; z: number };
  memberCount: number; choices: JointChoices;
}>): StoredJointDesigns {
  return { version: JOINT_DESIGNS_SCHEMA_VERSION, joints };
}

const AT = (x: number, y: number, z: number) => ({ x, y, z });

/** Pack then unpack through JSON, which is what the URL actually does to the payload. */
function roundTrip(s: StoredJointDesigns | undefined): StoredJointDesigns | undefined {
  const packed = packJointDesigns(s);
  if (packed === undefined) return unpackJointDesigns(undefined);
  return unpackJointDesigns(JSON.parse(JSON.stringify(packed)));
}

// ── 1 · A model with no joints ────────────────────────────────────────────

describe('a model with no joint designs', () => {
  it('produces no payload at all, in every shape of "none"', () => {
    expect(packJointDesigns(undefined)).toBeUndefined();
    expect(packJointDesigns(designs())).toBeUndefined();
  });

  it('reads an absent payload as "no decisions", not as an empty joint designed', () => {
    expect(unpackJointDesigns(undefined)).toBeUndefined();
    expect(unpackJointDesigns(null)).toBeUndefined();
  });
});

// ── 2, 3, 4 · One joint of each kind ──────────────────────────────────────

describe('one joint of each kind survives the trip', () => {
  it('a bolted joint keeps every bolt field and its plate', () => {
    const out = roundTrip(designs({ nodeId: 5, atMm: AT(3000, 4000, 0), memberCount: 3,
      choices: { bolts: BOLTS, plate: PLATE } }));
    expect(out!.joints).toHaveLength(1);
    expect(out!.joints[0].choices.bolts).toEqual(BOLTS);
    expect(out!.joints[0].choices.plate).toEqual(PLATE);
  });

  it('a welded joint keeps every weld field', () => {
    const out = roundTrip(designs({ nodeId: 9, atMm: AT(0, 0, 0), memberCount: 2,
      choices: { weld: WELD } }));
    expect(out!.joints[0].choices.weld).toEqual(WELD);
  });

  it('a battened joint keeps the arrangement, the gap and the member it was detailed for', () => {
    const out = roundTrip(designs({ nodeId: 2, atMm: AT(1000, 0, 500), memberCount: 4,
      choices: { battens: BATTENS } }));
    expect(out!.joints[0].choices.battens).toEqual(BATTENS);
  });
});

// ── 5 · Several nodes ─────────────────────────────────────────────────────

describe('several nodes', () => {
  it('keeps each node with its own choices and its own fingerprint', () => {
    const out = roundTrip(designs(
      { nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2, choices: { bolts: BOLTS } },
      { nodeId: 7, atMm: AT(6000, 4500, 0), memberCount: 3, choices: { weld: WELD } },
      { nodeId: 12, atMm: AT(12000, 4500, 0), memberCount: 4, choices: { battens: BATTENS } },
    ));
    expect(out!.joints.map((j) => j.nodeId)).toEqual([1, 7, 12]);
    expect(out!.joints[0].choices.bolts?.diameterMm).toBe(20);
    expect(out!.joints[1].choices.weld?.legMm).toBe(6);
    expect(out!.joints[2].choices.battens?.arrangement).toBe('doubleBack');
    expect(out!.joints[1].atMm).toEqual(AT(6000, 4500, 0));
  });

  it('does not let one node\'s choices leak into another\'s', () => {
    const out = roundTrip(designs(
      { nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2, choices: { bolts: BOLTS } },
      { nodeId: 2, atMm: AT(0, 1000, 0), memberCount: 2, choices: { weld: WELD } },
    ));
    expect(out!.joints[0].choices.weld).toBeUndefined();
    expect(out!.joints[1].choices.bolts).toBeUndefined();
  });
});

// ── 7 · Absent optional fields stay absent ────────────────────────────────

describe('absent optional fields', () => {
  it('stay absent rather than arriving as zero', () => {
    const out = roundTrip(designs({ nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2,
      choices: { bolts: { diameterMm: 16, grade: 'A307', threads: 'included', count: 4,
        rows: 1, spacingMm: 50, edgeDistanceMm: 30 } } }));
    const bolts = out!.joints[0].choices.bolts!;
    expect(bolts.diameterMm).toBe(16);
    expect('shearPlanes' in bolts).toBe(false);
    expect('exposure' in bolts).toBe(false);
    expect('deformationConsidered' in bolts).toBe(false);
  });

  it('tells an explicit null apart from a key that was never set', () => {
    const out = roundTrip(designs(
      { nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2, choices: { bolts: BOLTS, weld: null } },
      { nodeId: 2, atMm: AT(0, 1000, 0), memberCount: 2, choices: { bolts: BOLTS } },
    ));
    expect(out!.joints[0].choices.weld).toBeNull();
    expect('weld' in out!.joints[1].choices).toBe(false);
  });

  it('keeps a group the user opened and left blank', () => {
    const out = roundTrip(designs({ nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2,
      choices: { plate: {} } }));
    expect(out!.joints[0].choices.plate).toEqual({});
  });
});

// ── 8 · Corrupt data ──────────────────────────────────────────────────────

describe('corrupt data is refused, never half believed', () => {
  const cases: Array<[string, unknown]> = [
    ['a container that is not an object', 'joints'],
    ['a container that is an array', [[1, 2, 0, {}]]],
    ['a version this build does not read', { v: 2, j: [[1, 2, 0, {}]] }],
    ['a container with no version at all', { j: [[1, 2, 0, {}]] }],
    ['a joint list that is not an array', { v: 1, j: { 1: {} } }],
    ['an entry that is not a tuple', { v: 1, j: [{ nodeId: 1 }] }],
    ['an entry missing a slot', { v: 1, j: [[1, 2, 0]] }],
    ['a node id that is not a number', { v: 1, j: [['5', 2, 0, {}]] }],
    ['a node id that is NaN', { v: 1, j: [[null, 2, 0, {}]] }],
    ['a member count that is not a number', { v: 1, j: [[1, null, 0, {}]] }],
    ['a fingerprint of the wrong length', { v: 1, j: [[1, 2, [0, 0], {}]] }],
    ['a fingerprint with a null axis', { v: 1, j: [[1, 2, [0, null, 0], {}]] }],
    ['a fingerprint that is neither a position nor absent', { v: 1, j: [[1, 2, 'here', {}]] }],
    ['choices that are not an object', { v: 1, j: [[1, 2, 0, 'bolts']] }],
    ['a bolt diameter that is a string', { v: 1, j: [[1, 2, 0, { b: { d: 'big' } }]] }],
    ['a bolt grade the table does not have', { v: 1, j: [[1, 2, 0, { b: { g: 'A999' } }]] }],
    ['a batten arrangement that is not one of the seven', { v: 1, j: [[1, 2, 0, { ba: { a: 'triple' } }]] }],
    ['a weld process that is not one of the two', { v: 1, j: [[1, 2, 0, { w: { p: 'laser' } }]] }],
    ['a shear plane count of three', { v: 1, j: [[1, 2, 0, { b: { sp: 3 } }]] }],
    ['a plate explicitly null, which the type does not allow', { v: 1, j: [[1, 2, 0, { p: null }]] }],
  ];

  for (const [what, payload] of cases) {
    it(`throws on ${what}`, () => {
      expect(() => unpackJointDesigns(payload)).toThrow();
    });
  }

  it('ignores a key from a later version instead of refusing the link', () => {
    const out = unpackJointDesigns({ v: 1, j: [[1, 2, [0, 0, 0], { b: { d: 20, zz: 'later' }, qq: 1 }]] });
    expect(out!.joints[0].choices.bolts).toEqual({ diameterMm: 20 });
    expect('zz' in (out!.joints[0].choices.bolts as object)).toBe(false);
  });
});

// ── 9 · Exact reconstruction ──────────────────────────────────────────────

describe('exact reconstruction', () => {
  it('rebuilds every choice of every joint, field for field', () => {
    const before = designs(
      { nodeId: 3, atMm: AT(0, 4500, 0), memberCount: 3,
        choices: { bolts: BOLTS, plate: PLATE, weld: WELD, battens: BATTENS } },
      { nodeId: 8, atMm: AT(6000, 6000, 0), memberCount: 2,
        choices: { bolts: null, plate: { thicknessMm: 8 }, weld: WELD } },
    );
    expect(roundTrip(before)).toEqual(before);
  });

  it('keeps a joint whose fingerprint could not be vouched for unvouched', () => {
    const before = designs({ nodeId: 4, memberCount: -1, choices: { bolts: BOLTS } });
    const out = roundTrip(before);
    expect(out!.joints[0].atMm).toBeUndefined();
    expect(out!.joints[0].memberCount).toBe(-1);
  });
});

// ── 10 · Nothing computed travels ─────────────────────────────────────────

describe('capacities are recomputed, so they do not travel', () => {
  it('emits no computed field even when one is on the model', () => {
    const tampered = {
      version: 1,
      joints: [{
        nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2,
        choices: {
          bolts: { ...BOLTS, capacityKN: 412, utilisation: 0.61 },
          plate: { ...PLATE, holesM: [[0.1, 0.2]] },
          checks: [{ id: 'shear', state: 'adequate' }],
        },
      }],
    } as unknown as StoredJointDesigns;
    const wire = JSON.stringify(packJointDesigns(tampered));
    for (const computed of ['capacityKN', 'utilisation', 'holesM', 'checks', '412', '0.61']) {
      expect(wire).not.toContain(computed);
    }
    const out = roundTrip(tampered)!;
    expect(out.joints[0].choices.bolts).toEqual(BOLTS);
    expect(out.joints[0].choices.plate).toEqual(PLATE);
    expect('checks' in out.joints[0].choices).toBe(false);
  });
});

// ── 11 · A joint does not follow a link into another model ────────────────

describe('a shared joint stays with the model it was designed for', () => {
  const shared = roundTrip(designs(
    { nodeId: 5, atMm: AT(6000, 4500, 0), memberCount: 3, choices: { bolts: BOLTS } },
  ))!;

  const nodesAt = (x: number, y: number) => new Map([[5, { x: x / 1000, y: y / 1000, z: 0 }]]);
  const twoMembers = [{ nodeI: 5, nodeJ: 6 }, { nodeI: 4, nodeJ: 5 }];

  it('applies when the node is where it was, with the same fan of members', () => {
    const r = reconcileJointDesigns(shared, nodesAt(6000, 4500),
      [...twoMembers, { nodeI: 5, nodeJ: 7 }]);
    expect(r.live.get(5)?.bolts).toEqual(BOLTS);
    expect(r.obsolete.size).toBe(0);
  });

  it('is obsolete, not applied, when the link is opened over another model', () => {
    const r = reconcileJointDesigns(shared, nodesAt(0, 0), twoMembers);
    expect(r.live.size).toBe(0);
    expect(r.obsolete.get(5)).toBe('nodeMoved');
  });

  it('is obsolete when the node is gone', () => {
    const r = reconcileJointDesigns(shared, new Map(), []);
    expect(r.obsolete.get(5)).toBe('nodeMissing');
  });

  it('is obsolete when the same node has a different fan of members', () => {
    const r = reconcileJointDesigns(shared, nodesAt(6000, 4500), twoMembers);
    expect(r.obsolete.get(5)).toBe('topologyChanged');
  });

  it('a payload with no fingerprint can never match, so it is never applied', () => {
    const noPrint = roundTrip(designs(
      { nodeId: 5, memberCount: 3, choices: { bolts: BOLTS } },
    ))!;
    const r = reconcileJointDesigns(noPrint, nodesAt(6000, 4500),
      [...twoMembers, { nodeI: 5, nodeJ: 7 }]);
    expect(r.live.size).toBe(0);
    expect(r.obsolete.get(5)).toBe('nodeMoved');
  });
});

// ── The drift guard ───────────────────────────────────────────────────────

describe('the field table covers the choices, and is what makes that checkable', () => {
  /**
   * The half a type cannot do.
   *
   * `Required<BoltLayoutChoice>` above forces the FIXTURE to list every field; this compares the
   * fixture against the codec's table. Together they mean a field added to `JointChoices` fails
   * either the typecheck or this test, instead of silently not travelling — which is how the
   * section tuple came to be short by four.
   */
  const table = (group: string) => (JOINT_SHARE_FIELDS.get(group) ?? []).map((f) => f.key).sort();

  it('covers every field of a bolt layout', () => {
    expect(table('bolts')).toEqual(Object.keys(BOLTS).sort());
  });

  it('covers every field of a plate', () => {
    expect(table('plate')).toEqual(Object.keys(PLATE).sort());
  });

  it('covers every field of a weld', () => {
    expect(table('weld')).toEqual(Object.keys(WELD).sort());
  });

  it('covers every field of a batten layout', () => {
    expect(table('battens')).toEqual(Object.keys(BATTENS).sort());
  });

  it('gives every field inside a group its own short key', () => {
    for (const [group, fields] of JOINT_SHARE_FIELDS) {
      const shorts = fields.map((f) => f.short);
      expect(new Set(shorts).size, `${group} reuses a short key`).toBe(shorts.length);
    }
  });

  it('accepts every bolt grade the strength table publishes', () => {
    for (const grade of BOLT_GRADES) {
      const out = roundTrip(designs({ nodeId: 1, atMm: AT(0, 0, 0), memberCount: 2,
        choices: { bolts: { ...BOLTS, grade } } }));
      expect(out!.joints[0].choices.bolts?.grade).toBe(grade);
    }
  });
});
