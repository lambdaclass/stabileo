<script lang="ts">
  /**
   * Moving loads in PRO: a train of axles along a path of members (the selection, in order), and
   * each member's envelope over every position (`engine/moving-loads-3d.ts`).
   *
   * The envelope is a result of its own: combinations and design do not read it. For them the
   * vehicle is written as static cases, one per position, alternatives of one group
   * (`store/moving-cases.ts`). The lane load, where a code asks for one, is a static uniform load,
   * created here as an ordinary load case on the same members. A vehicle has its spacing range,
   * its two wheel lines and its dynamic factor (`engine/vehicles.ts`), and is saved as a file.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import QuantityInput from './loads/QuantityInput.svelte';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import { downloadText } from '../../lib/store/file';
  import { errorText } from '../../lib/utils/error-text';
  import { toCsv } from '../../lib/engine/result-tables';
  import { buildSolverInput3D } from '../../lib/engine/solver-service';
  import { withoutSettlement } from '../../lib/engine/settlement-case';
  import { isVariableMember } from '../../lib/section/variable';
  import { getPredefinedTrains } from '../../lib/engine/moving-loads';
  import {
    buildPath3D, sweepTrains3D, ENVELOPE_COMPONENTS, type MovingEnvelope3D, type EnvelopeComponent,
  } from '../../lib/engine/moving-loads-3d';
  import { AASHTO_VEHICLES, vehicleTrains, vehicleToJson, vehicleFromJson, type Vehicle } from '../../lib/engine/vehicles';
  import { addPositionCases, MAX_POSITION_CASES } from '../../lib/store/moving-cases';

  interface Props { disabled?: boolean }
  let { disabled = false }: Props = $props();

  // The app's trains and the AASHTO catalog (`engine/vehicles.ts`).
  const presets: Vehicle[] = [...getPredefinedTrains(), ...AASHTO_VEHICLES];
  let preset = $state<number>(0);
  let axles = $state(presets[0]!.axles.map((a) => ({ ...a })));
  let name = $state(presets[0]!.name);
  let gauge = $state<number | null>(presets[0]!.gauge ?? null);
  let dynamicFactor = $state(1);
  let variable = $state<{ axle: number; min: number; max: number } | null>(presets[0]!.variable ?? null);
  let spacingStep = $state(0.5);
  /** The members of the second wheel line, picked apart from the path. */
  let path2Ids = $state<number[]>([]);
  let caseStep = $state(1);
  const vehicle = (): Vehicle => ({
    name, axles: axles.filter((a) => a.weight !== 0),
    ...(gauge ? { gauge } : {}), ...(dynamicFactor !== 1 ? { dynamicFactor } : {}), ...(variable ? { variable } : {}),
  });
  function load(v: Vehicle) {
    axles = v.axles.map((a) => ({ ...a })); name = v.name; gauge = v.gauge ?? null;
    dynamicFactor = v.dynamicFactor ?? 1; variable = v.variable ? { ...v.variable } : null;
  }
  function saveFile() {
    const v = vehicle();
    downloadText(vehicleToJson(v), `${v.name.replace(/[^\w.-]+/g, '_') || 'vehicle'}.json`, 'application/json');
  }
  async function openFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const v = vehicleFromJson(await f.text());
    if (!v) { error = t('moving.badVehicleFile'); return; }
    error = null; load(v);
  }
  function positionCases() {
    const trains = vehicleTrains(vehicle(), spacingStep);
    const r = addPositionCases(trains[0]!, pathIds, path2Ids, caseStep);
    if ('error' in r) { error = r.error; return; }
    error = null;
    uiStore.toast(tp('moving.casesCreated', { n: r.cases }), 'success');
  }
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
    load(presets[i]!);
  }

  async function run() {
    error = null; result = null;
    // The path names the model's members; one of variable section is cut into pieces for the solve.
    if ([...modelStore.elements.values()].some((e) => isVariableMember(modelStore.sections, e))) { error = t('advanced.variableUnsupported'); return; }
    // The train alone: a support settlement is not part of a moving-load envelope, and solving
    // every position on the settled supports mixed its forces into every peak. The project's
    // axis convention, as the other solves use it.
    let base: ReturnType<typeof buildSolverInput3D>;
    try {
      base = buildSolverInput3D({ ...modelStore.model, supports: withoutSettlement(modelStore.model.supports) } as never, false, uiStore.axisConvention3D === 'leftHand');
    } catch (e) {
      // What the builder refuses (a semi-rigid end it cannot model) is said, not thrown past the panel.
      error = errorText(e, 'Error'); return;
    }
    if (!base) { error = t('moving.noModel'); return; }
    const path = buildPath3D(base, pathIds);
    if (!path) { error = t('moving.notAChain'); return; }
    const path2 = path2Ids.length ? buildPath3D(base, path2Ids) : null;
    if (path2Ids.length && !path2) { error = t('moving.notAChain'); return; }
    const trains = vehicleTrains(vehicle(), spacingStep);
    if (trains[0]!.axles.length === 0) { error = t('moving.noAxles'); return; }
    running = true;
    controller = new AbortController();
    try {
      result = await sweepTrains3D({ ...base, loads: [] }, path, trains, {
        step, path2, signal: controller.signal, onProgress: (done, total) => (progress = { done, total }),
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
    // SI, each column with its unit.
    const UNIT: Record<EnvelopeComponent, string> = { n: 'kN', vy: 'kN', vz: 'kN', my: 'kN·m', mz: 'kN·m', torsion: 'kN·m' };
    const head = [t('pro.elemLabel'), ...ENVELOPE_COMPONENTS.flatMap((c) => [`${LABEL[c]} max (${UNIT[c]})`, `${LABEL[c]} min (${UNIT[c]})`])];
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
    <label>{t('moving.step')} <QuantityInput bind:value={step} quantity="length" min={0.05} cls="ml-num" /></label>
  </div>
  <table class="ml-axles">
    <thead><tr><th>{t('moving.offset')} ({unitQ('length')})</th><th>{t('moving.weight')} ({unitQ('force')})</th><th></th></tr></thead>
    <tbody>
      {#each axles as a, i (i)}
        <tr>
          <td><QuantityInput bind:value={a.offset} quantity="length" showUnit={false} cls="ml-num" /></td>
          <td><QuantityInput bind:value={a.weight} quantity="force" showUnit={false} cls="ml-num" /></td>
          <td><button class="ml-x" onclick={() => (axles = axles.filter((_, j) => j !== i))} aria-label={t('moving.removeAxle')}>×</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="pk-btn" onclick={() => (axles = [...axles, { offset: (axles.at(-1)?.offset ?? 0) + 1.2, weight: 100 }])}>{t('moving.addAxle')}</button>
  <div class="ml-row">
    <label>{t('moving.vehicleName')} <input type="text" bind:value={name} class="ml-name" data-testid="moving-name" /></label>
    <label>{t('moving.dynamicFactor')} <input type="number" min="0.5" step="0.01" bind:value={dynamicFactor} class="ml-num" data-testid="moving-dyn" /></label>
    <label>{t('moving.gauge')} <QuantityInput value={gauge} nullable quantity="length" min={0} onchange={(v) => (gauge = v !== null && v > 0 ? v : null)} cls="ml-num" testid="moving-gauge" /></label>
  </div>
  <div class="ml-row">
    <label><input type="checkbox" checked={!!variable} onchange={(e) => (variable = e.currentTarget.checked ? { axle: Math.min(axles.length - 1, 2) || 1, min: 4.3, max: 9 } : null)} data-testid="moving-var" /> {t('moving.variable')}</label>
    {#if variable}
      <label>{t('moving.beforeAxle')} <input type="number" min="1" max={axles.length - 1} step="1" bind:value={variable.axle} class="ml-num" /></label>
      <label>min <QuantityInput bind:value={variable.min} quantity="length" min={0} cls="ml-num" /></label>
      <label>max <QuantityInput bind:value={variable.max} quantity="length" min={0} cls="ml-num" /></label>
      <label>{t('moving.spacingStep')} <QuantityInput bind:value={spacingStep} quantity="length" min={0.05} cls="ml-num" /></label>
    {/if}
  </div>
  <div class="ml-row">
    <button class="pk-btn" onclick={saveFile} data-testid="moving-save">{t('moving.saveVehicle')}</button>
    <label class="pk-btn">{t('moving.openVehicle')} <input type="file" accept="application/json,.json" onchange={openFile} hidden data-testid="moving-open" /></label>
  </div>
  <p class="ml-hint">{t('moving.vehicleHint')}</p>
  <div class="ml-row">
    <button class="pk-btn" disabled={pathIds.length === 0} onclick={() => (path2Ids = [...pathIds])} data-testid="moving-path2">{t('moving.useAsLine2')}</button>
    {#if path2Ids.length}<span class="ml-hint" data-testid="moving-path2-n">{tp('moving.line2', { n: path2Ids.length })}</span>
      <button class="ml-x" onclick={() => (path2Ids = [])} aria-label={t('loadTables.delete')}>×</button>{/if}
  </div>

  <p class="ml-path" data-testid="moving-path">{pathIds.length > 0 ? tp('moving.path', { n: pathIds.length }) : t('moving.pathEmpty')}</p>
  <div class="ml-row">
    <button class="pk-btn pk-btn-primary" disabled={disabled || running || pathIds.length === 0} onclick={run} data-testid="moving-run">
      {running ? tp('moving.running', { done: progress.done, total: progress.total }) : t('moving.run')}
    </button>
    {#if running}<button class="pk-btn" onclick={() => controller?.abort()}>{t('moving.cancel')}</button>{/if}
  </div>
  <div class="ml-row">
    <label>{t('moving.caseStep')} <QuantityInput bind:value={caseStep} quantity="length" min={0.1} cls="ml-num" testid="moving-case-step" /></label>
    <button class="pk-btn" disabled={pathIds.length === 0} onclick={positionCases} data-testid="moving-cases">{t('moving.createCases')}</button>
  </div>
  <p class="ml-hint">{tp('moving.casesHint', { max: MAX_POSITION_CASES })}</p>
  <div class="ml-row">
    <label>{t('moving.lane')} <QuantityInput bind:value={laneQ} quantity="distributedLoad" min={0} cls="ml-num" testid="moving-lane-q" /></label>
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
  .ml :global(.ml-num) { width: 64px; }
  .ml-name { width: 140px; }
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
