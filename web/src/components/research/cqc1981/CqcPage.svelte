<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { benchmark, difference, projection, recompute, type Results } from './benchmark';
  import replay from '../../../../../research/benchmarks/cqc-1981/results/stabileo_results.json';
  import { cqcStrings } from './strings';

  const s = $derived(cqcStrings());
  let results = $state<Results>(replay.results);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let rule = $state<'SRSS' | 'CQC'>('CQC');
  let busy = $state(false);
  let error = $state('');
  let host: HTMLDivElement;
  let request = 0;
  const playback = new Playback(80);
  const view = $derived(projection(results[rule], playback.shown / 30));
  const actions = { goToStep: (step: number) => playback.seek(step), setParams: () => playback.interact(), showTab: () => host.scrollIntoView({ behavior: 'smooth' }) };

  function stop() {
    request += 1;
    busy = false;
    playback.pause();
  }
  function restart() {
    stop();
    results = replay.results;
    source = 'replay';
    error = '';
    playback.seek(0);
    playback.play();
  }
  async function run() {
    stop();
    const id = request;
    busy = true;
    error = '';
    try {
      const next = await recompute();
      if (id !== request) return;
      results = next;
      source = 'live';
      playback.seek(30);
    } catch (e) {
      if (id === request) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (id === request) busy = false;
    }
  }
  onMount(() => {
    playback.setCount(31);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => { request += 1; observer.disconnect(); playback.dispose(); };
  });
</script>

<ExperimentShell paperId="cqc-1981" name={s.title} lead={s.lead} {actions}
  verification={{ reference: { kind: 'none', why: s.referenceNote }, published: { kind: 'none', why: s.limitations[0] } }}
  sourcePath="research/benchmarks/cqc-1981"
>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p><strong>{s.disclaimer}</strong></p>
    <h2>{s.model}</h2><p>{s.description}</p>
    <h2>{s.method}</h2><p>{s.equations}</p>
    <p>ρ(r, ξ) = 8ξ²(1+r)r³ᐟ² / [(1−r²)² + 4ξ²r(1+r)²], r = ω₂/ω₁.</p>
    <p>{s.explanation}</p>
    <p><button onclick={() => { rule = 'SRSS'; playback.seek(30); host.scrollIntoView({ block: 'center' }); }}>{s.rule}: {s.srss}</button> <button onclick={() => { rule = 'CQC'; playback.seek(30); host.scrollIntoView({ block: 'center' }); }}>{s.rule}: {s.cqc}</button></p>
    <p>{s.tolerance}</p>
    <h2>{s.notYet}</h2>
    <ul>{#each s.limitations as item}<li>{item}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="cqc-app" bind:this={host}>
      <p class="source" data-testid="cqc-source">{s[source]}</p>
      <div class="controls">
        <button onclick={run} disabled={busy}>{busy ? s.running : s.run}</button>
        <button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
        <label>{s.rule}<select bind:value={rule} onchange={() => playback.interact()}><option value="SRSS">{s.srss}</option><option value="CQC">{s.cqc}</option></select></label>
      </div>
      {#if error}<p role="alert">{s.error}: {error}</p>{/if}
      <StabileoViewer {...view} cellSize={2} range={{ min: 0, max: 12 }} title={s.viewer} unit="mm" deformScale={40} height="18rem" editorButton={false} showMesh={false} oninteract={() => playback.interact()} />
      <label class="slider">{s.step}<input type="range" min="0" max="30" value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} /></label>
      <p class="note">{s.viewNote}</p>
      <h2>{s.comparison}</h2>
      <table data-testid="cqc-results"><thead><tr><th>{s.rule}</th><th>{s.reference}</th><th>{s.result}</th><th>{s.delta}</th></tr></thead>
        <tbody>{#each ['SRSS', 'CQC'] as name}{@const key = name as 'SRSS' | 'CQC'}<tr><th>{key}</th><td>{num(benchmark.reference[key], { dp: 6 })}</td><td data-testid={'result-' + key}>{num(results[key].baseShear, { dp: 6 })}</td><td>{num(difference(results[key].baseShear, benchmark.reference[key]), { dp: 8 })}</td></tr>{/each}</tbody>
      </table>
      <p>{s.modes}: {results.modal.modes.map(m => num(m.frequency, { dp: 6 })).join(' / ')}<br />{s.correlation}: {num(benchmark.reference.rho, { dp: 6 })}<br />{s.deficit}: {num(difference(results.SRSS.baseShear, results.CQC.baseShear), { dp: 2 })}</p>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .cqc-app { max-height: 100%; overflow: auto; padding: .5rem; border: 1px solid var(--hair); border-radius: .5rem; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  button, select { min-height: 44px; padding: .4rem .6rem; background: var(--lp-ink); color: var(--fg); border: 1px solid var(--hair); border-radius: 4px; }
  label { display: flex; align-items: center; gap: .5rem; }
  .slider { display: block; }
  input { width: 100%; min-height: 32px; }
  .note, .source { font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; font-size: clamp(.65rem, 1.8vw, .9rem); }
  td, th { padding: .45rem .15rem; text-align: right; border-bottom: 1px solid var(--hair); overflow-wrap: anywhere; }
  th:first-child { text-align: left; }
  h2 { font-size: 1.1rem; }
  p { overflow-wrap: anywhere; }
</style>
