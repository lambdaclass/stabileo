<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { fill, plasticLocale, ps } from './i18n';
  import { run, viewer, cumulativeStep, mechanisms, events, checks, cornerMoment, fixed, portal, place, DEFORM_SCALE, type Result } from './case';
  import replay from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';
  const s = $derived(ps());
  const locale = $derived(plasticLocale());
  let result = $state.raw<Result | null>(replay.result as Result | null);
  let source = $state<'replay' | 'live'>('replay');
  let error = $state('');
  let running = $state(false);
  let generation = 0;
  let host: HTMLDivElement;
  const playback = new Playback(900, 2000);
  const frame = $derived(cumulativeStep(result?.steps ?? [], playback.shown));
  const data = $derived(viewer(frame));
  const rows = $derived(result ? events(result) : []);
  const list = $derived(result ? checks(result) : []);
  const passed = $derived(list.filter(c => c.passed).length);
  const nf = (n: number, dp = 6) => fixed(n, locale, dp);
  const params = $derived({ span: nf(portal.span, 0), height: nf(portal.height, 0), mp: nf(portal.mp, 0), horizontal: nf(portal.horizontal, 0), vertical: nf(portal.vertical, 0) });
  function stop() { generation++; running = false; playback.pause(); }
  async function recompute(onLoad = false) {
    if (!onLoad) stop();
    const token = ++generation;
    running = true;
    error = '';
    try {
      const next = await run();
      if (token !== generation) return;
      result = next;
      source = 'live';
      playback.setCount(next.steps.length);
      if (!onLoad) playback.seek(next.steps.length - 1);
    } catch (e) {
      if (token === generation) error = e instanceof Error ? e.message : String(e);
    } finally { if (token === generation) running = false; }
  }
  function restart() {
    stop();
    if (result) { playback.seek(0); playback.play(); }
  }
  onMount(() => {
    playback.setCount(result?.steps.length ?? 0);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    void recompute(true);
    return () => { generation++; observer.disconnect(); playback.dispose(); };
  });
</script>

