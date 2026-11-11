import { describe, expect, it } from 'vitest';
import {
  allChoices, DEFAULT_AXES, gravityLabel, makeFrame, plane2D, pseudoToModel, pseudoToUser,
  toModel, toUser, upLabel, userAxisAlong, validChoice, type Vec3,
} from '../frame';

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

describe('global axes frame', () => {
  it('offers the 48 signed permutations, each once', () => {
    const all = allChoices();
    expect(all).toHaveLength(48);
    const keys = new Set(all.map((c) => makeFrame(c).rows.flat().join(',')));
    expect(keys.size).toBe(48);
  });

  it('keeps the model frame by default', () => {
    const f = makeFrame(DEFAULT_AXES);
    expect(f.identity).toBe(true);
    expect(toUser(f, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(upLabel(f)).toBe('+Z');
    expect(gravityLabel(f)).toBe('−Z');
  });

  it('names Y up with X to the right as a right-handed frame whose Z points at the viewer', () => {
    const f = makeFrame({ up: '+Y', right: '+X', hand: 'right', localHand: 'right' });
    expect(toUser(f, [0, 0, 3])).toEqual([0, 3, 0]);
    expect(toUser(f, [0, 1, 0])).toEqual([0, 0, -1]);
    expect(gravityLabel(f)).toBe('−Y');
    expect(f.det).toBe(1);
  });

  it('round-trips every choice for vectors and pseudovectors', () => {
    const v: Vec3 = [1.5, -2.25, 4];
    for (const c of allChoices()) {
      const f = makeFrame(c);
      expect(toModel(f, toUser(f, v))).toEqual(v);
      expect(pseudoToModel(f, pseudoToUser(f, v))).toEqual(v);
      expect(f.det).toBe(c.hand === 'right' ? 1 : -1);
    }
  });

  it('keeps M = r × F in the user components, so a left-handed frame turns by its own hand', () => {
    const r: Vec3 = [2, -1, 3];
    const F: Vec3 = [0.5, 4, -2];
    const M = cross(r, F);
    for (const c of allChoices()) {
      const f = makeFrame(c);
      const mUser = pseudoToUser(f, M);
      const rxF = cross(toUser(f, r), toUser(f, F));
      expect(mUser.map((x) => x + 0)).toEqual(rxF.map((x) => x + 0));
    }
  });

  it('puts the chosen axis up and the chosen one to the right', () => {
    for (const c of allChoices()) {
      const f = makeFrame(c);
      expect(upLabel(f).replace('−', '-')).toBe(c.up);
      const right = userAxisAlong(f, 0);
      expect(`${right.sign < 0 ? '-' : '+'}${right.name}`).toBe(c.right);
    }
  });

  it('names the 2D plane from the same frame', () => {
    const p = plane2D(makeFrame(DEFAULT_AXES));
    expect([p.horizontal.name, p.vertical.name, p.normal.name]).toEqual(['X', 'Z', 'Y']);
  });

  it('rejects a choice with the same axis up and to the right', () => {
    expect(validChoice({ up: '+Z', right: '-Z', hand: 'right', localHand: 'right' })).toBe(false);
    expect(validChoice({ up: '+Z', right: '+Y', hand: 'left', localHand: 'right' })).toBe(true);
  });
});
