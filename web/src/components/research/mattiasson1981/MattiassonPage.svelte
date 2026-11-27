<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { holdPrerender } from '../../../lib/prerender-hold';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { Playback } from '../shell/playback.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import Curves from './Curves.svelte';
  import { cases, meshes, refined, runCases, viewerData, issue, evidence, tolerance, meshErrorCeilings, axialExtensionBound, type Result } from './cases';
  import validation from '../../../../../research/benchmarks/mattiasson-elastica/VALIDATION.json';
  import publishedRows from '../../../../../research/benchmarks/mattiasson-elastica/reference-results/published_comparison.json';
  import { describeCase } from './text';
  import { editorURL } from './editor';
  import { strings } from './i18n';

  const playback = new Playback(350);
  let rows = $state<Result[]>([]);
  let busy = $state(false);
  let failure = $state('');
  let cancelled = false;
  let tab = $state('viewer');
  let pane: HTMLDivElement;
  let moment = $state(false);
  let elements = $state(16);
  let solvedElements = $state(16);
  const forceCases = cases.filter(c => c.kind === 'force');
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const forceCase = $derived(forceCases[playback.shown]);
  const current = $derived(refined(moment ? cases[cases.length - 1] : forceCase, solvedElements));
  const text = $derived(describeCase(s, publicI18n.locale, { tolerance, meshErrorCeilings, axialExtensionBound, momentArea: cases[cases.length - 1].input.sections['1'].a, first: forceCases[0].parameter, last: forceCases.at(-1)!.parameter }));
  const rowNames = $derived(Object.fromEntries(publishedRows.checks.map(r => [r.id, s.rowName.replace('{q}', fmt(Number(r.id.slice(1).split('-')[0]))).replace('{component}', r.id.endsWith('-u') ? s.rowU : s.rowV)])));
  const result = $derived(rows.find(r => r.id === current.id));
  const view = $derived(viewerData(current, result));
  const checks = cases.filter(c => c.reference);
  const passed = $derived(rows.filter(r => checks.some(c => c.id === r.id) && r.pass).length);
  const fmt = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 7 }).format(v);
  async function run() {
    if (busy) return;
    busy = true; failure = ''; rows = []; cancelled = false; solvedElements = elements;
    playback.setCount(forceCases.length);
    try {
      await runCases(r => { rows = [...rows, r]; }, () => cancelled, solvedElements);
      if (cancelled) failure = s.interrupted;
      else {
        playback.setCount(forceCases.length);
        playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 700px)').matches });
      }
    } catch { failure = s.solveError; }
    finally { if (cancelled) playback.setCount(rows.filter(r => forceCases.some(c => c.id === r.id)).length); busy = false; }
  }
  function stop() { cancelled = true; playback.pause(); }
  function open() { playback.interact(); window.open(editorURL(current, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href, s), '_blank', 'noopener'); }
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
    void holdPrerender(run());
    return () => { cancelled = true; playback.dispose(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointerdown', interaction, true); window.removeEventListener('keydown', interaction, true); window.removeEventListener('wheel', interaction, true); };
  });
</script>

