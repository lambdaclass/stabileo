<script lang="ts">
 import { onDestroy, untrack } from 'svelte';
 import PublicLink from '../landing/PublicLink.svelte';
 import ParamRow from '../research/shell/ParamRow.svelte';
 import Sci from '../research/shell/Sci.svelte';
 import FigureBoard from './figures/FigureBoard.svelte';
 import { batchFigures } from './figures/batch-figures';
 import { tBatch as t } from './batch-i18n';
 import { publicI18n } from '../../lib/i18n/store.svelte';
 import { type Warning } from './validity';
 import { solverMessages } from './solver-messages';
 import { liveSolver, SOLVE_DELAY } from './live-solve';
 import { widen, type Span } from './slider';
 import { DEFAULT_BATCH, validateBatch, type BatchId, type BatchParameters } from './batch';
 import type { BatchResult } from './batch-solve';
 import { prerenderedResult, recordPrerenderedResult } from './prerendered-result';
 type Field = keyof Pick<BatchParameters,'e'|'i'|'area'|'length'|'height'|'horizontal'|'load'|'mass'|'position'>;
 let {id}:{id:BatchId}=$props();
 let p=$state<BatchParameters>({...DEFAULT_BATCH});
 let result=$state.raw<BatchResult|null>(null), error=$state(''), stale=$state(false), href=$state('');
 const warmSolver=()=>{void import('../../lib/engine/wasm-solver').then(m=>m.initSolver()).catch(()=>{});};
 const number=(n:number,digits=6)=>new Intl.NumberFormat(publicI18n.locale,{maximumSignificantDigits:digits}).format(n);
 const warning=(w:Warning)=>Object.entries(w.values??{}).reduce((text,[k,v])=>text.replace(`{${k}}`,typeof v==='number'?new Intl.NumberFormat(publicI18n.locale,{maximumSignificantDigits:3,notation:v>=1e5?'scientific':'standard'}).format(v):v),t(w.key));
 const largest=(r:BatchResult)=>Math.max(...r.comparisons.map(c=>Math.abs(c.engine-c.reference)));
 let sliders=$state<Partial<Record<Field,Span>>>({length:[1,30,.1],height:[1,15,.1],horizontal:[0,100,1],load:[0,100,1],mass:[10,2000,10]});
 const fields=$derived(([
  ['e','tools.modulus','MPa',1,1e6],['i','tools.inertia','m⁴',1e-10,10],['area','tools.batch.area','m²',1e-6,10],
  ...(id!=='continuous-beam'&&id!=='truss-2d'?[['length','tools.length','m',.1,100]]:[]),
  ...(id==='portal-frame'?[['height','tools.batch.height','m',.1,100],['horizontal','tools.batch.horizontal','kN',0,1e6]]:[]),
  ...(id==='portal-frame'||id==='influence-line'?[['load','tools.load',id==='portal-frame'?'kN/m':'kN',0,1e6]]:[]),
  ...(id==='beam-natural-frequency'?[['mass','tools.batch.mass','kg/m',.001,1e6]]:[]),
  ...(id==='influence-line'?[['position','tools.batch.section','m',.000001,p.length*p.count-.000001]]:[])
 ] as [Field,string,string,number,number][]).filter(([key])=>id!=='truss-2d'||key!=='i'));
 const slider=(key:Field):Span|undefined=>key==='position'?[p.length*p.count/100,p.length*p.count*.99,p.length*p.count/100]:sliders[key];
 const solver=liveSolver(
  async(values:BatchParameters)=>{validateBatch(id,values);const {calculateBatch}=await import('./batch-solve');return calculateBatch(id,values);},
  (outcome,values,superseded)=>{
   stale=superseded;
   if(!outcome.ok){const e=outcome.error;error=t(e instanceof Error&&e.message.startsWith('tools.')?e.message:'tools.failed');stale=true;return;}
   error='';result=outcome.value;recordPrerenderedResult(id,values,outcome.value);void link(outcome.value,values);
  },
  {delay:()=>id==='influence-line'||id==='beam-natural-frequency'?SOLVE_DELAY:0});
 onDestroy(()=>solver.stop());
 async function link(answer:BatchResult,values:BatchParameters){const {editorUrl}=await import('./share');if(result===answer)href=editorUrl(answer.model,t(`tools.${id}`),id==='beam-natural-frequency'?{massPerLength:values.mass}:undefined);}
 $effect(()=>{
  const values={...p};
  untrack(()=>{
   sliders=Object.fromEntries(Object.entries(sliders).map(([key,span])=>[key,widen(span,values[key as Field])]));
   const ready=result?null:prerenderedResult<BatchResult>(id,values);
   if(ready){result=ready;void link(ready,values);return;}
   stale=true;solver.request(values);
  });
 });
 const figures=$derived(result?batchFigures(id,result,t,result.comparisons[0]?.unit==='kN·m'?'m':'1'):[]);
 const formula=$derived(id==='portal-frame'?'δpinned = Hh²(L + 2h)/(12EI); δfixed = Hh³(4L + 6h)/[24EI(L + 6h)]':id==='beam-natural-frequency'?'fn = βn²/(2πL²) √(EI/μ); βsimple = nπ; βcantilever = 1.875104, 4.694091, 7.854757; βfixed = 4.730041, 7.853205, 10.995608':t(id==='continuous-beam'?'tools.batch.continuousMethod':id==='truss-2d'?'tools.batch.trussMethod':'tools.batch.influenceMethod'));
