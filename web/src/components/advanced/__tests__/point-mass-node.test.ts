import { expect, it } from 'vitest';
import { pointMassNode } from '../dynamics/point-mass-node';

const points = [{ nodeId: 2, m: 1 }, { nodeId: 3, m: 4 }];
const exists = (id: number) => id >= 1 && id <= 4;

it('a node that exists and carries no other mass moves the mass there', () => {
  const field = { value: '4' };
  expect(pointMassNode(field, points, 0, exists)).toBe(4);
  expect(field.value).toBe('4');
});

it('a node that does not exist is refused and the field shows the node the mass is still at', () => {
  const field = { value: '9' };
  expect(pointMassNode(field, points, 0, exists)).toBeNull();
  expect(field.value).toBe('2');
});

it('a node that already carries another mass is refused and the field shows the node the mass is still at', () => {
  const field = { value: '3' };
  expect(pointMassNode(field, points, 0, exists)).toBeNull();
  expect(field.value).toBe('2');
});

it('a fractional node number is refused the same way', () => {
  const field = { value: '2.5' };
  expect(pointMassNode(field, points, 1, exists)).toBeNull();
  expect(field.value).toBe('3');
});
