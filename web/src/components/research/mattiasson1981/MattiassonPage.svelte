<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import { Playback } from '../shell/playback.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import Curves from './Curves.svelte';
  import { cases, nativeOnly, runCases, viewerData, issue, tolerance, type Result } from './cases';
  import { editorURL } from './editor';
  import { strings } from './i18n';
  import { rs } from '../i18n';

  const playback = new Playback(350);
  let rows = $state<Result[]>([]);
  let busy = $state(false);
  let failure = $state('');
  let cancelled = false;
  let tab = $state('viewer');
  let pane: HTMLDivElement;
  let moment = $state(false);
  const forceCases = cases.filter(c => c.kind === 'force');
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const current = $derived(moment ? cases[cases.length - 1] : forceCases[playback.shown]);
  const result = $derived(rows.find(r => r.id === current.id));
  const view = $derived(viewerData(current, result));
  const checks = cases.filter(c => c.reference);
  const passed = $derived(rows.filter(r => checks.some(c => c.id === r.id) && r.pass).length);
  const fmt = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 7 }).format(v);
  async function run() {
    if (busy) return;
    busy = true; failure = ''; rows = []; cancelled = false;
    try {
      await runCases(r => { rows = [...rows, r]; }, () => cancelled);
      if (cancelled) failure = s.interrupted;
      else {
        playback.setCount(forceCases.length);
        playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 700px)').matches });
      }
    } catch (e) { failure = String(e); }
    finally { busy = false; }
  }
  function stop() { cancelled = true; playback.pause(); }
  function open() { playback.interact(); window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href), '_blank', 'noopener'); }
  onMount(() => {
    const interaction = () => playback.interact();
    window.addEventListener('pointerdown', interaction, true);
    window.addEventListener('keydown', interaction, true);
    window.addEventListener('wheel', interaction, { capture: true, passive: true });
    let inView = true;
    const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; playback.setVisible(inView && !document.hidden); });
    observer.observe(pane);
    const visibility = () => playback.setVisible(inView && !document.hidden);
    document.addEventListener('visibilitychange', visibility);
    void run();
    return () => { cancelled = true; playback.dispose(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointerdown', interaction, true); window.removeEventListener('keydown', interaction, true); window.removeEventListener('wheel', interaction, true); };
  });
</script>

<ExperimentShell paperId="mattiasson-elastica" name={s.title}
  lead={s.lead}
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: t => { tab = t; } }}
  verification={{ reference: { kind: 'none', why: s.referenceWhy }, published: { kind: 'none', why: s.publishedWhy } }}>
  {#snippet article()}
    <h2>{s.modelHeading}</h2>
    <p>{s.modelDescription}</p>
    <p>{s.loadPathBeforeAPI}<code>{s.solverAPI}</code>{s.loadPathAfterAPI}</p>
    <h2>{s.referencesHeading}</h2>
    <p>{s.referencesBeforeLink}<a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/BENCHMARK_REFERENCES.md#mattiasson-elastica--cantilever-large-deflection">{s.referencesLink}</a>{s.referencesAfterLink}</p>
    <p>{s.accuracyBefore}{fmt(tolerance * 100)}{s.accuracyAfter}</p>
    <h2>{s.momentHeading}</h2>
    <p>{s.momentDescription}</p>
    <h2>{s.sharedCasesHeading}</h2>
    <p><a href="https://github.com/lambdaclass/stabileo/blob/main/engine/tests/benchmarks/mattiasson_elastica.json">{s.sharedCasesLink}</a>{s.sharedCasesDescription}</p>
    <p><a href={issue}>{s.findingsLink}</a>{s.findingsDescription}</p>
    <h2>{s.native}</h2>
    <ul>{#each nativeOnly as c}<li><code>{c.nativeTest}</code>: {c.reason}</li>{/each}</ul>
    <p>{s.nativeAvailability}</p>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane" bind:this={pane}>
      <p role="status" data-testid="mattiasson-summary">{#if busy}{s.running}{:else}{s.summary}: {passed}/{checks.length}{/if}</p>
      <p><strong>{rs().disclaimer}</strong></p>
      <p>{s.warning}</p>
      <p>{s.complete}: {rows.filter(r => !r.failure).length}/{cases.length} · {s.fail}: {rows.filter(r => r.failure).length}</p>
      <p>{busy ? s.live : s.cached}</p>
      <button onclick={() => { playback.interact(); void run(); }} disabled={busy}>{s.run}</button>
      <button onclick={stop}>{s.stop}</button>
      <button onclick={() => { moment = false; playback.play(); }} disabled={busy || rows.length !== cases.length}>{s.play}</button>
      <button onclick={() => { moment = false; playback.seek(0); playback.play(); }} disabled={busy || rows.length !== cases.length}>{s.restart}</button>
      {#if failure}<p role="alert">{failure}</p>{/if}
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <label><input type="checkbox" bind:checked={moment} /> {s.moment}</label>
        <label>{s.select}: {fmt(current.parameter)} <input aria-label={s.select} type="range" min="0" max={forceCases.length - 1} value={playback.shown} disabled={moment} oninput={e => playback.seek(Number(e.currentTarget.value))} /></label>
        <p data-testid="mattiasson-step">{moment ? s.moment : s.force}: {current.id}</p>
        <ScalarFieldViewer {...view} cellSize={2} deformScale={1} showMesh={true} title={moment ? s.moment : s.force} unit="m" height="23rem" onOpenEditor={open} />
        {#if result?.failure}<p role="alert">{result.failure}</p>{:else if !result}<p>{s.pending}</p>{/if}
        <button onclick={open}>{s.open}</button><p>{s.handoff}</p>
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <Curves {rows} referenceLabel={s.reference} locale={publicI18n.locale} />
        <div class="table-scroll" id="checks"><table><thead><tr><th>PL²/EI</th><th>{s.reference} u/L, v/L</th><th>Stabileo u/L, v/L</th><th>{s.error} %</th><th></th></tr></thead><tbody>
          {#each cases as c}
            {@const r = rows.find(r => r.id === c.id)}
            <tr data-testid={c.id}><th>{c.kind === 'moment' ? s.moment : fmt(c.parameter)}</th><td>{c.reference ? c.reference.map(fmt).join(', ') : '—'}</td><td>{fmt(r?.u)}, {fmt(r?.v)}</td><td>{r?.errors ? r.errors.map(e => fmt(e * 100)).join(', ') : '—'}</td><td>{#if !r}{s.pending}{:else if r.pass === true}{s.pass}{:else if r.pass === false}<a href={issue}>{s.fail}</a>{#if r.failure}<p>{r.failure}</p>{/if}{:else}{s.noReference}{/if}</td></tr>
          {/each}
        </tbody></table></div>
      </div>
    </div>
  {/snippet}
</ExperimentShell>
<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  button, input { font: inherit; } button { padding: .45rem; }
  label { display: block; margin: .65rem 0; } p { font-size: .875rem; }
  .table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: .8rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); } a { color: inherit; }
</style>