<ExperimentShell paperId="horne-1979" citationAuthors="M. R. Horne" name={s.title} lead={s.lead} {locale} citationRelation={s.citation}
  verification={{ reference: { kind: 'checks', passed, total: list.length, href: '#checks' }, published: { kind: 'none', why: s.publishedNote } }}
  referenceLabel={s.referenceLabel}
  sourcePath="research/benchmarks/plastic-collapse"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p data-testid="model">{fill(s.model, params)}</p>
    <p>{s.method} <a href="#portal" onclick={() => playback.seek((result?.steps.length ?? 1) - 1)}>{s.combined} →</a></p>
    <ul data-testid="bounds">
      <li>{s.beam}: λ = 8Mp / (VL) = {nf(mechanisms().beam)}</li>
      <li>{s.sway}: λ = 4Mp / (Hh) = {nf(mechanisms().sway)}</li>
      <li>{s.combined}: λ = 6Mp / (Hh + VL/2) = {nf(mechanisms().combined)}</li>
    </ul>
    <p>{s.provenance} <a href="https://shop.elsevier.com/books/plastic-theory-of-structures/horne/978-0-08-022737-5">{s.publisher}</a> {s.provenanceEnd}</p>
    <h2 id="checks">{s.checksHeading}</h2>
    <ul class="checks">{#each list as check (check.id)}
      <li data-testid="check" data-passed={check.passed}><span aria-hidden="true">{check.passed ? '✓' : '✗'}</span> {fill(s.checks[check.id], { corner: nf(cornerMoment(result?.collapseFactor ?? NaN)) })} <strong>{check.passed ? s.passed : s.failed}</strong></li>
    {/each}</ul>
    <h2>{s.scope}</h2>
    <ul>{#each s.limits as limit}<li>{limit}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div id="portal" bind:this={host} class="portal">
      <StabileoViewer {...data} cellSize={2} lineWidth={5} title={s.displacement} unit="m" lengthUnit="m" showAxes={false}
        deformScale={DEFORM_SCALE} showMesh={false} editorButton={false} height="clamp(15rem, 35dvh, 22rem)"
        oninteract={() => playback.interact()} />
      <p class="small">{fill(s.amplified, { scale: DEFORM_SCALE })} · {s.planeNote}</p>
      <p data-testid="source" role="status" aria-live="polite">{running ? s.running : s[source]}</p>
      <div class="controls">
        <button onclick={() => recompute()} disabled={running}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={restart}>{s.restart}</button>
      </div>
      {#if error}<p role="alert">{s.error}. {s.errorDetail}: <code>{error}</code></p>{/if}
      {#if result}
        <label>{s.step} {playback.shown + 1}/{result.steps.length}
          <input aria-label={s.step} type="range" min="0" max={result.steps.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
        </label>
        <p data-testid="frame-lambda">λ = {nf(frame?.loadFactor ?? 0)}</p>
        {#if !result.isMechanism || result.warnings?.length}<p role="alert">{s.warning}: {result.warnings?.join('; ')}</p>{/if}
      {:else}<p>{s.pending}</p>{/if}
      <h2>{s.comparison}</h2>
      <p data-testid="collapse-factor">Stabileo λ = {result ? nf(result.collapseFactor) : '—'}</p>
      <table>
        <thead><tr><th scope="col">{s.mechanism}</th><th scope="col">{s.reference}</th><th scope="col">{s.difference}</th></tr></thead>
        <tbody>{#each Object.entries(mechanisms()) as [key, value]}
          <tr data-testid="bound-row"><th scope="row">{s[key as 'beam' | 'sway' | 'combined']}</th><td>{nf(value)}</td><td>{result ? nf(result.collapseFactor - value) : '—'}</td></tr>
        {/each}</tbody>
      </table>
      <p class="small">{s.explanation}</p>
      <h2>{s.eventsHeading}</h2>
      <table>
        <thead><tr><th scope="col">{s.event}</th><th scope="col">{s.location}</th><th scope="col">λ</th><th scope="col">{s.moment}</th></tr></thead>
        <tbody>{#each rows as row (row.index)}{#each row.hinges as hinge}
          <tr data-testid="event-row" class:current={row.index === playback.shown}><th scope="row">{row.index + 1}</th><td>{s.places[hinge.place]}</td><td>{nf(row.loadFactor)}</td><td>{nf(hinge.momentY, 3)}</td></tr>
        {/each}{/each}</tbody>
      </table>
      {#if frame}
        <h2>{fill(s.nodalHeading, { event: playback.shown + 1 })}</h2>
        <table>
          <thead><tr><th scope="col">{s.node}</th><th scope="col">ux</th><th scope="col">uz</th></tr></thead>
          <tbody>{#each frame.results.displacements as d (d.nodeId)}
            <tr data-testid="node-row"><th scope="row">{d.nodeId} · {s.places[place(d.nodeId)]}</th><td>{nf(d.ux)}</td><td>{nf(d.uz)}</td></tr>
          {/each}</tbody>
        </table>
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .portal { color: var(--fg); max-height: 100%; overflow-y: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin: .75rem 0; }
  button { min-height: 44px; min-width: 44px; padding: .65rem .8rem; border: 1px solid var(--hair); border-radius: 4px; background: var(--lp-ink); color: var(--fg); cursor: pointer; }
  label { display: block; }
  input { width: 100%; min-height: 44px; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: clamp(.75rem, 2vw, .9rem); table-layout: fixed; }
  th, td { padding: .4rem .15rem; text-align: right; border-bottom: 1px solid var(--hair); overflow-wrap: anywhere; }
  th:first-child { text-align: left; }
  tr.current { background: color-mix(in srgb, var(--fg) 8%, transparent); }
  h2 { font-size: 1.1rem; margin-top: 1rem; }
  .small { font-size: .85rem; }
  .checks { list-style: none; padding-left: 0; }
  code { overflow-wrap: anywhere; }
  @media (max-height: 30rem) and (orientation: landscape) {
    :global(.rs-shell:has(#portal)) { padding-top: 4.25rem; }
    :global(.rs-shell:has(#portal) .rs-shell-head) { margin-bottom: 0.5rem; }
    :global(.rs-shell:has(#portal) .rs-shell-head h1) { font-size: 1.5rem; max-width: none; margin: 0.15rem 0 0.25rem; }
  }
</style>
