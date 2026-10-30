<script lang="ts">
  import ScalarFieldViewer from '../viewport/ScalarFieldViewer.svelte';
  import PaneTabs from '../research/shell/PaneTabs.svelte';
  import LineChart from '../research/shauer2025/LineChart.svelte';
  import ToolPreview from './ToolPreview.svelte';
  import { tBatch as t } from './batch-i18n';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import type { BatchId } from './batch';
  import type { BatchResult } from './batch-solve';
  let { id, result }: { id:BatchId; result:BatchResult|null }=$props();
  const initialTab=()=>id==='truss-2d'?'axial':id==='influence-line'?'influence':id==='beam-natural-frequency'?'mode1':'deflection';
  let active=$state(initialTab());
  let member=$state(1);
  const number=(n:number)=>new Intl.NumberFormat(publicI18n.locale,{maximumSignificantDigits:5}).format(n);
  const tabs=$derived(id==='truss-2d'?['axial','deflection']:id==='influence-line'?['influence']:id==='beam-natural-frequency'?['mode1','mode2','mode3']:['deflection','shear','moment']);
  const label=(key:string)=>key.startsWith('mode')?`${t('tools.batch.mode')} ${key.slice(-1)}`:t(['axial','influence'].includes(key)?`tools.batch.${key}`:`tools.${key}`);
  const bounds=$derived.by(()=>{ const ns=[...(result?.model.nodes.values()??[])]; const xs=ns.map(n=>n.x),zs=ns.map(n=>n.z); const minX=Math.min(0,...xs),maxX=Math.max(1,...xs),minZ=Math.min(0,...zs),maxZ=Math.max(0,...zs), size=Math.max(maxX-minX,maxZ-minZ,1); return {size,view:[minX-size*.15,minZ-size*.25,maxX+size*.15,maxZ+size*.25] as [number,number,number,number]}; });
  const mesh=$derived.by(()=>{
    const xy:number[]=[],cells:number[]=[],values:number[]=[];
    if(!result) return {xy,cells,values};
    const line=(a:number,b:number,c:number,d:number,value=0)=>{const n=xy.length/2;xy.push(a,b,c,d);cells.push(n,n+1);values.push(value);};
    for(const el of result.model.elements.values()) { const a=result.model.nodes.get(el.nodeI)!,b=result.model.nodes.get(el.nodeJ)!; line(a.x,a.z,b.x,b.z,active==='axial'?result.linear.elementForces.find(ef=>ef.elementId===el.id)!.nStart:0); }
    const h=bounds.size*.025;
    for(const s of result.model.supports.values()) { const n=result.model.nodes.get(s.nodeId)!; if(s.type==='fixed') {line(n.x,n.z-h,n.x,n.z+h);for(const z of [-h,0,h]) line(n.x,n.z+z,n.x-h,n.z+z-h);} else {line(n.x,n.z,n.x-h,n.z-h);line(n.x-h,n.z-h,n.x+h,n.z-h);line(n.x+h,n.z-h,n.x,n.z);if(s.type==='rollerX')line(n.x-h,n.z-h*1.3,n.x+h,n.z-h*1.3);} }
    const arrow=(x:number,z:number,dx:number,dz:number)=>{const length=Math.hypot(dx,dz);if(!length)return;const vx=dx/length*h*3, vz=dz/length*h*3;line(x-vx,z-vz,x,z);line(x,z,x-vx*.25-vz*.2,z-vz*.25+vx*.2);line(x,z,x-vx*.25+vz*.2,z-vz*.25-vx*.2);};
    // Arrows show direction, not force scale. Distributed loads are sampled sparsely.
    for(const load of result.model.loads) {
      if(load.type==='nodal') {const n=result.model.nodes.get(load.data.nodeId)!;arrow(n.x,n.z,load.data.fx,load.data.fz);}
      if(load.type==='distributed' && (id==='portal-frame'||load.data.elementId%4===1)) {const el=result.model.elements.get(load.data.elementId)!,a=result.model.nodes.get(el.nodeI)!,b=result.model.nodes.get(el.nodeJ)!;for(const t of id==='portal-frame'?[.1,.3,.5,.7,.9]:[.5])arrow(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,0,load.data.qI);}
      if(load.type==='pointOnElement') {const el=result.model.elements.get(load.data.elementId)!,a=result.model.nodes.get(el.nodeI)!;arrow(a.x+load.data.a,a.z,0,load.data.p);}
    }
    if(active==='deflection') for(const shape of result.shapes) { const el=result.model.elements.get(shape.elementId)!,a=result.model.nodes.get(el.nodeI)!,b=result.model.nodes.get(el.nodeJ)!; const scale=bounds.size*.12/Math.max(result.maxDeflection,1e-20); const points=shape.points.map(([x,z],j)=>{const t=j/(shape.points.length-1),bx=a.x+(b.x-a.x)*t,bz=a.z+(b.z-a.z)*t;return [bx+(x-bx)*scale,bz+(z-bz)*scale];});for(let j=1;j<points.length;j++)line(...points[j-1] as [number,number],...points[j] as [number,number],1); }
    if(active==='moment'||active==='shear') { const maximum=Math.max(1e-20,...result.charts[active].flatMap(s=>s.points.map(v=>Math.abs(v[1])))); for(const series of result.charts[active]) {const el=result.model.elements.get(Number(series.name))!,a=result.model.nodes.get(el.nodeI)!,b=result.model.nodes.get(el.nodeJ)!,L=Math.hypot(b.x-a.x,b.z-a.z),scale=bounds.size*.12/maximum; const points=series.points.map(([x,v])=>[a.x+(b.x-a.x)*x/L-(b.z-a.z)*v*scale/L,a.z+(b.z-a.z)*x/L+(b.x-a.x)*v*scale/L]);for(let j=1;j<points.length;j++)line(...points[j-1] as [number,number],...points[j] as [number,number],1); } }
    if(active.startsWith('mode')) { const mode=result.modes[Number(active.slice(-1))-1]; if(mode) {const scale=bounds.size*.12/Math.max(...mode.displacements.map(d=>Math.abs(d.uz)),1e-20); for(const el of result.model.elements.values()) {const a=result.model.nodes.get(el.nodeI)!,b=result.model.nodes.get(el.nodeJ)!,da=mode.displacements.find(d=>d.nodeId===a.id)!,db=mode.displacements.find(d=>d.nodeId===b.id)!;line(a.x,a.z+da.uz*scale,b.x,b.z+db.uz*scale,1);} } }
    return {xy,cells,values};
  });
  const plot=$derived.by(()=>{
    if(!result) return [];
    if(active.startsWith('mode')) return [{name:label(active),points:result.modes[Number(active.slice(-1))-1]?.displacements.map(d=>[result.model.nodes.get(d.nodeId)!.x,d.uz] as [number,number])??[],color:'var(--lp-accent)'}];
    const series=result.charts[active]??[];
    if(id==='portal-frame'||id==='truss-2d') return series.filter(s=>Number(s.name)===member).map(s=>({...s,color:'var(--lp-accent)'}));
    if(['moment','shear','deflection'].includes(active)) return [{name:label(active),color:'var(--lp-accent)',points:series.flatMap(s=>s.points.map(([x,v])=>[x+result!.model.nodes.get(result!.model.elements.get(Number(s.name))!.nodeI)!.x,v] as [number,number]))}];
    return series.map(s=>({...s,name:label(active),color:'var(--lp-accent)'}));
  });
