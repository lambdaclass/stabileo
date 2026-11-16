export interface LinearPiece { a: number; b: number; qa: number; qb: number }
export function linearProfile(pieces: readonly LinearPiece[]): LinearPiece[] {
  const stations: number[]=[];
  for(const x of pieces.flatMap(p=>[p.a,p.b]).sort((a,b)=>a-b)) {
    const previous=stations.at(-1);
    if(previous===undefined || x!==previous) stations.push(x);
  }
  const sum=(values: number[])=>{
    let total=0,correction=0;
    for(const value of values) { const next=total+value;correction+=Math.abs(total)>=Math.abs(value)?(total-next)+value:(value-next)+total;total=next; }
    return total+correction;
  };
  const out: LinearPiece[]=[];
  for(let k=0;k+1<stations.length;k++) {
    const a=stations[k]!,b=stations[k+1]!;
    const active=pieces.filter(p=>p.a <= a && p.b >= b);
    if(!active.length) continue;
    const at=(x:number)=>sum(active.map(p=>p.qa+(p.qb-p.qa)*(x-p.a)/(p.b-p.a)));
    const intensityRoundoff=32*Number.EPSILON*active.reduce((s,p)=>s+Math.abs(p.qa)+Math.abs(p.qb),0);
    const clean=(x: number)=>Math.abs(x)<=intensityRoundoff?0:x;
    const qa=clean(at(a)),qb=clean(at(b));
    if(qa===0 && qb===0) continue;
    const last=out.at(-1);
    if(last && last.b===a) {
      const expected=last.qa+(qb-last.qa)*(a-last.a)/(b-last.a);
      const error=32*Number.EPSILON*sum(active.map(p=>Math.abs(p.qa)+Math.abs(p.qb)).concat([Math.abs(last.qa),Math.abs(last.qb)]));
      if(Math.abs(last.qb-qa)<=error && Math.abs(expected-qa)<=error) { last.b=b;last.qb=qb;continue; }
    }
    out.push({a,b,qa,qb});
  }
  return out;
}
