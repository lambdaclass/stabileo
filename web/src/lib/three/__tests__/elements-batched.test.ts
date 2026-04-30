import { describe, it, expect } from 'vitest';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { ElementsBatched } from '../elements-batched';

describe('ElementsBatched', () => {
  it('exposes a single LineSegments2 tagged with type:elementBatch', () => {
    const eb = new ElementsBatched();
    expect(eb.mesh).toBeInstanceOf(LineSegments2);
    expect(eb.mesh.userData.type).toBe('elementBatch');
  });

  it('upsert adds a segment; count and indexOf reflect the insertion order', () => {
    const eb = new ElementsBatched();
    eb.upsert(10, 0, 0, 0, 1, 1, 1);
    eb.upsert(20, 2, 2, 2, 3, 3, 3);
    expect(eb.count).toBe(2);
    expect(eb.indexOf(10)).toBe(0);
    expect(eb.indexOf(20)).toBe(1);
    expect(eb.elementIdAt(0)).toBe(10);
    expect(eb.elementIdAt(1)).toBe(20);
  });

  it('upsert on existing id updates positions in place without changing index', () => {
    const eb = new ElementsBatched();
    eb.upsert(5, 0, 0, 0, 1, 1, 1);
    const firstIdx = eb.indexOf(5);
    eb.upsert(5, 9, 9, 9, 8, 8, 8);
    expect(eb.count).toBe(1);
    expect(eb.indexOf(5)).toBe(firstIdx);
  });

  it('remove swap-pops the last segment into the removed slot', () => {
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 1, 1);
    eb.upsert(2, 2, 2, 2, 3, 3, 3);
    eb.upsert(3, 4, 4, 4, 5, 5, 5);
    eb.remove(2);
    expect(eb.count).toBe(2);
    expect(eb.has(2)).toBe(false);
    // id 3 should have been swapped into id 2's old slot
    expect(eb.indexOf(3)).toBe(1);
    expect(eb.elementIdAt(1)).toBe(3);
  });

  it('setBaseColor tracks base; setColor does not disturb base', () => {
    const eb = new ElementsBatched();
    eb.upsert(7, 0, 0, 0, 1, 1, 1);
    eb.setBaseColor(7, 0x4a9eff);
    expect(eb.getBaseColor(7)).toBe(0x4a9eff);
    eb.setColor(7, 0xffff44);
    expect(eb.getBaseColor(7)).toBe(0x4a9eff);
    eb.setBaseColor(7, 0x00ffff);
    expect(eb.getBaseColor(7)).toBe(0x00ffff);
  });

  it('elementIdAt returns null out of range', () => {
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 1, 1);
    expect(eb.elementIdAt(0)).toBe(1);
    expect(eb.elementIdAt(1)).toBeNull();
    expect(eb.elementIdAt(-1)).toBeNull();
  });

  it('auto-grows capacity when upserts exceed initial capacity', () => {
    const eb = new ElementsBatched({ initialCapacity: 2 });
    eb.upsert(1, 0, 0, 0, 1, 1, 1);
    eb.upsert(2, 0, 0, 0, 1, 1, 1);
    eb.upsert(3, 0, 0, 0, 1, 1, 1);
    expect(eb.count).toBe(3);
    expect(eb.has(3)).toBe(true);
    expect(eb.elementIdAt(2)).toBe(3);
  });

  it('clear resets all state', () => {
    const eb = new ElementsBatched();
    eb.upsert(1, 0, 0, 0, 1, 1, 1);
    eb.upsert(2, 0, 0, 0, 1, 1, 1);
    eb.clear();
    expect(eb.count).toBe(0);
    expect(eb.has(1)).toBe(false);
    expect(eb.elementIdAt(0)).toBeNull();
  });
});
