<script lang="ts">
  import { plainNumber } from '../../../lib/utils/units';
  /**
   * The ground motion in one direction: none, a harmonic, a record (a file or typed values), or
   * compatible with the project's INPRES-CIRSOC 103 spectrum; and a scale on it. The record is
   * kept as read and drawn, with its peak.
   */
  import { t, tp } from '../../../lib/i18n';
  import { parseGroundRecord, recordSummary, recordWarnings, RecordError, type AccelUnit, type RecordWarning } from '../../../lib/engine/dynamics/accelerogram';
  import { G } from '../../../lib/engine/dynamics/requests';
  import { groundSeries, withGroundSource, type GroundSource, type GroundSpec } from '../../../lib/engine/dynamics/time-history-spec';
  import { errorText } from '../../../lib/utils/error-text';
  import TimeSeriesChart from './TimeSeriesChart.svelte';

  let { dir, g = $bindable(), dt, nSteps, spectrumSa }: {
    dir: 'x' | 'y' | 'z'; g: GroundSpec; dt: number; nSteps: number; spectrumSa: ((T: number) => number) | null;
  } = $props();

  // The unit a kept record was read in, so the select says what the record is.
  let unit = $state<AccelUnit>(g.record?.unit ?? 'g');
  let columnDt = $state(0.01);
  let typed = $state('');
  let error = $state<string | null>(null);
  let showChart = $state(false);
  /** What was last read, so a unit or dt chosen after the file is read reads it again. */
  let lastRead: { text: string; name: string; asColumn: boolean } | null = null;

  function read(text: string, name: string, asColumn = false) {
    lastRead = { text, name, asColumn };
    error = null;
    try {
      const r = parseGroundRecord(text, unit, asColumn ? dt : columnDt, asColumn ? { asColumn: true } : undefined);
      g = { ...g, source: 'record', record: { ...r, name } };
    } catch (e) {
      error = e instanceof RecordError ? t(`pro.th.record.${e.code}`) : errorText(e, 'Error');
    }
  }
  function reread() {
    if (lastRead) read(lastRead.text, lastRead.name, lastRead.asColumn);
  }

  /** What is likely wrong with the record about to be run — unit, sampling, length. */
  const warnings = $derived(g.source === 'record' && g.record ? recordWarnings(g.record, dt, nSteps) : []);
  function warningText(w: RecordWarning): string {
    switch (w.code) {
      case 'pgaHigh': return tp('pro.th.warn.pgaHigh', { pga: fmt(w.pgaG, 2) });
      case 'pgaLow': return tp('pro.th.warn.pgaLow', { pga: fmt(w.pgaG, 5) });
      case 'undersampled': return tp('pro.th.warn.undersampled', { recordDt: fmt(w.recordDt, 4), kept: fmt(w.keptPct, 0) });
      case 'truncated': return tp('pro.th.warn.truncated', { run: fmt(w.runS, 2), record: fmt(w.recordS, 2) });
    }
  }

  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) read(await f.text(), f.name);
  }

  const series = $derived(showChart ? groundSeries(g, dt, nSteps, spectrumSa) : null);
  const times = $derived(series ? series.map((_, k) => k * dt) : []);
  const fmt = (v: number, d = 3) => plainNumber(v, d);
</script>