<ExperimentShell compactHeader introInArticle paperId="mattiasson-elastica" name={s.title}
  lead={s.lead}
  sourcePath="engine/tests/benchmarks"
  actions={{ goToStep: i => playback.seek(i), setParams: p => { if (!busy && typeof p.elements === 'number' && meshes.includes(p.elements)) { elements = p.elements; tab = 'results'; playback.interact(); void run(); } }, showTab: t => { tab = t; } }}
  referenceLabel={s.validationLabel}
  checks={{ passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length }}
  comparison={publishedRows.checks} comparisonNames={rowNames}>
  {#snippet article()}
    <h2>{s.modelHeading}</h2>
    <p>{text.modelDescription}</p>
    <p>{text.solverDescription}</p>
    <p>{s.referenceWhy}</p>
    <p>{s.publishedWhy}</p>
    <p>{s.meshLive} {#each meshes as n, i (n)}{#if i} · {/if}<ExperimentLink params={{ elements: n }}>{s.meshRun.replace('{n}', String(n))}</ExperimentLink>{/each}</p>
    <h2>{s.moment}</h2>
    <p>{text.momentDescription}</p>
    <p><a href={evidence}>{s.evidence}</a></p>
  {/snippet}
  {#snippet app()}
    <div class="benchmark-pane" bind:this={pane}>
      <PaneTabs tabs={[{ id: 'viewer', label: s.viewer }, { id: 'results', label: s.results }]} bind:active={tab} />
      <div id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <ScalarFieldViewer plane="elevation" {...view} cellSize={2} deformScale={1} showMesh={true} title={s.magnitude} unit="m" height="max(280px, min(23rem, 48svh))" onOpenEditor={open} />
        <label><input type="checkbox" bind:checked={moment} /> {s.moment}</label>
        <label>{s.select}: {fmt(forceCase.parameter)} <input aria-label={s.select} aria-valuetext={`${s.force}: PL²/EI = ${fmt(forceCase.parameter)}`} type="range" min="0" max={forceCases.length - 1} value={playback.shown} disabled={moment} oninput={e => playback.seek(Number(e.currentTarget.value))} /></label>
        <p data-testid="mattiasson-step">{moment ? s.moment : `${s.force}: PL²/EI = ${fmt(current.parameter)}`}</p>
        {#if result?.failure}<p role="alert">{s[result.failure as 'incomplete' | 'invalid' | 'solveError']}</p>{:else if !result}<p>{s.compute}</p>{/if}
        <button onclick={open}>{s.open}</button><p>{s.handoff}</p>
      </div>
      <div id="rs-panel-results" role="tabpanel" aria-labelledby="rs-tab-results" hidden={tab !== 'results'}>
        <Curves description={s.chartDescription} {rows} referenceLabel={s.reference} locale={publicI18n.locale} />
        <div class="table-scroll" id="checks"><table><thead><tr><th>PL²/EI</th><th>{s.reference} u/L, v/L</th><th>Stabileo u/L, v/L</th><th>{s.error} %</th><th></th></tr></thead><tbody>
          {#each cases as c}
            {@const r = rows.find(r => r.id === c.id)}
            <tr data-testid={c.id}><th>{c.kind === 'moment' ? s.moment : fmt(c.parameter)}</th><td>{c.reference ? c.reference.map(fmt).join(', ') : '—'}</td><td>{fmt(r?.u)}, {fmt(r?.v)}</td><td>{r?.errors ? r.errors.map(e => fmt(e * 100)).join(', ') : '—'}</td><td>{#if !r}{s.compute}{:else if r.pass === true}{s.pass}{:else if r.pass === false}<a href={issue}>{s.fail}</a>{#if r.failure}<p>{s[r.failure as 'incomplete' | 'invalid' | 'solveError']}</p>{/if}{:else}{s.noReference}{/if}</td></tr>
          {/each}
        </tbody></table></div>
      </div>
      <p role="status" data-testid="mattiasson-summary">{#if busy}{s.running}{:else}{s.summary}: {passed}/{checks.length}{/if}</p>
      <p>{s.complete}: {rows.filter(r => !r.failure).length}/{cases.length} · {s.fail}: {rows.filter(r => r.pass === false).length}</p>
      <label>{s.elements} <select aria-label={s.elements} value={elements} disabled={busy} onchange={e => { elements = Number(e.currentTarget.value); playback.interact(); void run(); }}>{#each meshes as n (n)}<option value={n}>{s.meshRun.replace('{n}', String(n))}</option>{/each}</select></label>
      <button onclick={() => { playback.interact(); void run(); }} disabled={busy}>{s.run}</button>
      <button onclick={stop}>{s.stop}</button>
      <button onclick={() => { moment = false; playback.play(); }} disabled={busy || rows.length === 0}>{s.play}</button>
      <button onclick={() => { moment = false; playback.seek(0); playback.play(); }} disabled={busy || rows.length === 0}>{s.restart}</button>
      {#if failure}<p role="alert">{failure}</p>{/if}
    </div>
  {/snippet}
</ExperimentShell>
<style>
  .benchmark-pane { height: 100%; overflow: auto; }
  button, input, select { font: inherit; } select { min-height: 44px; } button { padding: .45rem; min-height: 44px; min-width: 44px; }
  label { display: flex; align-items: center; gap: .5rem; min-height: 44px; flex-wrap: wrap; margin: .65rem 0; } p { font-size: .875rem; }
  input[type="range"] { min-height: 44px; min-width: 44px; max-width: 100%; }
  input[type="checkbox"] { width: 44px; height: 44px; }
  :global(.rs-shell code), :global(.rs-citebox) { overflow-wrap: anywhere; }
  .table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: .8rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--hair); } a { color: inherit; }
</style>