</script>
<div class="tool-layout">
 <div class="tool-side">
  <header class="tool-intro"><p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p><h1>{t(`tools.${id}`)}</h1><p class="lead">{t(`tools.${id}.subtitle`)}</p></header>
  <section class="tool-inputs" aria-labelledby="tool-parameters"><h2 id="tool-parameters">{t('tools.parameters')}</h2><form onsubmit={event=>event.preventDefault()} onfocusin={warmSolver} onpointerdown={warmSolver}>
  {#each fields as [key,label,unit,min,max] (key)}{@const range=slider(key)}<ParamRow id={key} name={t(label)} {unit}><input id={key} data-testid={key} type="number" bind:value={p[key]} {min} {max} step="any" required/></ParamRow>{#if range}{#key range.join()}<input type="range" data-testid={`slider-${key}`} aria-label={t(label)} min={range[0]} max={range[1]} step={range[2]} bind:value={p[key]}/>{/key}{/if}{/each}
  {#if id==='continuous-beam'}
   <p>{t('tools.batch.listNote')}</p><label for="spans">{t('tools.batch.spans')} (m; 0.1–100)</label><input id="spans" bind:value={p.spans} />
   <label for="loads">{t('tools.batch.loads')} (kN/m; 0–10⁶)</label><input id="loads" bind:value={p.loads}/>
  {/if}
  {#if id==='continuous-beam'||id==='portal-frame'}<ParamRow id="ends" name={id==='portal-frame'?t('tools.batch.bases'):`${t('tools.ends')} (x = 0)`}><select id="ends" bind:value={p.ends}><option value="pinned">{t('tools.batch.pinned')}</option><option value="fixed">{t('tools.batch.fixed')}</option></select></ParamRow>{/if}
  {#if id==='continuous-beam'}<ParamRow id="right-end" name={`${t('tools.ends')} (x = L)`}><select id="right-end" bind:value={p.rightEnd}><option value="pinned">{t('tools.batch.pinned')}</option><option value="fixed">{t('tools.batch.fixed')}</option></select></ParamRow>{/if}
  {#if id==='truss-2d'}
   <p>{t('tools.batch.trussNote')}</p>
   {#each ['nodes','members','supports','nodalLoads'] as field}{@const key=field as 'nodes'|'members'|'supports'|'nodalLoads'}<label for={key}>{t(`tools.batch.${key}`)}</label><textarea id={key} bind:value={p[key]} rows={key==='nodes'||key==='members'?6:3} maxlength="10000" spellcheck="false"></textarea>{/each}
  {/if}
  {#if id==='beam-natural-frequency'}<ParamRow id="boundary" name={t('tools.ends')}><select id="boundary" bind:value={p.boundary}><option value="simple">{t('tools.pinnedPinned')}</option><option value="cantilever">{t('tools.fixedFree')}</option><option value="fixed">{t('tools.fixedFixed')}</option></select></ParamRow>{/if}
  {#if id==='influence-line'}
   <ParamRow id="count" name={t('tools.batch.count')}><select id="count" bind:value={p.count}><option value={1}>1</option><option value={2}>2</option></select></ParamRow>
   <ParamRow id="quantity" name={t('tools.batch.quantity')}><select id="quantity" bind:value={p.quantity}><option value="reaction">{t('tools.batch.reaction')}</option><option value="moment">{t('tools.moment')}</option><option value="shear">{t('tools.shear')}</option></select></ParamRow>
  {/if}
 </form><p class="status" role="status">{#if stale&&!error}{t('tools.loading')}{/if}</p>{#if error}<p class="warning" role="alert">{error}</p>{/if}</section>
 </div>
 <div class="tool-main">
  {#if figures.length}<FigureBoard {figures} stale={stale||!!error} label={t('tools.figures')}/>{/if}
  <article class="tool-results rs-prose" class:stale aria-busy={stale} data-testid="tool-results">
  <div aria-live="polite">
  {#if result && !error}
   {#each result.warnings as w}<p class="warning" role="alert" data-testid="validity-warning">{warning(w)}</p>{/each}
   <div class="results">
    {#if id==='continuous-beam'||id==='portal-frame'||id==='truss-2d'}
     <div class="result"><span>{t('tools.batch.displacement')}</span><strong data-testid="engine-value">{number(result.maxDeflection)} <small>m</small></strong></div>
     {#if id==='continuous-beam'}<div class="result"><span>{t('tools.batch.sagging')}</span><strong>{number(result.sagging)} <small>kN·m</small></strong></div><div class="result"><span>{t('tools.batch.hogging')}</span><strong>{number(result.hogging)} <small>kN·m</small></strong></div>{/if}
     {#if id==='portal-frame'}<div class="result"><span>{t('tools.moment')}</span><strong>{number(result.maxMoment)} <small>kN·m</small></strong></div><div class="result"><span>{t('tools.batch.sway')}</span><strong data-testid="sway">{number(result.comparisons[0].engine)} <small>m</small></strong></div>{/if}
    {:else if id==='influence-line'}<div class="result"><span>{t('tools.batch.effect')}</span><strong data-testid="engine-value">{number(result.maximum[1]*p.load)} <small>{p.quantity==='moment'?'kN·m':'kN'}</small></strong><span>x = {number(result.maximum[0])} m</span></div>
    {:else}{#each result.modes as mode,j}<div class="result"><span>f{j+1}</span><strong data-testid="engine-value">{number(mode.frequency)} <small>Hz</small></strong></div>{/each}{/if}
   </div>
   {#if !['beam-natural-frequency','influence-line'].includes(id)}<h2>{t('tools.reactions')}</h2><div class="table-scroll"><table><thead><tr><th>{t('tools.batch.node')}</th><th>Rx (kN)</th><th>Rz (kN)</th><th>My (kN·m)</th></tr></thead><tbody>{#each result.linear.reactions as r}<tr><td>{r.nodeId}</td><td>{number(r.rx)}</td><td>{number(r.rz)}</td><td>{number(r.my)}</td></tr>{/each}</tbody></table></div>{/if}
   {#if id==='truss-2d'}<h2>{t('tools.batch.axial')}</h2><p><span class="tension">{t('tools.batch.tension')}</span> · <span class="compression">{t('tools.batch.compression')}</span></p><div class="force-grid">{#each result.linear.elementForces as ef}<span data-testid="axial-force" class:tension={ef.nStart>=0} class:compression={ef.nStart<0}>N{ef.elementId}: {number(ef.nStart)} kN</span>{/each}</div>{/if}
   <p class="verification" data-testid="agreement" data-difference={result.difference??undefined} data-absolute={result.difference===null&&result.comparisons.length?largest(result):undefined}>{t('tools.comparison')}: {#if result.difference!==null}{t('tools.difference')} <Sci value={result.difference*100} unit="%"/>{:else if result.comparisons.length}{t('tools.batch.zeroReference')} <Sci value={largest(result)} unit={result.comparisons[0].unit}/>{:else}{t('tools.batch.noReference')}{/if}</p>
   {#each result.comparisons as c}<p class="verification">{t(c.label)}: {t('tools.engine')} {number(c.engine)} / {t('tools.batch.method')} {number(c.reference)} {c.unit} · {#if c.absolute}{t('tools.absoluteDifference')} <Sci value={Math.abs(c.engine-c.reference)} unit={c.unit}/>{:else}<Sci value={(c.difference??0)*100} unit="%"/>{/if}</p>{/each}
   <a class="btn btn-primary open-editor" href={href}>{t('tools.open')} ↗</a>
   {#each solverMessages(result.linear.structuredDiagnostics??[],t) as message}<p class="warning" role="alert">{message}</p>{/each}
  {/if}
  </div>
  <h2>{t('tools.formula')} / {t('tools.batch.method')}</h2><p class="formula" translate="no">{formula}</p>
  <h2>{t('tools.assumptionsTitle')}</h2><p>{t('tools.batch.assumptions')}</p>
  {#if id==='portal-frame'}<p>{t('tools.batch.portalNote')}</p>{/if}
  {#if id==='influence-line'}<p>{t('tools.batch.influenceSign')}</p>{:else if id!=='beam-natural-frequency'}<p>{t('tools.batch.signConvention')}</p>{/if}
  {#if id!=='beam-natural-frequency'&&id!=='influence-line'}<p>{t('tools.batch.displacementNote')}</p>{/if}
  {#if id==='beam-natural-frequency'}<p>{t('tools.batch.modalNote')}</p>{/if}
  <h2>{t('tools.references')}</h2><p>{t('tools.batch.references')}</p>
  <details><summary>{t('tools.technical')}</summary><p>{t('tools.solverNote')}</p>{#if id!=='truss-2d'&&id!=='portal-frame'}<p>{t('tools.batch.sampling')}</p>{/if}{#if result}<p>{t('tools.dofs')}: {result.model.nodes.size*3}</p>{/if}</details>
 </article>
 </div>
</div>
<style>
 .force-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem;font:.875rem var(--lp-mono);} .tension {color:#f4a582;} .compression {color:#92c5de;}
</style>
