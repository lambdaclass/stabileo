import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from './released-load-work-physics.mjs';

const model={nodes:{1:{id:1},2:{id:2}},elements:{1:{id:1,nodeI:1,nodeJ:2,releaseTStart:true}}};
const gauges=[{node:1,rotation:[1,0,0]}];
const answer=()=>({displacements:[{nodeId:1,ux:0,uy:0,uz:0,rx:0,ry:1,rz:0},{nodeId:2,ux:1,uy:0,uz:0,rx:0,ry:0,rz:0}],reactions:[{nodeId:2,fx:1,fy:0,fz:0,mx:0,my:1,mz:0}],elementForces:[{elementId:1,length:1,nStart:1,nEnd:1,mxStart:0,mxEnd:0,myStart:1,myEnd:1,mzStart:0,mzEnd:0}],condensedLoads:[{nodeId:1,mx:0,my:1,mz:0},{nodeId:2,mx:0,my:0,mz:0}]});

test('independent finite gauge spins preserve the physical answer',()=>{
  for(const side of ['wasm','native','both']) {
    const wasm=answer(),native=answer();
    if(side!=='native') wasm.displacements[0].rx=3;
    if(side!=='wasm') native.displacements[0].rx=-7;
    check(wasm,model,{ok:native},gauges);
  }
});

for(const quantity of ['released moment','released load']) for(const side of ['wasm','native','both']) {
  test(`${side} corruption of ${quantity} fails independently`,()=>{
    const wasm=answer(),native=answer();
    for(const response of side==='both'?[wasm,native]:[side==='wasm'?wasm:native]) {
      if(quantity==='released moment') response.elementForces[0].mxStart=1;
      else response.condensedLoads[0].mx=1;
    }
    assert.throws(()=>check(wasm,model,{ok:native},gauges),/released (moment|load)/);
  });
}

test('correct answer and retained rotations remain checked',()=>{
  check(answer(),model,{ok:answer()},gauges);
  const wrong=answer();
  wrong.displacements[0].ry=2;
  assert.throws(()=>check(wrong,model,{ok:answer()},gauges),/displacements/);
});

for(const quantity of ['released moment','released load']) {
  test(`${quantity} keeps the strict factor boundary`,()=>{
    for(const magnitude of [2.5e-10,2.5e-10*(1+Number.EPSILON)]) {
      const wasm=answer(),native=answer();
      for(const response of [wasm,native]) {
        if(quantity==='released moment') response.elementForces[0].mxStart=magnitude;
        else response.condensedLoads[0].mx=magnitude;
      }
      const verify=()=>check(wasm,model,{ok:native},gauges);
      if(magnitude===2.5e-10) verify();
      else assert.throws(verify,/released (moment|load)/);
    }
  });
}

test('a release attached to rotational stiffness retains its rotation comparison',()=>{
  const sprung=structuredClone(model);
  sprung.supports={1:{nodeId:1,krx:1}};
  const wrong=answer();
  wrong.displacements[0].rx=1;
  assert.throws(()=>check(wrong,sprung,{ok:answer()},[]),/displacements/);
});

test('an oblique gauge preserves the orthogonal retained rotation',()=>{
  const oblique=[{node:1,rotation:[Math.SQRT1_2,Math.SQRT1_2,0]}];
  const wasm=answer(),native=answer();
  for(const response of [wasm,native]) response.condensedLoads[0].my=0;
  wasm.displacements[0].rx+=3*Math.SQRT1_2;
  wasm.displacements[0].ry+=3*Math.SQRT1_2;
  check(wasm,model,{ok:native},oblique);
  wasm.displacements[0].rx+=1;
  wasm.displacements[0].ry-=1;
  assert.throws(()=>check(wasm,model,{ok:native},oblique),/displacements/);
});

for(const [release,component,axis] of [['hinge','m',1],['releaseMy','my',1],['releaseMz','mz',2],['releaseT','mx',0]]) for(const end of ['Start','End']) {
  test(`${release}${end} checks every physical corruption side`,()=>{
    const released=structuredClone(model);
    released.elements[1]={id:1,nodeI:1,nodeJ:2,[`${release}${end}`]:true};
    const node=end==='Start'?1:2;
    const rotation=[0,0,0];
    rotation[axis]=1;
    const directions=[{node,rotation}];
    for(const side of ['wasm','native','both']) for(const quantity of ['moment','load']) {
      const wasm=answer(),native=answer();
      for(const response of [wasm,native]) {
        response.elementForces[0][`${component}${end}`]=0;
        response.condensedLoads.find(row=>row.nodeId===node)[['mx','my','mz'][axis]]=0;
      }
      check(wasm,released,{ok:native},directions);
      for(const response of side==='both'?[wasm,native]:[side==='wasm'?wasm:native]) {
        if(quantity==='moment') response.elementForces[0][`${component}${end}`]=1;
        else response.condensedLoads.find(row=>row.nodeId===node)[['mx','my','mz'][axis]]=1;
      }
      assert.throws(()=>check(wasm,released,{ok:native},directions),new RegExp(`released ${quantity}`));
    }
  });
}
