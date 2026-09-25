<script lang="ts">
  /**
   * Moving loads in PRO: a train of axles along a path of members (the selection, in order), and
   * each member's envelope over every position (`engine/moving-loads-3d.ts`).
   *
   * The envelope is a result of its own: combinations and design do not read it. The lane load,
   * where a code asks for one, is a static uniform load, so it is created here as an ordinary
   * load case on the same members and combines like any other.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { downloadText } from '../../lib/store/file';
  import { toCsv } from '../../lib/engine/result-tables';
  import { buildSolverInput3D } from '../../lib/engine/solver-service';
  import { getPredefinedTrains, type LoadTrain } from '../../lib/engine/moving-loads';
  import {
    buildPath3D, sweepMovingLoad3D, ENVELOPE_COMPONENTS, type MovingEnvelope3D, type EnvelopeComponent,
  } from '../../lib/engine/moving-loads-3d';

  interface Props { disabled?: boolean }
  let { disabled = false }: Props = $props();

  const presets = getPredefinedTrains();
  let preset = $state<number>(0);
  let axles = $state(presets[0]!.axles.map((a) => ({ ...a })));
  let step = $state(0.25);
  /** The code's lane load, kN/m; none by default, since it is the code's number and not ours. */
  let laneQ = $state(0);
  let running = $state(false);
  let progress = $state({ done: 0, total: 0 });
  let controller: AbortController | null = null;
  let result = $state<MovingEnvelope3D | null>(null);
  let error = $state<string | null>(null);
  let sortBy = $state<EnvelopeComponent>('my');

  const pathIds = $derived([...uiStore.selectedElements]);

  function usePreset(i: number) {
    preset = i;
    axles = presets[i]!.axles.map((a) => ({ ...a }));
  }

  async function run() {
    error = null; result = null;
    const base = buildSolverInput3D(modelStore.model as never, false, false);
    if (!base) { error = t('moving.noModel'); return; }
    const path = buildPath3D(base, pathIds);
    if (!path) { error = t('moving.notAChain'); return; }
    const train: LoadTrain = { name: presets[preset]?.name ?? 'train', axles: axles.filter((a) => a.weight !== 0) };
    if (train.axles.length === 0) { error = t('moving.noAxles'); return; }
    running = true;
    controller = new AbortController();
    try {
      result = await sweepMovingLoad3D({ ...base, loads: [] }, path, train, {
        step, signal: controller.signal, onProgress: (done, total) => (progress = { done, total }),
      });
      if (result.positions === 0) { error = t('train.noPositionSolved'); result = null; }
    } catch (e) {
      error = e instanceof DOMException && e.name === 'AbortError' ? t('train.analysisCancelled') : String((e as Error).message ?? e);
    } finally {
      running = false; controller = null;
    }
  }

  /** The uniform lane load, as a load case on the path's members that are near horizontal. */
  function createLane() {
    const ids = pathIds.filter((id) => {
      const e = modelStore.elements.get(id);
      const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
      if (!a || !b) return false;
      const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
      return L > 0 && Math.abs((b.z ?? 0) - (a.z ?? 0)) / L < 0.05;
    });
    if (ids.length === 0) { uiStore.toast(t('moving.laneNoMembers'), 'error'); return; }
    modelStore.batch(() => {
      const c = modelStore.addLoadCase(tp('moving.laneCase', { q: laneQ }), 'L');
      for (const id of ids) modelStore.addDistributedLoad3D(id, 0, 0, -laneQ, -laneQ, undefined, undefined, c);
    });
    uiStore.toast(tp('moving.laneCreated', { n: ids.length }), 'success');
  }

  const rows = $derived.by(() => {
    if (!result) return [];
    const onPath = new Set(result.path.map((p) => p.elementId));
    return [...result.elements].map(([id, env]) => ({ id, env, onPath: onPath.has(id) }))
      .sort((a, b) => Math.max(Math.abs(b.env[sortBy].max.value), Math.abs(b.env[sortBy].min.value))
        - Math.max(Math.abs(a.env[sortBy].max.value), Math.abs(a.env[sortBy].min.value)));
  });
  const LABEL: Record<EnvelopeComponent, string> = { n: 'N', vy: 'Vy', vz: 'Vz', my: 'My', mz: 'Mz', torsion: 'T' };
  const f1 = (v: number) => v.toFixed(1);

  function pick(id: number) {
    uiStore.selectMode = 'elements';
    uiStore.selectElement(id, false);
  }

  function csv() {
    if (!result) return;
    const head = [t('pro.elemLabel'), ...ENVELOPE_COMPONENTS.flatMap((c) => [`${LABEL[c]} max`, `${LABEL[c]} min`])];
    downloadText(toCsv(head, rows.map((r) => [r.id, ...ENVELOPE_COMPONENTS.flatMap((c) => [r.env[c].max.value, r.env[c].min.value])])),
      'moving-load-envelope.csv', 'text/csv;charset=utf-8');
  }
</script>

