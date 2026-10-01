<script lang="ts">
  import { plainNumber } from '../../../lib/utils/units';
  /**
   * Time history: the ground motion, the run, and the response walked step by step.
   *
   * The run is project data (`engine/dynamics/time-history-spec.ts`): the ground in X, Y and Z at
   * once, each a harmonic, a record (a PEER `.AT2`, a two-column table, a single column, or typed
   * values) or spectrum-compatible with the project's INPRES-CIRSOC 103 spectrum, each with a
   * scale; and nodal forces that vary in time. It is saved with the project as it is edited.
   *
   * After a run the whole response is kept, not just its peaks: a slider moves the model through
   * it, and a chart shows one node's displacement with the instant marked.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { resultsStore } from '../../../lib/store';
  import { solveTimeHistory3D } from '../../../lib/engine/wasm-solver';
  import { errorText } from '../../../lib/utils/error-text';
  import { peakBaseShear, HHT_ALPHA_RANGE } from '../../../lib/engine/dynamics/requests';
  import { recordSummary } from '../../../lib/engine/dynamics/accelerogram';
  import { timeHistoryView, type TimeHistoryResult3D } from '../../../lib/store/time-history-view.svelte';
  import TimeSeriesChart from './TimeSeriesChart.svelte';
  import GroundMotionRow from './GroundMotionRow.svelte';
  import { defaultTimeHistory, timeHistoryInput, type TimeHistorySpec } from '../../../lib/engine/dynamics/time-history-spec';
  import { onDestroy, untrack } from 'svelte';

  let {
    buildDynamicInput, disabled = false, onError, spectrumSa = null,
  }: {
    buildDynamicInput: () => { input: any; densities: Map<number, number> };
    disabled?: boolean;
    onError: (message: string | null) => void;
    /** The project's INPRES-CIRSOC 103 elastic spectrum, g, or null when the project has none. */
    spectrumSa?: ((T: number) => number) | null;
  } = $props();

  /*
   * The run as project data: read from the model, written back (coalesced) as it is edited.
   *
   * Only an edit writes. Opening the panel on a project with no run used to store the default and
   * push an undo step. And the draft follows the project: when the model is replaced under it
   * (a file, a tab, an undo) the draft is re-read and a pending write is dropped, so one project's
   * run is never written into another.
   */
  const stored = () => modelStore.dynamics?.timeHistory ?? defaultTimeHistory();
  let spec = $state<TimeHistorySpec>(JSON.parse(JSON.stringify(stored())));
  let epoch = modelStore.loadEpoch;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const storedSpec = () => JSON.stringify(stored());
  let observed = storedSpec();
  let pending: string | null = null;
  function cancelSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    pending = null;
  }
  function save(snapshot: string) {
    cancelSave();
    observed = snapshot;
    if (snapshot !== storedSpec()) modelStore.setDynamics({ timeHistory: JSON.parse(snapshot) });
  }
  // Undo, redo and project loading replace the stored spec without editing this component; a new
  // project (a new loadEpoch) re-reads the draft even when its run reads the same.
  $effect(() => {
    const snapshot = storedSpec();
    const e = modelStore.loadEpoch;
    untrack(() => {
      if (snapshot === observed && e === epoch) return;
      cancelSave();
      observed = snapshot;
      epoch = e;
      spec = JSON.parse(snapshot);
    });
  });
  $effect(() => {
    const snapshot = JSON.stringify(spec);
    untrack(() => {
      cancelSave();
      if (snapshot === observed) return;
      pending = snapshot;
      const at = epoch;
      // A write meant for this project never lands in the next one.
      saveTimer = setTimeout(() => { if (modelStore.loadEpoch === at) save(snapshot); else cancelSave(); }, 600);
    });
  });
  onDestroy(() => {
    // Flush only an unsaved edit of the same project state. Never overwrite an undo/load
    // that happened just before destruction, before the synchronisation effect could run.
    const snapshot = pending;
    cancelSave();
    if (snapshot !== null && storedSpec() === observed && modelStore.loadEpoch === epoch) save(snapshot);
  });

  let running = $state(false);
  const result = $derived(timeHistoryView.source === 'timeHistory' ? timeHistoryView.result : null);
  const stale = $derived(!!result && timeHistoryView.modelVersion !== modelStore.modelVersion);

  /** Run a record through: enough steps at the current dt to reach its last sample. */
  function fitStepsToRecords() {
    const ds = (['x', 'y', 'z'] as const).map((d) => spec.ground[d]).filter((g) => g.source === 'record' && g.record).map((g) => recordSummary(g.record!).duration);
    if (ds.length) spec.nSteps = Math.max(1, Math.ceil(Math.max(...ds) / spec.dt) + 1);
  }

  function addForce() {
    spec.forces = [...spec.forces, { nodeId: [...modelStore.nodes.keys()][0] ?? 1, dir: 'x', kind: 'sine', amplitude: 10, freqHz: 1 }];
  }

  function run() {
    onError(null);
    running = true;
    try {
      const { input, densities } = buildDynamicInput();
      const fields = timeHistoryInput(spec, densities, spectrumSa);
      const res = solveTimeHistory3D({ solver: input, ...fields }) as TimeHistoryResult3D;
      timeHistoryView.set(res, modelStore.modelVersion);
      const main = (['x', 'y', 'z'] as const).find((d) => spec.ground[d].source !== 'none') ?? 'x';
      component = main === 'z' ? 'uz' : main === 'y' ? 'uy' : 'ux';
      nodeId = peakNode(res);
      save(JSON.stringify(spec));
    } catch (e) {
      onError(`${t('pro.th.title')}: ${errorText(e, 'Error')}`);
    } finally {
      running = false;
    }
  }

  // ── Response viewer ─────────────────────────────────────────────

  let component = $state<'ux' | 'uy' | 'uz'>('ux');
  let nodeId = $state<number | null>(null);

  function peakNode(r: TimeHistoryResult3D): number | null {
    let best: number | null = null, m = -1;
    for (const p of r.peakDisplacements) {
      const v = Math.hypot(p.ux, p.uy, p.uz);
      if (v > m) { m = v; best = p.nodeId; }
    }
    return best;
  }

  const history = $derived(nodeId != null ? timeHistoryView.historyOf(nodeId) : undefined);
  const nodeOptions = $derived(result ? result.nodeHistories.map((h) => h.nodeId) : []);

  function show(v: boolean) {
    timeHistoryView.setShown(v);
    // The frame is drawn through the deformed view; ask for it so it is not hidden by a diagram.
    if (v) resultsStore.diagramType = 'deformed';
  }

  const peakDisp = $derived(result?.peakDisplacements?.length
    ? Math.max(...result.peakDisplacements.map((d) => Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0))) : null);
  const fmt = (v: number, d = 2) => (Number.isFinite(v) ? plainNumber(v, d) : '—');
