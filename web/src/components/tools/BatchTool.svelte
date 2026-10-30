<script lang="ts">
 import PublicLink from '../landing/PublicLink.svelte';
 import ParamRow from '../research/shell/ParamRow.svelte';
 import Sci from '../research/shell/Sci.svelte';
 import BatchViewer from './BatchViewer.svelte';
 import { tBatch as t } from './batch-i18n';
 import { publicI18n } from '../../lib/i18n/store.svelte';
 import { knownIssueMessage } from '../../lib/engine/known-issues';
 import { DEFAULT_BATCH, validateBatch, type BatchId, type BatchParameters } from './batch';
 import type { BatchResult } from './batch-solve';
 let {id}:{id:BatchId}=$props();
 let p=$state<BatchParameters>({...DEFAULT_BATCH});
 let result=$state<BatchResult|null>(null), error=$state(''),busy=$state(false),href=$state('');
 let revision=0;
 const number=(n:number)=>new Intl.NumberFormat(publicI18n.locale,{maximumSignificantDigits:6}).format(n);
 const fields=$derived(([
  ['e','tools.modulus','MPa',1,1e6],['i','tools.inertia','m⁴',1e-10,10],['area','tools.batch.area','m²',1e-6,10],
  ...(id!=='continuous-beam'&&id!=='truss-2d'?[['length','tools.length','m',.1,100]]:[]),
  ...(id==='portal-frame'?[['height','tools.batch.height','m',.1,100],['horizontal','tools.batch.horizontal','kN',0,1e6]]:[]),
  ...(id==='portal-frame'||id==='influence-line'?[['load','tools.load',id==='portal-frame'?'kN/m':'kN',0,1e6]]:[]),
  ...(id==='beam-natural-frequency'?[['mass','tools.batch.mass','kg/m',.001,1e6]]:[]),
  ...(id==='influence-line'?[['position','tools.batch.section','m',.000001,p.length*p.count-.000001]]:[])
 ] as [keyof Pick<BatchParameters,'e'|'i'|'area'|'length'|'height'|'horizontal'|'load'|'mass'|'position'>,string,string,number,number][]).filter(([key])=>id!=='truss-2d'||key!=='i'));
 $effect(()=>{
  const tool=id,values={...p}; revision++; result=null;href='';error='';busy=true;
  const timer=setTimeout(()=>void run(tool,values),250);
  return ()=>{clearTimeout(timer);revision++;};
 });
 async function run(tool:BatchId,values:BatchParameters) {
  const token=++revision;
  try {validateBatch(tool,values); const [{calculateBatch},{editorUrl}]=await Promise.all([import('./batch-solve'),import('./share')]);const answer=await calculateBatch(tool,values);if(token!==revision)return; result=answer;href=editorUrl(answer.model,t(`tools.${tool}`),tool==='beam-natural-frequency'?{massPerLength:values.mass}:undefined);}
  catch(e) {if(token===revision)error=e instanceof Error&&e.message.startsWith('tools.')?t(e.message):`${t('tools.failed')} ${e instanceof Error?e.message:String(e)}`;}
  finally {if(token===revision)busy=false;}
 }
 const formula=$derived(id==='portal-frame'?'δpinned = Hh²(L + 2h)/(12EI); δfixed = Hh³(4L + 6h)/[24EI(L + 6h)]':id==='beam-natural-frequency'?'fn = βn²/(2πL²) √(EI/μ); βsimple = nπ; βcantilever = 1.875104, 4.694091, 7.854757; βfixed = 4.730041, 7.853205, 10.995608':t(id==='continuous-beam'?'tools.batch.continuousMethod':id==='truss-2d'?'tools.batch.trussMethod':'tools.batch.influenceMethod'));
