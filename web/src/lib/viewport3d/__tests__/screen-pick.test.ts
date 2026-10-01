/** The nearest node or member on the screen, for a click whose ray hit nothing. */
import { describe, it, expect } from 'vitest';
import { memberNearPointer, nodeNearPointer } from '../screen-pick';

const flat = (x: number, y: number) => ({ x: x * 10, y: y * 10 });
const nodes = new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 10, y: 0 }], [3, { id: 3, x: 10, y: 10 }]]);
const members = [{ id: 7, nodeI: 1, nodeJ: 2 }, { id: 8, nodeI: 2, nodeJ: 3 }];

describe('screen pick', () => {
  it('takes the member a click lands beside, and the nearer of two', () => {
    expect(memberNearPointer(50, 4, members, (id) => nodes.get(id), flat, 6)).toBe(7);
    expect(memberNearPointer(96, 8, members, (id) => nodes.get(id), flat, 6)).toBe(8);
  });
  it('leaves a click far from everything empty', () => {
    expect(memberNearPointer(50, 30, members, (id) => nodes.get(id), flat, 6)).toBeNull();
  });
  it('skips what is not on the screen', () => {
    expect(memberNearPointer(50, 2, members, (id) => nodes.get(id), () => null, 6)).toBeNull();
  });
  it('takes the nearest node within the tolerance', () => {
    expect(nodeNearPointer(97, 3, nodes.values(), flat, 8)).toBe(2);
    expect(nodeNearPointer(50, 50, nodes.values(), flat, 8)).toBeNull();
  });
});
