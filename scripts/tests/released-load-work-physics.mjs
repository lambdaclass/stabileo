import assert from 'node:assert/strict';

export function snapshot(result) {
  assert.notEqual(result.converged,false);
  return result.results??result;
}
export function check(result,model,reference,gauges=[]) {
  assert.ok(reference && Object.hasOwn(reference,'ok'),`missing native answer: ${JSON.stringify(reference)}`);
  const expected=snapshot(reference.ok);
  const r=snapshot(result);
  assert.deepEqual(r.displacements.map(d=>d.nodeId).sort(),Object.values(model.nodes).map(n=>n.id).sort());
  assert.deepEqual(r.elementForces.map(e=>e.elementId).sort(),Object.values(model.elements).map(e=>e.id).sort());
  const values=r.elementForces.flatMap(f=>Object.entries(f).filter(([k,v])=>typeof v==='number'&&/(Start|End)$/.test(k)).map(([,v])=>v));
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.some(v=>v!==0));
  for(const d of r.displacements) for(const value of Object.values(d)) if(typeof value==='number') assert.ok(Number.isFinite(value));
  const rotations=new Map();
  for(const {node,rotation} of gauges) {
    const basis=rotations.get(node)??[];
    const v=[...rotation];
    for(const q of basis) {
      const dot=v.reduce((sum,x,i)=>sum+x*q[i],0);
      for(let i=0;i<3;i++) v[i]-=dot*q[i];
    }
    const norm=Math.hypot(...v);
    assert.ok(norm>0&&Number.isFinite(norm));
    basis.push(v.map(x=>x/norm));
    rotations.set(node,basis);
  }
  const project=response=>({...response,displacements:response.displacements.map(row=>{
    const projected={...row};
    for(const q of rotations.get(row.nodeId)??[]) {
      const spin=['rx','ry','rz'].reduce((sum,key,i)=>sum+(row[key]??0)*q[i],0);
      for(const [i,key] of ['rx','ry','rz'].entries()) if(Object.hasOwn(row,key)) projected[key]-=spin*q[i];
    }
    return projected;
  })});
  const comparable=project(r),native=project(expected);
  const fields={
    displacements:{id:'nodeId',family:key=>key.startsWith('u')?'t':'r'},
    reactions:{id:'nodeId',family:key=>key.startsWith('m')?'m':'f'},
    elementForces:{id:'elementId',family:key=>/^(m|t)/i.test(key)?'m':'f',include:key=>/(Start|End)$/.test(key)}
  };
  const scale={t:0,r:0,f:0,m:0};
  for(const [collection,{id,family,include}] of Object.entries(fields)) {
    assert.deepEqual(r[collection].map(row=>row[id]).sort(),expected[collection].map(row=>row[id]).sort(),collection);
    for(const row of native[collection]) for(const [key,value] of Object.entries(row)) {
      if(key===id||typeof value!=='number'||(include&&!include(key))) continue;
      assert.ok(Number.isFinite(value));
      scale[family(key)]=Math.max(scale[family(key)],Math.abs(value));
    }
  }
  const length=Math.max(...expected.elementForces.map(f=>f.length));
  assert.ok(Number.isFinite(length)&&length>0);
  const bound={t:Math.max(scale.t,scale.r*length),r:Math.max(scale.r,scale.t/length),f:Math.max(scale.f,scale.m/length),m:Math.max(scale.m,scale.f*length)};
  for(const [label,response] of [['WASM',r],['native',expected]]) {
    assert.ok(Array.isArray(response.condensedLoads),`${label}: missing condensed loads`);
    for(const [node,basis] of rotations) {
      const load=response.condensedLoads.find(row=>row.nodeId===node);
      assert.ok(load,`${label}/${node}: missing condensed load`);
      for(const q of basis) {
        const work=['mx','my','mz'].reduce((sum,key,i)=>sum+(load[key]??0)*q[i],0);
        assert.ok(Number.isFinite(work)&&Math.abs(work)<=2.5e-10*bound.m,`${label}/${node}/released load: ${work} != zero`);
      }
    }
    for(const e of Object.values(model.elements)) for(const end of ['Start','End']) {
      const row=response.elementForces.find(row=>row.elementId===e.id);
      for(const [release,key] of [[`hinge${end}`,`m${end}`],[`releaseMy${end}`,`my${end}`],[`releaseMz${end}`,`mz${end}`],[`releaseT${end}`,`mx${end}`]]) {
        if(!e[release]) continue;
        assert.ok(Number.isFinite(row[key])&&Math.abs(row[key])<=2.5e-10*bound.m,`${label}/${e.id}/${key}/released moment: ${row[key]} != zero`);
      }
    }
  }
  for(const [collection,{id,family,include}] of Object.entries(fields)) {
    for(const row of native[collection]) {
      const actual=comparable[collection].find(a=>a[id]===row[id]);
      for(const [key,value] of Object.entries(row)) {
        if(key===id||typeof value!=='number'||(include&&!include(key))) continue;
        assert.ok(Number.isFinite(actual[key]),`${collection}/${row[id]}/${key}`);
        assert.ok(Math.abs(actual[key]-value)<=2.5e-10*bound[family(key)],`${collection}/${row[id]}/${key}: ${actual[key]} != native ${value}`);
      }
    }
  }
}