<div class="gm" data-testid="th-ground-{dir}">
  <div class="gm-row">
    <span class="gm-dir">{dir.toUpperCase()}</span>
    <select value={g.source} onchange={(e) => (g = withGroundSource(g, e.currentTarget.value as GroundSource))} data-testid="th-src-{dir}">
      <option value="none">{t('pro.th.none')}</option>
      <option value="sine">{t('pro.th.source.sine')}</option>
      <option value="record">{t('pro.th.source.record')}</option>
      <option value="spectrum" disabled={!spectrumSa}>{t('pro.th.source.spectrum')}</option>
    </select>
    {#if g.source !== 'none'}
      <label>× <input type="number" step="0.1" bind:value={g.scale} data-testid="th-scale-{dir}" /></label>
      <button class="gm-link" onclick={() => (showChart = !showChart)}>{showChart ? t('pro.th.hideRecord') : t('pro.th.showRecord')}</button>
    {/if}
  </div>
  {#if g.source === 'sine'}
    <div class="gm-row">
      <label>{t('pro.th.amplitude')} (g) <input type="number" step="0.05" value={g.sine?.ampG ?? 0.3} onchange={(e) => (g = { ...g, sine: { ampG: Number(e.currentTarget.value), freqHz: g.sine?.freqHz ?? 2 } })} /></label>
      <label>{t('pro.th.frequency')} (Hz) <input type="number" step="0.1" value={g.sine?.freqHz ?? 2} onchange={(e) => (g = { ...g, sine: { ampG: g.sine?.ampG ?? 0.3, freqHz: Number(e.currentTarget.value) } })} /></label>
    </div>
  {:else if g.source === 'record'}
    <div class="gm-row">
      <input type="file" accept=".at2,.AT2,.txt,.csv,.dat,.tsv" onchange={onFile} data-testid="th-file-{dir}" />
      <label>{t('pro.th.unit')} <select value={unit} onchange={(e) => { unit = e.currentTarget.value as AccelUnit; reread(); }} data-testid="th-unit-{dir}"><option value="g">g</option><option value="m/s2">m/s²</option><option value="cm/s2">cm/s²</option></select></label>
      <label>{t('pro.th.columnDt')} <input type="number" min="0.0001" step="0.001" value={columnDt} onchange={(e) => { columnDt = Number(e.currentTarget.value); reread(); }} /></label>
    </div>
    <div class="gm-row">
      <textarea rows="1" bind:value={typed} placeholder={t('pro.th.typedInput')}></textarea>
      <button class="gm-link" disabled={!typed.trim()} onclick={() => read(typed, t('pro.th.source.typed'), true)}>{t('pro.th.useTyped')}</button>
    </div>
    {#if error}<p class="gm-error">{error}</p>{/if}
    {#if g.record}
      {@const s = recordSummary(g.record)}
      <p class="gm-hint" data-testid="th-record-{dir}">{g.record.name}: {tp('pro.th.recordSummary', { points: s.points, duration: fmt(s.duration, 2), pga: fmt(s.pga / G) })}</p>
    {/if}
    <!-- What the run will do to the record: a unit that reads wrong, a dt that loses its peak, a
         run shorter than the record. -->
    {#each warnings as w (w.code)}
      <p class="gm-warn" data-testid="th-warning-{dir}-{w.code}">{warningText(w)}</p>
    {/each}
  {:else if g.source === 'spectrum'}
    <div class="gm-row">
      <label>{t('pro.th.duration')} (s) <input type="number" min="1" step="1" value={g.spectrum?.duration ?? 20} onchange={(e) => (g = { ...g, spectrum: { seed: g.spectrum?.seed ?? 1, duration: Number(e.currentTarget.value) } })} /></label>
      <label>{t('pro.th.seed')} <input type="number" min="1" step="1" value={g.spectrum?.seed ?? 1} onchange={(e) => (g = { ...g, spectrum: { duration: g.spectrum?.duration ?? 20, seed: Math.floor(Number(e.currentTarget.value)) } })} data-testid="th-seed-{dir}" /></label>
    </div>
    <p class="gm-hint">{t('pro.th.spectrumHint')}</p>
  {/if}
  {#if series}
    <TimeSeriesChart times={times} values={series} cursor={-1} unitLabel="m/s²" scale={1} label={tp('pro.th.groundChart', { dir: dir.toUpperCase() })} />
  {/if}
</div>

<style>
  .gm { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; border-top: 1px solid var(--st-surface-3); font-size: 0.66rem; color: var(--st-text-2); }
  .gm-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .gm-row input[type='number'] { width: 56px; }
  .gm-dir { font-weight: 700; width: 14px; }
  .gm-link { padding: 1px 6px; font-size: 0.62rem; color: var(--st-interactive); background: transparent; border: 1px solid var(--st-surface-3); border-radius: 3px; cursor: pointer; }
  .gm-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); }
  .gm-error { margin: 0; font-size: 0.62rem; color: var(--st-danger); }
  .gm-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
  textarea { flex: 1; min-width: 120px; font-family: monospace; font-size: 0.62rem; }
</style>