</script>

<div class="adv-panel" data-testid="time-history">
  <div class="adv-form">
    <label class="adv-label">dt (s): <input type="number" class="adv-num" bind:value={spec.dt} min={0.001} max={1} step={0.001} /></label>
    <label class="adv-label">{t('pro.th.steps')}: <input type="number" class="adv-num adv-num-wide" bind:value={spec.nSteps} min={1} max={20000} data-testid="th-steps" /></label>
    <label class="adv-label">&#x03BE;: <input type="number" class="adv-num" bind:value={spec.damping} min={0} max={1} step={0.01} /></label>
    <label class="adv-label">{t('pro.th.method')}: <select class="adv-sel" bind:value={spec.method}><option value="newmark">Newmark</option><option value="hht">HHT-&#x03B1;</option></select></label>
    {#if spec.method === 'hht'}
      <label class="adv-label">&#x03B1;: <input type="number" class="adv-num" bind:value={spec.alpha} min={HHT_ALPHA_RANGE.min} max={HHT_ALPHA_RANGE.max} step={0.01} data-testid="th-alpha" /></label>
    {/if}
    <button class="adv-link" onclick={fitStepsToRecords}>{t('pro.th.fitSteps')}</button>
  </div>
  <div class="adv-hint">{t('pro.th.dampingNote')}</div>
  <div class="adv-hint">{t('pro.th.savedWithProject')}</div>

  {#each ['x', 'y', 'z'] as const as d (d)}
    <GroundMotionRow dir={d} bind:g={spec.ground[d]} dt={spec.dt} nSteps={spec.nSteps} {spectrumSa} />
  {/each}

  <div class="adv-form">
    <span class="adv-label">{t('pro.th.forces')}</span>
    <button class="adv-link" onclick={addForce} data-testid="th-add-force">+</button>
  </div>
  {#each spec.forces as f, i (i)}
    <div class="adv-form" data-testid="th-force-{i}">
      <label class="adv-label">{t('pro.th.node')} <input type="number" class="adv-num" bind:value={f.nodeId} min={1} step={1} /></label>
      <select class="adv-sel" bind:value={f.dir}><option value="x">Fx</option><option value="y">Fy</option><option value="z">Fz</option></select>
      <select class="adv-sel" bind:value={f.kind}><option value="sine">{t('pro.th.force.sine')}</option><option value="step">{t('pro.th.force.step')}</option></select>
      <label class="adv-label">kN <input type="number" class="adv-num" bind:value={f.amplitude} step={1} /></label>
      {#if f.kind === 'sine'}<label class="adv-label">Hz <input type="number" class="adv-num" bind:value={f.freqHz} step={0.1} /></label>
      {:else}<label class="adv-label">{t('pro.th.from')} (s) <input type="number" class="adv-num" bind:value={f.from} step={0.1} /></label>{/if}
      <button class="adv-link" onclick={() => (spec.forces = spec.forces.filter((_, k) => k !== i))}>×</button>
    </div>
  {/each}

  <button class="adv-run-btn" onclick={run} disabled={disabled || running} data-testid="th-run">{t('pro.run')}</button>

  {#if result}
    <div class="adv-inline" data-testid="th-summary">
      {#if peakDisp != null}δmax = {fmt(peakDisp * 1000)} mm{/if}
      {#if result.peakReactions?.length} — {t('pro.thBaseShearAtPeak')} = {fmt(peakBaseShear(result.peakReactions))} kN{/if}
      — {result.nSteps} {t('pro.steps')} ({result.method})
    </div>
    {#if stale}
      <div class="adv-hint">{t('pro.th.stale')}</div>
    {:else}
      <div class="th-viewer">
        <div class="adv-form">
          <label class="adv-check">
            <input type="checkbox" checked={timeHistoryView.shown} onchange={(e) => show((e.target as HTMLInputElement).checked)} data-testid="th-show" />
            {t('pro.th.showInModel')}
          </label>
          <button class="adv-link" onclick={() => (timeHistoryView.playing ? timeHistoryView.stop() : (show(true), timeHistoryView.play()))} data-testid="th-play">
            {timeHistoryView.playing ? t('pro.th.pause') : t('pro.th.play')}
          </button>
          <span class="adv-inline">t = {timeHistoryView.time.toFixed(2)} s</span>
        </div>
        <input
          type="range" class="th-slider" min="0" max={timeHistoryView.lastStep} step="1"
          value={timeHistoryView.step}
          oninput={(e) => { timeHistoryView.setStep(Number((e.target as HTMLInputElement).value)); if (!timeHistoryView.shown) show(true); }}
          aria-label={t('pro.th.step')}
          data-testid="th-slider"
        />
        <div class="adv-form">
          <label class="adv-label">{t('pro.th.node')}:
            <select class="adv-sel" bind:value={nodeId}>
              {#each nodeOptions as id (id)}<option value={id}>{id}</option>{/each}
            </select>
          </label>
          <label class="adv-label">{t('pro.th.component')}:
            <select class="adv-sel" bind:value={component}>
              <option value="ux">ux</option><option value="uy">uy</option><option value="uz">uz</option>
            </select>
          </label>
        </div>
        {#if history}
          <TimeSeriesChart
            times={result.timeSteps}
            values={history[component]}
            cursor={timeHistoryView.step}
            unitLabel="mm" scale={1000}
            label={tp('pro.th.chartLabel', { node: nodeId ?? '—', component })}
            onscrub={(i) => { timeHistoryView.setStep(i); if (!timeHistoryView.shown) show(true); }}
          />
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .adv-panel { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
  .adv-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .adv-label { font-size: 0.68rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .adv-num {
    width: 55px; padding: 3px 5px; font-size: 0.68rem; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); text-align: right;
  }
  .adv-num-wide { width: 70px; }
  .adv-sel {
    padding: 3px 5px; font-size: 0.68rem; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); cursor: pointer;
  }
  .adv-check { font-size: 0.7rem; color: var(--st-text-2); display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .adv-hint { font-size: 0.6rem; color: var(--st-text-3); font-style: italic; }
  .adv-inline { font-size: 0.68rem; color: var(--st-text-2); padding: 2px 0; font-family: monospace; }
  .adv-error { font-size: 0.64rem; color: var(--st-danger); }
  .adv-warn { font-size: 0.62rem; color: var(--st-warn); }
  .adv-accel-area { display: flex; flex-direction: column; gap: 2px; }
  .adv-textarea {
    width: 100%; padding: 4px 6px; font-size: 0.64rem; font-family: monospace; background: var(--st-surface-2);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); resize: vertical; min-height: 32px;
  }
  .adv-textarea::placeholder { color: var(--st-text-3); }
  .adv-file { font-size: 0.64rem; color: var(--st-text-2); max-width: 100%; }
  .adv-link {
    padding: 2px 6px; font-size: 0.62rem; color: var(--st-interactive);
    background: transparent; border: 1px solid var(--st-surface-3); border-radius: 3px; cursor: pointer;
  }
  .adv-run-btn {
    align-self: flex-start; padding: 5px 14px; font-size: 0.72rem; font-weight: 600; color: var(--st-text);
    background: linear-gradient(135deg, var(--st-surface-3), var(--st-hair-strong));
    border: 1px solid var(--st-value); border-radius: 4px; cursor: pointer; white-space: nowrap;
  }
  .adv-run-btn:hover { background: linear-gradient(135deg, var(--st-info), var(--st-surface-3)); }
  .adv-run-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .th-viewer { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px solid var(--st-surface-3); }
  .th-slider { width: 100%; accent-color: var(--st-value); }
</style>