</script>
<div class="viewer-heading">{t('tools.structure')}</div>
{#if result}
  <PaneTabs tabs={tabs.map(id=>({id,label:label(id)}))} bind:active />
  <ScalarFieldViewer xy={mesh.xy} cells={mesh.cells} values={mesh.values} cellSize={2} perCell={true} lineWidth={3} colourMap="diverging" geometryOnly={active!=='axial'} range={{min:-Math.max(1,...mesh.values.map(Math.abs)),max:Math.max(1,...mesh.values.map(Math.abs))}} title={label(active)} view={bounds.view} height="clamp(15rem, 32vh, 24rem)" editorButton={false} />
  <p class="note">{active==='axial'?`${t('tools.batch.compression')} / ${t('tools.batch.tension')}`:active==='influence'?t('tools.batch.effect'):active.startsWith('mode')?t('tools.batch.modalNote'):t('tools.deformedNote')}</p>
  <div role="tabpanel" id={`rs-panel-${active}`} aria-labelledby={`rs-tab-${active}`} tabindex="0" class="chart">
    {#if id==='portal-frame'||id==='truss-2d'&&active==='deflection'}<label>{t('tools.batch.member')} <select bind:value={member}>{#each [...result.model.elements.keys()] as n}<option value={n}>{n}</option>{/each}</select></label>{/if}
    {#if active==='axial'}<p>{t('tools.batch.axial')} (kN)</p>{:else}
      {#if active.startsWith('mode')}<p>f = {number(result.modes[Number(active.slice(-1))-1].frequency)} Hz</p>{/if}
      <LineChart series={plot} xLabel={id==='portal-frame'||id==='truss-2d'?'s (m)':'x (m)'} yLabel={`${label(active)} ${active==='moment'?'(kN·m)':active==='shear'?'(kN)':active==='deflection'?'(m)':active==='influence'?(result.comparisons[0]?.unit==='kN·m'?'(m)':'(1)'):''}`} height={220} />
    {/if}
  </div>
{:else}<ToolPreview {id} />{/if}
<style>
 .viewer-heading,.note,.chart { padding: 1rem; } .note {font-size:.8125rem;color:var(--fg-2);} .viewer-heading {border-bottom:1px solid var(--hair);font:.875rem var(--lp-mono);} select {min-height:44px;background:var(--card);color:var(--fg);font-size:14px;}
 :global(.tools .rs-tabs) {flex-wrap:wrap;} :global(.tools .sfv-wrap button) {min-height:44px;min-width:44px;font-size:12px;} :global(.tools .sfv-mark),:global(.tools .sfv-status) {font-size:12px;}
</style>
