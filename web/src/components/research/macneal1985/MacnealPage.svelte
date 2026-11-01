<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import { cases, nativeOnly, runCases, tolerance, viewerData, type Result } from './cases';
  import { editorURL } from './editor';
  import { strings } from './i18n';

  let rows = $state<Result[]>([]);
  let busy = $state(false);
  let failure = $state('');
  let selected = $state(cases[6].id);
  let tab = $state('viewer');
  let scale = $state(1);
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const current = $derived(cases.find(c => c.id === selected)!);
  const result = $derived(rows.find(r => r.id === selected));
  const view = $derived(viewerData(current, result));
  const passed = $derived(rows.filter(r => r.pass).length);
  const fmt = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 7 }).format(v);
  async function run() {
    if (busy) return;
    busy = true; failure = ''; rows = [];
    try { rows = await runCases(); }
    catch (e) { failure = String(e); }
    finally { busy = false; }
  }
  function open() { window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href), '_blank', 'noopener'); }
  onMount(() => { void run(); });
</script>

<ExperimentShell paperId="macneal-harder-1985" name={s.title}
  lead={s.lead}
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: () => {}, setParams: () => {}, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'none', why: s.referenceWhy }, published: { kind: 'none', why: s.publishedWhy } }}>
  {#snippet article()}
    <h2>{s.testedHeading}</h2>
    <p>{s.testedDescription}</p>
    <p>{s.modelDescription}</p>
    <h2>{s.definitionHeading}</h2>
    <p><a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/macneal_harder.json">{s.definitionLink}</a>{s.definitionDescription}</p>
    <h2>{s.accuracyHeading}</h2>
    <p>{s.accuracyDescription}</p>
    <h2 id="limitations">{s.limitationsHeading}</h2>
    <p>{s.limitationsBeforeRegistry}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/src/known_issues.rs">{s.registryLink}</a>{s.registryStatus}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#mh-mitc4-distortion">{s.ledgerLink}</a>{s.limitationsAfterLedger}</p>
    <p>{s.referenceProvenance}</p>
    <h2>{s.native}</h2>
    <ul>{#each nativeOnly as c}<li><strong>{c.label}</strong>: {c.reason} <code>{c.nativeTest}</code></li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane">
      <p role="status" data-testid="benchmark-summary">{#if busy}{s.running}{:else if rows.length === cases.length}{s.summary}: {passed}/{cases.length} {s.within} {fmt(100 * tolerance)}%{:else}{s.pending}{/if}</p>
      <p>{s.subset}</p>
      <button onclick={run} disabled={busy}>{s.run}</button>
      {#if failure}<p role="alert">{s.failed}: {failure}</p>{/if}
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <label>{s.select}<select bind:value={selected}>{#each cases as c}<option value={c.id}>{c.label}</option>{/each}</select></label>
        <label>{s.scale}<input type="range" min="0" max="20" step="0.5" bind:value={scale} />{scale}</label>
        <ScalarFieldViewer {...view} cellSize={current.dimension === 2 ? 2 : 4} deformScale={scale} showMesh={true} title={current.label} unit="m" height="23rem" onOpenEditor={open} />
        <p>{s.projection}</p>
        <button onclick={open}>{s.open}</button>
        <p>{current.source}</p>
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <div class="table-scroll" id="checks"><table><thead><tr><th>{s.select}</th><th>{s.reference}</th><th>Stabileo</th><th>{s.error} %</th><th></th></tr></thead><tbody>
          {#each cases as c}
            {@const r = rows.find(r => r.id === c.id)}
            <tr data-testid={c.id}><th><button onclick={() => { selected = c.id; tab = 'viewer'; }}>{c.label}</button></th><td>{fmt(c.reference)}</td><td>{fmt(r?.value)}</td><td>{fmt(r?.error == null ? null : r.error * 100)}</td><td>{#if !r}{s.pending}{:else if r.pass}{s.pass}{:else}<a href={c.knownIssue} title={s.issue}>{s.fail}</a>{#if r.failure}<p>{r.failure}</p>{/if}{/if}</td></tr>
          {/each}
        </tbody></table></div>
      </div>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  button, select, input { font: inherit; }
  button, select { padding: .45rem; }
  label { display: block; margin: .65rem 0; }
  select { max-width: 100%; }
  p { font-size: .875rem; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .8rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); }
  td { font-variant-numeric: tabular-nums; }
  a { color: inherit; }
</style>