<div class="ml" data-testid="moving-panel">
  <p class="ml-hint">{t('moving.hint')}</p>
  <div class="ml-row">
    <label>{t('moving.train')}
      <select value={preset} onchange={(e) => usePreset(Number(e.currentTarget.value))} data-testid="moving-preset">
        {#each presets as p, i (i)}<option value={i}>{p.name}</option>{/each}
      </select>
    </label>
    <label>{t('moving.step')} (m) <input type="number" min="0.05" step="0.05" bind:value={step} class="ml-num" /></label>
  </div>
  <table class="ml-axles">
    <thead><tr><th>{t('moving.offset')} (m)</th><th>{t('moving.weight')} (kN)</th><th></th></tr></thead>
    <tbody>
      {#each axles as a, i (i)}
        <tr>
          <td><input type="number" step="0.1" bind:value={a.offset} class="ml-num" /></td>
          <td><input type="number" step="1" bind:value={a.weight} class="ml-num" /></td>
          <td><button class="ml-x" onclick={() => (axles = axles.filter((_, j) => j !== i))} aria-label={t('moving.removeAxle')}>×</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="pk-btn" onclick={() => (axles = [...axles, { offset: (axles.at(-1)?.offset ?? 0) + 1.2, weight: 100 }])}>{t('moving.addAxle')}</button>

  <p class="ml-path" data-testid="moving-path">{pathIds.length > 0 ? tp('moving.path', { n: pathIds.length }) : t('moving.pathEmpty')}</p>
  <div class="ml-row">
    <button class="pk-btn pk-btn-primary" disabled={disabled || running || pathIds.length === 0} onclick={run} data-testid="moving-run">
      {running ? tp('moving.running', { done: progress.done, total: progress.total }) : t('moving.run')}
    </button>
    {#if running}<button class="pk-btn" onclick={() => controller?.abort()}>{t('moving.cancel')}</button>{/if}
  </div>
  <div class="ml-row">
    <label>{t('moving.lane')} (kN/m) <input type="number" min="0" step="0.1" bind:value={laneQ} class="ml-num" /></label>
    <button class="pk-btn" disabled={pathIds.length === 0 || !(laneQ > 0)} onclick={createLane} data-testid="moving-lane">{t('moving.laneCreate')}</button>
  </div>

  {#if error}<p class="pk-warn" data-testid="moving-error">{error}</p>{/if}

  {#if result}
    <div class="ml-row">
      <span class="ml-hint" data-testid="moving-summary">{tp('moving.summary', { positions: result.positions, members: result.path.length })}</span>
      <div class="pk-tabs">
        {#each ENVELOPE_COMPONENTS as c (c)}
          <button class:on={sortBy === c} onclick={() => (sortBy = c)}>{LABEL[c]}</button>
        {/each}
      </div>
      <button class="pk-btn" onclick={csv}>CSV</button>
    </div>
    <div class="ml-wrap">
      <table class="ml-table" data-testid="moving-table">
        <thead><tr><th>{t('pro.elemLabel')}</th><th>{LABEL[sortBy]} max</th><th>x (m)</th><th>{LABEL[sortBy]} min</th><th>x (m)</th></tr></thead>
        <tbody>
          {#each rows.slice(0, 500) as r (r.id)}
            {@const e = r.env[sortBy]}
            <tr onclick={() => pick(r.id)} style="cursor:pointer" class:ml-on={r.onPath}>
              <td class="col-id">{r.id}</td>
              <td class="col-num" title={tp('moving.at', { pos: f1(e.max.position) })}>{f1(e.max.value)}</td>
              <td class="col-num">{e.max.x.toFixed(2)}</td>
              <td class="col-num" title={tp('moving.at', { pos: f1(e.min.position) })}>{f1(e.min.value)}</td>
              <td class="col-num">{e.min.x.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="ml-hint">{t('moving.note')}</p>
  {/if}
</div>

<style>
  .ml { display: flex; flex-direction: column; gap: 6px; font-size: 0.66rem; color: var(--st-text-2); }
  .ml-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ml-hint, .ml-path { margin: 0; font-size: 0.6rem; color: var(--st-text-3); }
  .ml-num { width: 64px; }
  .ml-axles { border-collapse: collapse; align-self: flex-start; }
  .ml-axles th { font-weight: 500; color: var(--st-text-3); padding: 2px 6px; text-align: left; }
  .ml-axles td { padding: 1px 6px; }
  .ml > .pk-btn { align-self: flex-start; }
  .ml-wrap { overflow-x: auto; }
  .ml-table { border-collapse: collapse; font-size: 0.62rem; }
  .ml-table th, .ml-table td { padding: 3px 8px; border-bottom: 1px solid var(--st-hair); text-align: right; }
  .ml-table th:first-child, .ml-table td:first-child { text-align: left; }
  .ml-table tbody tr:hover { background: var(--st-surface-2); }
  .ml-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .ml-on td:first-child { color: var(--st-accent); }
</style>
