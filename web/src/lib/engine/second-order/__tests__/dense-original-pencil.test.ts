import { expect, it } from 'vitest';
import { generalizedEigen } from '../dense';

it('known wrong result: #818: teaching eigenvalues use original work', () => {
  for (const s of [1e7, 1e8]) {
    const result = generalizedEigen([[s+1,s],[s,s+1]], [[1,0],[0,1]])!;
    expect(Math.abs(result[0].lambda-1)).toBeLessThan(1e-12);
    const indefinite = generalizedEigen([[1,0],[0,1]], [[(1-s)/2,(1+s)/2],[(1+s)/2,(1-s)/2]])!;
    expect(Math.abs(indefinite[0].lambda-1)).toBeLessThan(1e-12);
  }
  expect(generalizedEigen([[2,0],[0,3]], [[1,0],[0,1]])!.map(m => m.lambda)).toEqual([2,3]);
  expect(generalizedEigen([[0]], [[1]])).toBeNull();
  expect(generalizedEigen([[1]], [[-1]])).toEqual([]);
});
