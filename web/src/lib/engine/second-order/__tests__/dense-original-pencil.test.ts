import { expect, it } from 'vitest';
import { generalizedEigen, zeros, cholesky } from '../dense';

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

it('known wrong result: #818: non-buckling Ritz vectors do not discard compressed modes', () => {
  const R = [[5,9,-1],[-1,-4,-2],[9,4,9],[-5,1,-9],[7,1,2],[2,-2,-9],[3,-4,-6],[-5,-7,-8]];
  for (const s of [1e7,1e10]) for (const work of [0,-1]) {
    const K = zeros(10,10), G = zeros(10,10);
    K[0][0] = 10; K[1][1] = 20; G[0][0] = G[1][1] = 1;
    for (let i=0; i<8; i++) for (let j=0; j<8; j++) K[i+2][j+2] = s*R[i].reduce((a,v,k) => a+v*R[j][k],0)+(i===j?1:0);
    for (let i=0; i<8; i++) for (let j=0; j<8; j++) G[i+2][j+2] = work*R[i].reduce((a,v,k) => a+v*R[j][k],0);
    expect(cholesky(K)).not.toBeNull();
    const modes = generalizedEigen(K,G);
    expect(modes).not.toBeNull();
    expect(modes!.map(m => m.lambda)).toEqual([10,20]);
  }
});

it('known wrong result: #818: rigid axial projection retains original matrix work', () => {
  for (const delta of [-(2**-27),2**-27]) {
    const s = 1e13;
    const K = [[s+0.002,-s,-0.001],[-s,s+0.001,0],[-0.001,0,0.003]];
    const G = [[1,0,0],[0,0,0],[0,0,1]];
    const T = [[1,0],[1+delta,0],[0,1]];
    const a = (K[0][0]-s)+(K[1][1]-s)*(1+2*delta)+K[1][1]*delta*delta;
    const root = Math.sqrt((a-0.003)**2+4*0.001**2);
    const expected = [(a+0.003-root)/2,(a+0.003+root)/2];
    const modes = Reflect.apply(generalizedEigen,null,[K,G,T]);
    expect(modes).not.toBeNull();
    expect(modes).toHaveLength(2);
    if (!modes) throw new Error("missing rigid modes");
    for (let i=0; i<2; i++) expect(Math.abs(modes[i].lambda/expected[i]-1)).toBeLessThan(1e-12);
  }
});
