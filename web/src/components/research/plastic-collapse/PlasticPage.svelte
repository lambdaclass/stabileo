<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { researchLocale } from '../i18n';
  import { ps } from './i18n';
  import { run, viewer, cumulativeStep, mechanisms, type Result } from './case';
  import replay from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';
  const s = $derived(ps());
  let result = $state.raw<Result | null>(replay.result as Result | null);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let error = $state('');
  let running = $state(false);
  let generation = 0;
  let host: HTMLDivElement;
  const playback = new Playback(900, 2000);
  const frame = $derived(cumulativeStep(result?.steps ?? [], playback.shown));
  const data = $derived(viewer(frame));
  const nf = (n: number) => new Intl.NumberFormat(researchLocale(), { maximumFractionDigits: 6, minimumFractionDigits: 6 }).format(n);
  function stop() { generation++; running = false; playback.pause(); }
  async function recompute() {
    stop();
    const token = generation;
    running = true;
    error = '';
    try {
      const next = await run();
      if (token !== generation) return;
      result = next;
      source = 'live';
      playback.setCount(next.steps.length);
      playback.seek(next.steps.length - 1);
    } catch (e) {
      if (token === generation) error = String(e);
    } finally { if (token === generation) running = false; }
  }
  function restart() {
    stop();
    if (result) { source = source === 'replay' ? 'replay' : 'cached'; playback.seek(0); playback.play(); }
  }
  onMount(() => {
    playback.setCount(result?.steps.length ?? 0);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => { generation++; observer.disconnect(); playback.dispose(); };
  });
</script>

<ExperimentShell paperId="horne-1979" citationAuthors="M. R. Horne" name={s.title} lead={s.lead}
  sourcePath="research/benchmarks/plastic-collapse"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p><strong>{s.note}</strong></p>
    <p>{s.model}</p>
    <p>{s.method} <a href="#portal" onclick={() => playback.seek((result?.steps.length ?? 1) - 1)}>{s.combined} →</a></p>
    <ul>
      <li>{s.beam}: λ = 8Mp / (VL) = {nf(mechanisms().beam)}</li>
      <li>{s.sway}: λ = 4Mp / (Hh) = {nf(mechanisms().sway)}</li>
      <li>{s.combined}: λ = 6Mp / (Hh + VL/2) = {nf(mechanisms().combined)}</li>
    </ul>
    <p>{s.provenance} <a href="https://shop.elsevier.com/books/plastic-theory-of-structures/horne/978-0-08-022737-5">{s.publisher}</a>.</p>
    <h2>{s.notYet}</h2>
    <ul>{#each s.limits as limit}<li>{limit}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div id="portal" bind:this={host} class="portal">
      <p data-testid="source">{s[source]}</p>
      <StabileoViewer {...data} cellSize={2} lineWidth={5} title={s.displacement} unit="m"
        deformScale={10} showMesh={false} editorButton={false} height="clamp(15rem, 35dvh, 22rem)"
        oninteract={() => playback.interact()} />
      <div class="controls">
        <button onclick={recompute} disabled={running}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={restart}>{s.restart}</button>
      </div>
      {#if error}<p role="alert">{s.error}: {error}</p>{/if}
      {#if result}
        <label>{s.step} {playback.shown + 1}/{result.steps.length}
          <input aria-label={s.step} type="range" min="0" max={result.steps.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
        </label>
        <p>λ = {nf(frame?.loadFactor ?? 0)} · ×10</p>
        {#if !result.isMechanism || result.warnings?.length}<p role="alert">{s.warning}: {result.warnings?.join('; ')}</p>{/if}
      {:else}<p>{s.pending}</p>{/if}
      <h2>{s.comparison}</h2>
      <p data-testid="collapse-factor">Stabileo λ = {result ? nf(result.collapseFactor) : '—'}</p>
      <table>
        <thead><tr><th>{s.mechanism}</th><th>{s.reference}</th><th>{s.difference}</th></tr></thead>
        <tbody>{#each Object.entries(mechanisms()) as [key, value]}
          <tr><th>{s[key as 'beam' | 'sway' | 'combined']}</th><td>{nf(value)}</td><td>{result ? nf(result.collapseFactor - value) : '—'}</td></tr>
        {/each}</tbody>
      </table>
      <p class="small">{s.explanation}</p>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .portal { color: var(--fg); max-height: 100%; overflow-y: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin: .75rem 0; }
  button { padding: .65rem .8rem; border: 1px solid var(--hair); border-radius: 4px; background: var(--lp-ink); color: var(--fg); cursor: pointer; }
  input { width: 100%; }
  table { width: 100%; border-collapse: collapse; font-size: clamp(.7rem, 2vw, .9rem); table-layout: fixed; }
  th, td { padding: .4rem .15rem; text-align: right; border-bottom: 1px solid var(--hair); overflow-wrap: anywhere; }
  th:first-child { text-align: left; }
  h2 { font-size: 1.1rem; margin-top: 1rem; }
  .small { font-size: .85rem; }
</style>
