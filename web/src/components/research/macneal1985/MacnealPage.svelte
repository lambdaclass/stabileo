<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import { cases, category, counts, nativeOnly, runCases, tolerance, unitOf, verdict, viewerData, type Result } from './cases';
  import { editorURL } from './editor';
  import { caseLabel, nativeReason, pageLocale, strings } from './i18n';

  let rows = $state<Result[]>([]);
  let busy = $state(false);
  let failure = $state('');
  let selected = $state(cases[6].id);
  let tab = $state('viewer');
  let scale = $state(1);
  const lang = $derived(pageLocale(publicI18n.locale));
  const s = $derived(strings[lang]);
  const current = $derived(cases.find(c => c.id === selected)!);
  const result = $derived(rows.find(r => r.id === selected));
  const view = $derived(viewerData(current, result));
  const tally = $derived(counts(rows));
  const groups = $derived([
    { key: 'shell', label: s.shells, items: cases.filter(c => category(c) === 'shell') },
    { key: 'frame', label: s.frames, items: cases.filter(c => category(c) === 'frame') },
  ]);
  const fmt = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 7 }).format(v);
  const pct = (e: number | null | undefined) => e == null ? '—' : 100 * e < 1e-4 ? `< ${fmt(1e-4)}` : new Intl.NumberFormat(publicI18n.locale, { maximumFractionDigits: 4 }).format(100 * e);
  const tallyText = (t: { passed: number; total: number }) => s.tally.replace('{passed}', String(t.passed)).replace('{total}', String(t.total)).replace('{tol}', fmt(100 * tolerance));
  const ISSUE = 'https://github.com/lambdaclass/stabileo/issues/798';
  async function run() {
    if (busy) return;
    busy = true; failure = ''; rows = [];
    try { rows = await runCases(); }
    catch (e) { failure = String(e); }
    finally { busy = false; }
  }
  function open() { window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href, s), '_blank', 'noopener'); }
  async function inspect(id: string) {
    selected = id;
    tab = 'viewer';
    await tick();
    document.getElementById('rs-tab-viewer')?.focus();
  }
  onMount(() => { void run(); });
</script>

