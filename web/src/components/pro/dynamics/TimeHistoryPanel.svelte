<script lang="ts">
  /**
   * Time history: the ground motion, the run, and the response walked step by step.
   *
   * Three ways to give the ground motion, all read in g unless stated otherwise:
   *   · a harmonic, amplitude and frequency;
   *   · a record — a PEER `.AT2`, a two-column time/acceleration table, or a single column at a
   *     stated dt — resampled onto the analysis time step, since the engine samples by step index;
   *   · a typed list, one value per step.
   *
   * After a run the whole response is kept, not just its peaks: a slider moves the model through
   * it, and a chart shows one node's displacement with the instant marked.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { resultsStore } from '../../../lib/store';
  import { solveTimeHistory3D } from '../../../lib/engine/wasm-solver';
  import { errorText } from '../../../lib/utils/error-text';
  import {
    G, sineAccelerogram, timeHistoryFields, peakBaseShear, HHT_ALPHA_RANGE,
  } from '../../../lib/engine/dynamics/requests';
  import {
    parseGroundRecord, resample, recordSummary, recordWarnings, RecordError,
    type AccelUnit, type GroundRecord, type RecordWarning,
  } from '../../../lib/engine/dynamics/accelerogram';
  import { timeHistoryView, type TimeHistoryResult3D } from '../../../lib/store/time-history-view.svelte';
  import TimeSeriesChart from './TimeSeriesChart.svelte';

  let {
    buildDynamicInput, disabled = false, onError,
  }: {
    buildDynamicInput: () => { input: any; densities: Map<number, number> };
    disabled?: boolean;
    onError: (message: string | null) => void;
  } = $props();

  let dt = $state(0.01);
  let nSteps = $state(200);
  let dir = $state<'X' | 'Y' | 'Z'>('X');
  let damping = $state(0.05);
  let method = $state<'newmark' | 'hht'>('newmark');
  /** HHT-α's α, only sent when the method is HHT. −0.1 is the usual numerical-damping choice. */
  let alpha = $state(-0.1);

  let source = $state<'sine' | 'record' | 'typed'>('sine');
  let sineAmp = $state(0.3);
  let sineFreq = $state(2.0);
  let typed = $state('');
  let typedUnit = $state<AccelUnit>('g');

  let record = $state<GroundRecord | null>(null);
  let recordName = $state('');
  let recordUnit = $state<AccelUnit>('g');
  let columnDt = $state(0.01);
  let recordText = '';
  let recordError = $state<string | null>(null);

  let running = $state(false);

  const result = $derived(timeHistoryView.result);
  const stale = $derived(!!result && timeHistoryView.modelVersion !== modelStore.modelVersion);

  function readRecord() {
    recordError = null;
    record = null;
    if (!recordText) return;
    try {
      record = parseGroundRecord(recordText, recordUnit, columnDt);
    } catch (e) {
      recordError = e instanceof RecordError ? t(`pro.th.record.${e.code}`) : errorText(e, 'Error');
    }
  }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    recordName = f.name;
    recordText = await f.text();
    readRecord();
  }

  /** Run the whole record: enough steps at the current dt to reach its last sample. */
  function fitStepsToRecord() {
    if (!record) return;
    nSteps = Math.max(1, Math.ceil(recordSummary(record).duration / dt) + 1);
  }

  /** Typed values, one per step starting at t = 0: a column at the analysis dt. */
  const typedRecord = $derived.by((): GroundRecord | null => {
    if (source !== 'typed' || !typed.trim()) return null;
    try { return parseGroundRecord(typed, typedUnit, dt, { asColumn: true }); } catch { return null; }
  });

  /** What is likely wrong with the motion about to be run — unit, sampling, length. */
  const warnings = $derived.by((): RecordWarning[] => {
    const r = source === 'record' ? record : source === 'typed' ? typedRecord : null;
    return r ? recordWarnings(r, dt, nSteps) : [];
  });

  function warningText(w: RecordWarning): string {
    switch (w.code) {
      case 'pgaHigh': return tp('pro.th.warn.pgaHigh', { pga: fmt(w.pgaG, 2) });
      case 'pgaLow': return tp('pro.th.warn.pgaLow', { pga: fmt(w.pgaG, 5) });
      case 'undersampled': return tp('pro.th.warn.undersampled', { recordDt: fmt(w.recordDt, 4), kept: fmt(w.keptPct, 0) });
      case 'truncated': return tp('pro.th.warn.truncated', { run: fmt(w.runS, 2), record: fmt(w.recordS, 2) });
    }
  }

  function groundAccel(): number[] {
    if (source === 'sine') return sineAccelerogram(sineAmp, sineFreq, dt, nSteps);
    if (source === 'typed') return typedRecord ? resample(typedRecord, dt, nSteps) : [];
    return record ? resample(record, dt, nSteps) : [];
  }

  function run() {
    onError(null);
    running = true;
    try {
      const accel = groundAccel();
      if (accel.length === 0) { onError(t('pro.needAccelData')); return; }
      const { input, densities } = buildDynamicInput();
      const res = solveTimeHistory3D({
        solver: input,
        ...timeHistoryFields({ densities, dt, nSteps, direction: dir, groundAccel: accel, dampingXi: damping, method, alpha }),
      }) as TimeHistoryResult3D;
      timeHistoryView.set(res, modelStore.modelVersion);
      component = dir === 'Z' ? 'uz' : dir === 'Y' ? 'uy' : 'ux';
      nodeId = peakNode(res);
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
  const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
</script>

<div class="adv-panel" data-testid="time-history">
  <div class="adv-form">
    <label class="adv-label">dt (s): <input type="number" class="adv-num" bind:value={dt} min={0.001} max={1} step={0.001} /></label>
    <label class="adv-label">{t('pro.th.steps')}: <input type="number" class="adv-num adv-num-wide" bind:value={nSteps} min={1} max={20000} /></label>
    <label class="adv-label">{t('pro.th.direction')}: <select class="adv-sel" bind:value={dir}><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option></select></label>
    <label class="adv-label">&#x03BE;: <input type="number" class="adv-num" bind:value={damping} min={0} max={1} step={0.01} /></label>
    <label class="adv-label">{t('pro.th.method')}: <select class="adv-sel" bind:value={method}><option value="newmark">Newmark</option><option value="hht">HHT-&#x03B1;</option></select></label>
    {#if method === 'hht'}
      <label class="adv-label">&#x03B1;: <input type="number" class="adv-num" bind:value={alpha} min={HHT_ALPHA_RANGE.min} max={HHT_ALPHA_RANGE.max} step={0.01} data-testid="th-alpha" /></label>
    {/if}
  </div>
  <div class="adv-hint">{t('pro.th.dampingNote')}</div>

  <div class="adv-form">
    <label class="adv-label">{t('pro.th.source')}:
      <select class="adv-sel" bind:value={source} data-testid="th-source">
        <option value="sine">{t('pro.th.source.sine')}</option>
        <option value="record">{t('pro.th.source.record')}</option>
        <option value="typed">{t('pro.th.source.typed')}</option>
      </select>
    </label>
  </div>

  {#if source === 'sine'}
    <div class="adv-form">
      <label class="adv-label">{t('pro.th.amplitude')} (g): <input type="number" class="adv-num" bind:value={sineAmp} min={0.01} step={0.05} /></label>
      <label class="adv-label">{t('pro.th.frequency')} (Hz): <input type="number" class="adv-num" bind:value={sineFreq} min={0.1} step={0.1} /></label>
    </div>
  {:else if source === 'record'}
    <div class="adv-form">
      <input type="file" class="adv-file" accept=".at2,.AT2,.txt,.csv,.dat,.tsv" onchange={onFile} data-testid="th-record-file" />
      <label class="adv-label">{t('pro.th.unit')}:
        <select class="adv-sel" bind:value={recordUnit} onchange={readRecord}>
          <option value="g">g</option><option value="m/s2">m/s²</option><option value="cm/s2">cm/s² (gal)</option>
        </select>
      </label>
      <label class="adv-label">{t('pro.th.columnDt')} (s): <input type="number" class="adv-num" bind:value={columnDt} min={0.0001} step={0.001} onchange={readRecord} /></label>
    </div>
    <div class="adv-hint">{t('pro.th.recordFormats')}</div>
    {#if recordError}<div class="adv-error" role="alert">{recordError}</div>{/if}
    {#if record}
      {@const s = recordSummary(record)}
      <div class="adv-inline" data-testid="th-record-summary">
        {recordName} — {t(`pro.th.format.${record.format}`)}, {record.unit === 'm/s2' ? 'm/s²' : record.unit === 'cm/s2' ? 'cm/s²' : 'g'} —
        {tp('pro.th.recordSummary', { points: s.points, duration: fmt(s.duration), pga: fmt(s.pga / G, 3) })}
        <button class="adv-link" onclick={fitStepsToRecord}>{t('pro.th.fitSteps')}</button>
      </div>
    {/if}
  {:else}
    <div class="adv-accel-area">
      <div class="adv-form">
        <label class="adv-label">{t('pro.th.typedInput')}</label>
        <label class="adv-label">{t('pro.th.unit')}:
          <select class="adv-sel" bind:value={typedUnit}>
            <option value="g">g</option><option value="m/s2">m/s²</option><option value="cm/s2">cm/s² (gal)</option>
          </select>
        </label>
      </div>
      <textarea class="adv-textarea" bind:value={typed} rows="2" placeholder="0.1, 0.25, 0.4, 0.3, -0.1, ..."></textarea>
      {#if typedRecord}
        <div class="adv-inline">{tp('pro.th.typedSummary', { points: typedRecord.times.length, steps: nSteps + 1 })}</div>
      {/if}
    </div>
  {/if}
  {#each warnings as w (w.code)}
    <div class="adv-warn" data-testid="th-warning-{w.code}">{warningText(w)}</div>
  {/each}

  <button class="adv-run-btn" onclick={run} disabled={disabled || running}>{t('pro.run')}</button>

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