</script>
<div class="tool-layout">
 <header class="tool-intro"><p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p><span class="badge">{t('tools.firstVersion')}</span><h1>{t(`tools.${id}`)}</h1><p class="lead">{t(`tools.${id}.subtitle`)}</p></header>
 <aside class="tool-viewer" aria-label={t(`tools.${id}`)}><BatchViewer {id} {result}/></aside>
 <section class="tool-inputs"><form onsubmit={event=>event.preventDefault()}>
  {#each fields as [key,label,unit,min,max]}<ParamRow id={key} name={t(label)} {unit}><input id={key} data-testid={key} type="number" bind:value={p[key]} {min} {max} step="any" required/></ParamRow>{/each}
  {#if id==='continuous-beam'}
   <label for="spans">{t('tools.batch.spans')} (m; 0.1–100)</label><input id="spans" bind:value={p.spans} />
   <label for="loads">{t('tools.batch.loads')} (kN/m; 0–10⁶)</label><input id="loads" bind:value={p.loads}/>
  {/if}
  {#if id==='continuous-beam'||id==='portal-frame'}<ParamRow id="ends" name={`${t('tools.ends')}${id==='continuous-beam'?' (x = 0)':''}`}><select id="ends" bind:value={p.ends}><option value="pinned">{t('tools.batch.pinned')}</option><option value="fixed">{t('tools.batch.fixed')}</option></select></ParamRow>{/if}
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
 </form>{#if busy}<p role="status">{t('tools.loading')}</p>{/if}{#if error}<p role="alert">{error}</p>{/if}</section>
 <article class="tool-results rs-prose">
  {#if result}
   <div class="results" aria-live="polite">
    {#if id==='continuous-beam'||id==='portal-frame'||id==='truss-2d'}
     <div class="result"><span>{t('tools.deflection')}</span><strong data-testid="engine-value">{number(result.maxDeflection)} <small>m</small></strong></div>
     {#if id==='continuous-beam'}<div class="result"><span>{t('tools.batch.sagging')}</span><strong>{number(result.sagging)} <small>kN·m</small></strong></div><div class="result"><span>{t('tools.batch.hogging')}</span><strong>{number(result.hogging)} <small>kN·m</small></strong></div>{/if}
     {#if id==='portal-frame'}<div class="result"><span>{t('tools.moment')}</span><strong>{number(result.maxMoment)} <small>kN·m</small></strong></div><div class="result"><span>{t('tools.batch.sway')}</span><strong>{number(result.comparisons[0].engine)} <small>m</small></strong></div>{/if}
    {:else if id==='influence-line'}<div class="result"><span>{t('tools.batch.effect')}</span><strong data-testid="engine-value">{number(result.maximum[1]*p.load)} <small>{p.quantity==='moment'?'kN·m':'kN'}</small></strong><span>x = {number(result.maximum[0])} m</span></div>
    {:else}{#each result.modes as mode,j}<div class="result"><span>f{j+1}</span><strong data-testid="engine-value">{number(mode.frequency)} <small>Hz</small></strong></div>{/each}{/if}
   </div>
   {#if !['beam-natural-frequency','influence-line'].includes(id)}<h2>{t('tools.reactions')}</h2><div class="table-scroll"><table><thead><tr><th>ID</th><th>Rx (kN)</th><th>Rz (kN)</th><th>My (kN·m)</th></tr></thead><tbody>{#each result.linear.reactions as r}<tr><td>{r.nodeId}</td><td>{number(r.rx)}</td><td>{number(r.rz)}</td><td>{number(r.my)}</td></tr>{/each}</tbody></table></div>{/if}
   {#if id==='truss-2d'}<h2>{t('tools.batch.axial')}</h2><p><span class="tension">{t('tools.batch.tension')}</span> · <span class="compression">{t('tools.batch.compression')}</span></p><div class="force-grid">{#each result.linear.elementForces as ef}<span class:tension={ef.nStart>=0} class:compression={ef.nStart<0}>N{ef.elementId}: {number(ef.nStart)} kN</span>{/each}</div>{/if}
   <p class="verification" data-testid="agreement" data-difference={result.difference??undefined}>{t('tools.comparison')}: {#if result.difference!==null}{t('tools.difference')} <Sci value={result.difference*100} unit="%"/>{:else}{t('tools.batch.noReference')}{/if}</p>
   {#each result.comparisons as c}<p class="verification">{t(c.label)}: {t('tools.engine')} {number(c.engine)} / {t('tools.batch.method')} {number(c.reference)} {c.unit} · <Sci value={c.difference*100} unit="%"/></p>{/each}
   <a class="btn btn-primary open-editor" href={href}>{t('tools.open')} ↗</a>
   {#each result.linear.structuredDiagnostics??[] as warning}<p role="status">{knownIssueMessage(warning)}</p>{/each}
  {/if}
  <h2>{t('tools.formula')} / {t('tools.batch.method')}</h2><p class="formula">{formula}</p>
  <h2>{t('tools.assumptionsTitle')}</h2><p>{t('tools.batch.assumptions')}</p>
  {#if id==='portal-frame'}<p>{t('tools.batch.portalNote')}</p>{/if}
  {#if id==='beam-natural-frequency'}<p>{t('tools.batch.modalNote')}</p>{/if}
  <details><summary>{t('tools.technical')}</summary><p>{t('tools.solverNote')}</p>{#if id!=='truss-2d'&&id!=='portal-frame'}<p>{t('tools.batch.sampling')}</p>{/if}{#if result}<p>{t('tools.dofs')}: {result.model.nodes.size*3}</p>{/if}</details>
 </article>
</div>
<style>
 .crumb :global(a) {display:inline-flex;align-items:center;min-height:44px;} .tool-layout {display:grid;gap:1.5rem;} .tool-layout>* {min-width:0;} h1 {font:600 clamp(2rem,4.5vw,3rem)/1.1 var(--lp-display);margin:.75rem 0;} .lead {font-size:1.05rem;color:var(--fg);margin-bottom:0;} .crumb {font-size:.95rem;color:var(--fg-2);margin-bottom:1rem;}
 .badge {border:1px solid var(--hair);border-radius:3px;padding:.2rem .4rem;font:500 .75rem var(--lp-mono);color:var(--fg-2);} form {border-top:1px solid var(--hair);padding-top:1rem;} input,select,textarea {min-height:44px;min-width:0;max-width:100%;background:var(--card);color:var(--fg);border:1px solid var(--hair);border-radius:3px;padding:.4rem;font:.875rem var(--lp-mono);} textarea,form>input {width:100%;box-sizing:border-box;} textarea {resize:vertical;} form>label {display:block;margin-top:1rem;margin-bottom:.5rem;} .tool-inputs :global(.rs-param) {grid-template-columns:minmax(0,1fr) minmax(6rem,10rem) 3.5rem;} .tool-viewer {border:1px solid var(--card-hair);border-radius:6px;background:var(--card);overflow:hidden;}
 .results {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.25rem;padding:1.25rem 0;border-block:1px solid var(--hair);} .result {display:grid;gap:.25rem;font-size:.875rem;color:var(--fg-2);} .result:first-child {grid-column:1/-1;} .result strong {font:500 clamp(1.75rem,3vw,2.5rem) var(--lp-display);color:var(--fg);overflow-wrap:anywhere;} .result small {font:.875rem var(--lp-mono);} .verification {font-size:.875rem;color:var(--fg-2);overflow-wrap:anywhere;} .formula {font:.875rem/1.8 var(--lp-mono);overflow-wrap:anywhere;} details {border-top:1px solid var(--hair);margin-top:2rem;padding-top:1rem;font-size:.875rem;} summary {min-height:44px;cursor:pointer;} .table-scroll {overflow-x:auto;} table {width:100%;font:.8125rem var(--lp-mono);} th,td {padding:.5rem;text-align:left;} .force-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem;font:.875rem var(--lp-mono);} .tension {color:#f4a582;} .compression {color:#92c5de;} .open-editor {min-height:44px;}
 @media(max-height: 450px) and (max-width: 69.99rem) { .crumb {margin:0 0 .25rem;} h1 {margin:.5rem 0;font-size:2rem;} .lead {margin-top:.5rem;} .tool-layout {gap:1rem;} }
 @media(min-width:70rem) {.tool-layout {grid-template-columns:minmax(25rem,38rem) minmax(0,1fr);column-gap:3rem;align-items:start;} .tool-intro {grid-column:1;grid-row:1;} .tool-inputs {grid-column:1;grid-row:2;} .tool-results {grid-column:1;grid-row:3;} .tool-viewer {grid-column:2;grid-row:1/4;position:sticky;top:calc(var(--lp-nav-h,3.6rem) + .75rem);}}
</style>
