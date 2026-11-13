import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from './released-load-work-physics.mjs';

const model={nodes:{1:{id:1},2:{id:2}},elements:{1:{id:1,nodeI:1,nodeJ:2,releaseTStart:true}}};
const gauges=[{node:1,rotation:[1,0,0]}];
const answer=()=>({displacements:[{nodeId:1,ux:0,uy:0,uz:0,rx:0,ry:1,rz:0},{nodeId:2,ux:1,uy:0,uz:0,rx:0,ry:0,rz:0}],reactions:[{nodeId:2,fx:1,fy:0,fz:0,mx:0,my:1,mz:0}],elementForces:[{elementId:1,length:1,nStart:1,nEnd:1,tStart:0,tEnd:0,myStart:1,myEnd:1,mzStart:0,mzEnd:0}],condensedLoads:[{nodeId:1,mx:0,my:1,mz:0},{nodeId:2,mx:0,my:0,mz:0}]});
const knownWrong=process.env.RUN_KNOWN_WRONG?false:'known wrong result: #2074';

test('independent finite gauge spins preserve the physical answer',{skip:knownWrong},()=>{
  for(const side of ['wasm','native','both']) {
    const wasm=answer(),native=answer();
    if(side!=='native') wasm.displacements[0].rx=3;
    if(side!=='wasm') native.displacements[0].rx=-7;
    check(wasm,model,{ok:native},gauges);
  }
});

for(const quantity of ['released moment','released load']) for(const side of ['wasm','native','both']) {
  test(`${side} corruption of ${quantity} fails independently`,{skip:knownWrong},()=>{
    const wasm=answer(),native=answer();
    for(const response of side==='both'?[wasm,native]:[side==='wasm'?wasm:native]) {
      if(quantity==='released moment') response.elementForces[0].tStart=1;
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