<ExperimentShell paperId="macneal-harder-1985" name={s.title}
  lead={s.lead}
  contentLang={lang}
  compactHeader
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: () => {}, setParams: () => {}, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'none', why: s.referenceWhy }, published: { kind: 'none', why: s.publishedWhy } }}>
  {#snippet article()}
    <div class="mh-article" {lang}>
      <h2>{s.testedHeading}</h2>
      <p>{s.testedDescription}</p>
      <p>{s.modelDescription}</p>
      <h2>{s.definitionHeading}</h2>
      <p><a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/macneal_harder.json">{s.definitionLink}</a>{s.definitionDescription}</p>
      <h2>{s.accuracyHeading}</h2>
      <p>{s.accuracyDescription}</p>
      <h2 id="limitations">{s.limitationsHeading}</h2>
      <p>{s.limitationsBefore}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/KNOWN_ISSUES.md#mh-mitc4-distortion">{s.ledgerLink}</a>{s.limitationsMiddle}<a href={ISSUE}>{s.issueLink}</a>{s.limitationsAfter}</p>
      <h2 id="mh-provenance">{s.provenanceHeading}</h2>
      <p>{s.referenceProvenance}</p>
      <h2>{s.native}</h2>
      <ul>{#each nativeOnly as c (c.id)}<li><strong>{caseLabel(c.id, s)}</strong>: {nativeReason(c.id, s)} <code>{c.nativeTest}</code></li>{/each}</ul>
    </div>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane" {lang}>
      <p role="status" class="mh-summary" data-testid="benchmark-summary">
        {#if busy}{s.running}{:else if rows.length === cases.length}<span data-testid="summary-shell">{s.shells}: {tallyText(tally.shell)}</span><span class="mh-sep" aria-hidden="true">{" · "}</span><span data-testid="summary-frame">{s.frames}: {tallyText(tally.frame)}</span>{:else}{s.computing}{/if}
      </p>
      {#if failure}<p role="alert">{s.failed}: {failure}</p>{/if}
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <ScalarFieldViewer {...view} cellSize={current.dimension === 2 ? 2 : 4} deformScale={scale} showMesh={true} title={s.field} ariaLabel={`${caseLabel(current.id, s)} · ${s.field} (m)`} unit="m" height="20rem" editorButton={false} />
        <label class="mh-control">{s.select}<select bind:value={selected}>{#each cases as c (c.id)}<option value={c.id}>{caseLabel(c.id, s)}</option>{/each}</select></label>
        <label class="mh-control">{s.scale}<span class="mh-range"><input type="range" min="0" max="20" step="0.5" bind:value={scale} /><output>{scale}</output></span></label>
        <div class="mh-actions">
          <button onclick={run} disabled={busy}>{s.run}</button>
          <button onclick={open}>{s.open}</button>
        </div>
        <p>{s.projection}</p>
        <p>{category(current) === 'frame' ? s.frameSource : s.shellSource}</p>
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="table-scroll" id="checks" role="region" aria-label={s.tableRegion} tabindex="0">
          <table>
            <caption>{s.caption}</caption>
            <thead><tr><th scope="col">{s.select}</th><th scope="col">{s.quantity}</th><th scope="col">{s.reference}</th><th scope="col">{"Stabileo"}</th><th scope="col">{s.errorPct}</th><th scope="col">{s.verdict}</th></tr></thead>
            {#each groups as g (g.key)}
              <tbody data-testid="group-{g.key}">
                <tr><th scope="colgroup" colspan="6" class="mh-group">{g.label}</th></tr>
                {#each g.items as c (c.id)}
                  {@const r = rows.find(r => r.id === c.id)}
                  {@const v = r ? verdict(c, r) : null}
                  <tr data-testid={c.id}>
                    <th scope="row"><button class="mh-case" onclick={() => inspect(c.id)}>{caseLabel(c.id, s)}</button></th>
                    <td data-testid="quantity">{c.measurement.component} ({unitOf(c)})</td>
                    <td data-testid="reference">{fmt(c.reference)}</td>
                    <td data-testid="computed">{fmt(r?.value)}</td>
                    <td data-testid="error">{pct(r?.error)}</td>
                    <td data-testid="verdict" data-verdict={v ?? 'pending'}>
                      {#if !v}{s.computing}
                      {:else if v === 'pass'}{s.pass}
                      {:else if v === 'marginal'}<span title={s.marginalTitle}>{s.marginal}</span>
                      {:else if v === 'documented' && 'knownIssue' in c}<a class="mh-link" href={c.knownIssue}>{s.documented}</a>
                      {:else if v === 'mismatch'}<strong>{s.mismatch}</strong>
                      {:else}<strong>{s.engineError}</strong><span class="mh-failure">{r?.failure}</span>{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
      </div>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  button, select, input { font: inherit; }
  button, select { min-height: 44px; padding: 0 .75rem; }
  .mh-summary { margin: 0 0 .5rem; }
  @media (max-width: 40rem) { .mh-summary span { display: block; } .mh-summary .mh-sep { display: none; } }
  .mh-control { display: block; margin: .65rem 0; }
  .mh-control select { display: block; width: 100%; max-width: 100%; margin-top: .25rem; }
  .mh-range { display: flex; align-items: center; gap: .75rem; }
  .mh-range input { flex: 1; min-width: 0; height: 44px; margin: 0; }
  .mh-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .65rem 0; }
  p { font-size: .875rem; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .8125rem; }
  caption { text-align: left; font-size: .8125rem; padding: .5rem 0; color: var(--fg-2); }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); vertical-align: top; }
  td { font-variant-numeric: tabular-nums; }
  .mh-group { font-weight: 600; padding-top: 1rem; }
  .mh-case { display: inline-flex; align-items: center; text-align: left; background: none; border: 0; color: inherit; text-decoration: underline; padding: 0; cursor: pointer; }
  .mh-link { display: inline-flex; align-items: center; min-height: 44px; }
  .mh-failure { display: block; overflow-wrap: anywhere; }
  a { color: inherit; }
  .mh-article code { overflow-wrap: anywhere; word-break: break-word; }
  .benchmark-pane :global(.rs-tabs button) { min-height: 44px; }
  .benchmark-pane :global(:is(.sfv-status, .sfv-status *, .shell-legend, .shell-legend *, .cam-item, .cam-item *)) { font-size: 12px !important; }
  .benchmark-pane :global(.cam-item) { min-height: 44px; }
</style>
