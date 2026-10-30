import { it, expect } from 'vitest';
import { BATCH_IDS, DEFAULT_BATCH as P, batchModel, continuousReactions, continuousInfluence, frequencies, jointForces, parseTruss, portalSway, simpleInfluence, validateBatch } from '../batch';
import { calculateBatch } from '../batch-solve';
import { batchTranslations } from '../batch-i18n';
import { readFileSync } from 'node:fs';
for(const id of BATCH_IDS) it(`${id}: default engine/reference agreement`,async()=>{
 const r=await calculateBatch(id,{...P});
 console.info(id, JSON.stringify({comparisons:r.comparisons,deflection:r.maxDeflection,sagging:r.sagging,hogging:r.hogging}));
 expect(r.comparisons.length).toBeGreaterThan(0);
 expect(r.difference).toBeLessThan(id==='portal-frame'?.03:id==='beam-natural-frequency'?1e-5:1e-7);
});
it('classical references have known benchmark values',()=>{
 expect(continuousReactions([6,6],[10,10])).toEqual([22.5,75,22.5]);
 expect(continuousReactions([6,6],[10,10],true)).toEqual([30,60,30]);
 expect(portalSway(P)).toBeCloseTo(.005625,12);
 expect(frequencies(P)[0]).toBeCloseTo(17.4532925199433,10);
 expect(simpleInfluence(6,3,3,'moment')).toBe(1.5);
 expect(continuousInfluence(6,3,6,'moment')).toBeCloseTo(0,12);
 expect(continuousInfluence(6,3,0,'reaction')).toBe(1);
 expect(jointForces(batchModel('truss-2d',P))![0]).toBeCloseTo(15,10);
});
it('truss parser rejects missing nodes, duplicate members, invalid values and disconnected topology',()=>{
 for(const patch of [{nodes:P.nodes+'\n1, 2, 2'},{members:'1, 99'},{members:'1, 2\n2, 1'},{nodes:P.nodes+'\n9, Infinity, 0'},{supports:'1, fixed'},{nodalLoads:'6, NaN, -10'},{members:'1, 2'}]) expect(()=>parseTruss({...P,...patch})).toThrow();
 expect(parseTruss(P).elements.size).toBe(13);
});
it('bounds reject malformed and out-of-range input before solving',()=>{
 for(const id of BATCH_IDS) for(const patch of [{e:NaN},{i:0},{area:Infinity},{mass:-1}]) expect(()=>validateBatch(id,{...P,...patch})).toThrow();
 for(const patch of [{spans:'6'},{spans:'6,6,6,6,6'},{loads:'10'},{spans:'0,6'},{loads:'10,-1'}]) expect(()=>validateBatch('continuous-beam',{...P,...patch})).toThrow();
 expect(()=>validateBatch('influence-line',{...P,position:6})).toThrow();
});
it('unequal spans and fixed ends agree with slope-deflection',async()=>{
 for(const ends of ['pinned','fixed'] as const) for(const rightEnd of ['pinned','fixed'] as const) { const r=await calculateBatch('continuous-beam',{...P,ends,rightEnd,spans:'3, 5, 4, 7',loads:'8, 0, 14, 3'});expect(r.difference).toBeLessThan(1e-7); }
});
it('influence curves agree with statics and compatibility, including shear discontinuity',async()=>{
 for(const count of [1,2]) for(const quantity of ['reaction','moment','shear'] as const) {
  const r=await calculateBatch('influence-line',{...P,count,quantity,position:2.7});
  for(const [x,value] of r.influence) expect(value).toBeCloseTo(count===1?simpleInfluence(6,2.7,x,quantity):continuousInfluence(6,2.7,x,quantity),7);
 }
});
it('three bending modes match all boundary conditions',async()=>{
 for(const boundary of ['simple','cantilever','fixed'] as const) {const r=await calculateBatch('beam-natural-frequency',{...P,boundary});expect(r.modes).toHaveLength(3);expect(r.difference).toBeLessThan(2e-5);}
});
it('covers every key and every tool SEO title and description in six locales',()=>{
 const keys=Object.keys(batchTranslations.en).sort();
 for(const locale of ['en','es','pt','de','fr','tr']) {
  expect(Object.keys(batchTranslations[locale]).sort()).toEqual(keys);
  for(const id of BATCH_IDS) for(const suffix of ['', '.subtitle']) expect(batchTranslations[locale][`tools.${id}${suffix}`].length).toBeGreaterThan(5);
 }
 const script=readFileSync(new URL('../../../../scripts/prerender.ts',import.meta.url),'utf8');for(const id of BATCH_IDS) expect(script).toContain(`/tools/${id}`);
});

it('distinguishes mechanisms from statically indeterminate stable trusses', async () => {
 await expect(calculateBatch('truss-2d', {...P, supports:'1, rollerX\n5, rollerX'})).rejects.toThrow();
 const r = await calculateBatch('truss-2d', {...P, members:P.members+'\n2, 7'});
 expect(r.difference).toBeNull();
 expect(r.maxDeflection).toBeGreaterThan(0);
});
it('portal fixed-base sway retains the stated axial-deformation approximation', async () => {
 const r = await calculateBatch('portal-frame', {...P, ends:'fixed'});
 expect(r.difference).toBeLessThan(.01);
});
it('continuous beam sign convention is sagging positive and hogging negative', async () => {
 const r = await calculateBatch('continuous-beam', P);
 expect(r.sagging).toBeCloseTo(25.3125, 8);
 expect(r.hogging).toBeCloseTo(-45, 8);
});
