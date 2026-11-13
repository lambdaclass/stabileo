import { readFileSync } from 'node:fs';
import * as engine from '../../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({ module: readFileSync(new URL('../../../web/src/lib/wasm/dedaliano_engine_bg.wasm',import.meta.url)) });
const cases=JSON.parse(readFileSync(new URL('../../../engine/tests/fixtures/nightly-2026-11-13.json',import.meta.url),'utf8'));
const results=[];
function run(api,input,...args){
 try {const raw=engine[api](input,...args);return {ok:typeof raw==='string'?JSON.parse(raw):raw};}
 catch(e){return {error:String(e)};}
}
for(const name of ['2012','transformed-2012']) {
 const input=JSON.stringify(cases[name]);
 results.push({name,api:'solve_corotational_2d',result:run('solve_corotational_2d',input,100,1e-10,4)});
}
for(const name of ['2020','embedded-2020-XZ','embedded-2020-XY','embedded-2020-YZ','decoded-2019','2013','transformed-2013']) {
 const input=JSON.parse(JSON.stringify(cases[name]));
 const dim=['2020','2013','transformed-2013'].includes(name)?2:3;
 for(const prefix of ['solve','certify_linear']) results.push({name,api:`${prefix}_${dim}d`,result:run(`${prefix}_${dim}d`,input)});
}
for(const name of ['2011','transformed-2011']) {
 const solver=JSON.parse(JSON.stringify(cases[name]));
 results.push({name,api:'solve_ssi_2d',result:run('solve_ssi_2d',JSON.stringify({solver,soilSprings:[],maxIter:50,tolerance:1e-10}))});
}
console.log(JSON.stringify(results,null,2));
