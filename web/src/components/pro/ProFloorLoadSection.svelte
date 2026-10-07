<script lang="ts">
  import PickKind from './PickKind.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';
  import ProLoadZones from './loads/ProLoadZones.svelte';
  /**
   * A floor load, kept as its definition: an area load on a level, a group, the members picked, a
   * box of coordinates or a zone, carried to the beams by tributary area (`floor-loads.ts`) or onto
   * the slab's shells. The plan shows the panels before it is added; once added, its loads are
   * rewritten whenever the model under it changes (`store/defined-loads.ts`), and it is listed
   * below to change or remove.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { sortedLevels } from '../../lib/model/grid';
  import { expandDefinition, zoneChanged, type FloorLoadDef, type FloorTarget, type DefinitionModel } from '../../lib/model/loads/floor-definitions';
  import { addFloorLoadDef, removeFloorLoadDef, expandDefinitions } from '../../lib/store/defined-loads';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';

  const floorGroups = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'floor' && (g.members.elements?.length ?? 0) > 0));
  const zones = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'loadZone'));
  /** The levels to offer: the grid's, or else every elevation that has horizontal beams. */
  const levels = $derived.by(() => {
    const named = sortedLevels(modelStore.grid);
    if (named.length) return named.map((l) => ({ name: l.name, z: l.z }));
    const zs = new Set<number>();
    for (const e of modelStore.elements.values()) {
      const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
      if (a && b && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-3 && Math.hypot(a.x - b.x, a.y - b.y) > 1e-3) zs.add(Math.round((a.z ?? 0) * 1000) / 1000);
    }
    return [...zs].sort((a, b) => a - b).map((z) => ({ name: `z = ${z} m`, z }));
  });

  let targetKey = $state('');
  let q = $state(2);
  let caseId = $state<number | null>(null);
  let distribution = $state<FloorLoadDef['distribution']>('twoWay');
  let spanAxis = $state<'x' | 'y'>('x');
  let perPlanArea = $state(false);
  let name = $state('');
  /** SI; an empty field leaves its axis unbounded. */
  let range = $state<Record<'x0' | 'x1' | 'y0' | 'y1' | 'z0' | 'z1', number | null>>({ x0: null, x1: null, y0: null, y1: null, z0: null, z1: null });
  let applied = $state<string | null>(null);

  const targets = $derived<Array<{ key: string; label: string }>>([
    ...levels.map((l) => ({ key: `z:${l.z}`, label: l.name })),
    ...floorGroups.map((g) => ({ key: `g:${g.id}`, label: g.name })),
    ...zones.map((g) => ({ key: `zone:${g.id}`, label: `${t('loadZone.zone')} · ${g.name}` })),
    { key: 'sel', label: t('floorLoad.selection') },
    { key: 'range', label: t('floorLoad.range') },
  ]);
  $effect(() => {
    if (!targets.some((x) => x.key === targetKey)) targetKey = targets[0]?.key ?? 'sel';
    const cases = modelStore.model.loadCases;
    if (caseId === null || !cases.some((c) => c.id === caseId)) caseId = (cases.find((c) => c.type === 'L') ?? cases[0])?.id ?? null;
  });

  /**
   * The box, on the SI values its fields hold: an axis bounded on both sides, or on neither. Null
   * for an axis bounded on one side only, which the panel says (`rangeTarget` reads the same rule
   * from text).
   */
  function rangeOf(r: typeof range): FloorTarget | null {
    const out: Extract<FloorTarget, { by: 'range' }> = { by: 'range' };
    for (const a of ['x', 'y', 'z'] as const) {
      const v0 = r[`${a}0`], v1 = r[`${a}1`];
      if (v0 === null && v1 === null) continue;
      if (v0 === null || v1 === null) return null;
      out[a] = [v0, v1];
    }
    return out;
  }
  /** Null for a box with an axis bounded on one side only (`rangeOf`). */
  const target = $derived.by((): FloorTarget | null => {
    if (targetKey.startsWith('z:')) return { by: 'level', z: Number(targetKey.slice(2)) };
    if (targetKey.startsWith('g:')) return { by: 'group', groupId: Number(targetKey.slice(2)) };
    if (targetKey.startsWith('zone:')) return { by: 'zone', zoneId: Number(targetKey.slice(5)) };
    if (targetKey === 'range') return rangeOf(range);
    return { by: 'own' };
  });
  const own = $derived(targetKey === 'sel' ? {
    elements: [...uiStore.selectedElements],
    quads: [...uiStore.selectedShells].filter((k) => k[0] === 'q').map((k) => Number(k.slice(1))),
    plates: [...uiStore.selectedShells].filter((k) => k[0] === 'p').map((k) => Number(k.slice(1))),
  } : {});
  const def = $derived<FloorLoadDef | null>(caseId === null || target === null ? null : {
    caseId, q, target, distribution, ...(distribution === 'oneWay' ? { spanAxis } : {}), ...(perPlanArea ? { perPlanArea } : {}),
  });
  const preview = $derived(def && q !== 0
    ? expandDefinition(modelStore.model as unknown as DefinitionModel, def, own, -1, { leftHand: uiStore.axisConvention3D === 'leftHand' })
    : null);
  const result = $derived(preview?.result ?? null);

  function add() {
    if (!def || !preview || preview.loads.length === 0) return;
    const label = name.trim() || tp('floorLoad.defaultName', { n: [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad').length + 1 });
    addFloorLoadDef(label, def, own);
    applied = tp('floorLoad.added', { name: label, n: preview.loads.length });
    name = '';
  }

  // ── The definitions ──
  const defs = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad'));
  // Shared with the rewrite after each edit (`expandDefinitions` keeps it until the model changes).
  const expanded = $derived.by(() => { void modelStore.modelVersion; return new Map(expandDefinitions().map((e) => [e.defId, e])); });
  const caseName = (id: number) => modelStore.model.loadCases.find((c) => c.id === id)?.name ?? '—';
  function targetText(d: FloorLoadDef): string {
    const tg = d.target;
    if (tg.by === 'level') return `z = ${tg.z} m`;
    if (tg.by === 'group') return modelStore.model.groups.get(tg.groupId)?.name ?? '—';
    if (tg.by === 'zone') return `${t('loadZone.zone')} · ${modelStore.model.groups.get(tg.zoneId)?.name ?? '—'}`;
    if (tg.by === 'range') return t('floorLoad.range');
    return t('floorLoad.selection');
  }

  // ── Plan ──
  const W = 280, H = 180, PAD = 10;
  const view = $derived.by(() => {
    if (!result || result.panels.length === 0) return null;
    const pts = result.panels.flatMap((p) => p.polygon);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-6), (H - 2 * PAD) / Math.max(y1 - y0, 1e-6));
    return { tx: (x: number) => PAD + (x - x0) * k, ty: (y: number) => H - PAD - (y - y0) * k };
  });
  const polyPath = (poly: Array<[number, number]>) => view ? poly.map((p, i) => `${i ? 'L' : 'M'}${view.tx(p[0]).toFixed(1)},${view.ty(p[1]).toFixed(1)}`).join(' ') + 'Z' : '';
</script>

<div class="fl" data-testid="floor-load">
  <p class="fl-hint">{t('floorLoad.hint')}</p>
  <div class="fl-grid">
    <label for="fl-target">{t('floorLoad.target')}</label>
    <span class="fl-target">
      <select id="fl-target" bind:value={targetKey} data-testid="fl-target">
        {#each targets as x (x.key)}<option value={x.key}>{x.label}</option>{/each}
      </select>
      {#if targetKey === 'sel'}<PickKind kind="elements" />{/if}
    </span>
    {#if targetKey === 'range'}
      <span class="fl-range-label">{t('floorLoad.rangeBox')}</span>
      <span class="fl-range" data-testid="fl-range">
        {#each ['x', 'y', 'z'] as a (a)}
          <span>{a.toUpperCase()} <QuantityInput bind:value={range[`${a}0` as 'x0']} nullable quantity="length" showUnit={false} cls="fl-num" testid="fl-range-{a}0" /> … <QuantityInput bind:value={range[`${a}1` as 'x1']} nullable quantity="length" cls="fl-num" testid="fl-range-{a}1" /></span>
        {/each}
      </span>
    {/if}
    <label for="fl-q">{t('floorLoad.q')}</label>
    <QuantityInput bind:value={q} quantity="areaLoad" testid="fl-q" wrap="fl-unit" />
    <label for="fl-case">{t('floorLoad.case')}</label>
    <select id="fl-case" bind:value={caseId} data-testid="fl-case">
      {#each modelStore.model.loadCases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <label for="fl-dist">{t('floorLoad.distribution')}</label>
    <select id="fl-dist" bind:value={distribution} data-testid="fl-distribution">
      <option value="twoWay">{t('floorLoad.twoWay')}</option>
      <option value="oneWay">{t('floorLoad.oneWay')}</option>
      <option value="slab">{t('floorLoad.slab')}</option>
    </select>
    {#if distribution === 'oneWay'}
      <label for="fl-span">{t('floorLoad.span')}</label>
      <select id="fl-span" bind:value={spanAxis} data-testid="fl-span">
        <option value="x">X</option>
        <option value="y">Y</option>
      </select>
    {/if}
    <label for="fl-name">{t('floorLoad.name')}</label>
    <input id="fl-name" type="text" bind:value={name} data-testid="fl-name" />
  </div>
  <label class="fl-check"><input type="checkbox" bind:checked={perPlanArea} data-testid="fl-plan-area" /> {t('floorLoad.perPlanArea')}</label>
  {#if q < 0}<p class="fl-hint">{t('floorLoad.suction')}</p>{/if}
  {#if target === null}<p class="fl-warn" data-testid="fl-range-invalid">{t('floorLoad.rangeInvalid')}</p>{/if}

  {#if result}
    {#if view}
      <svg viewBox="0 0 {W} {H}" class="fl-plan" role="img" aria-label={t('floorLoad.plan')}>
        <defs>
          <pattern id="fl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" class="fl-hatch-line" />
          </pattern>
        </defs>
        {#each result.panels as p, i (i)}
          <path d={polyPath(p.polygon)} class={p.loaded ? 'fl-panel' : 'fl-panel-off'} />
        {/each}
      </svg>
    {/if}
    <p class="fl-summary" data-testid="fl-summary">
      {tp('floorLoad.summary', { panels: result.panels.filter((p) => p.loaded).length, area: result.loadedArea.toFixed(2), total: result.totalKN.toFixed(1), beams: result.perBeam.size })}
    </p>
    {#if result.normal[2] < 0.999999}<p class="fl-hint" data-testid="fl-inclined">{tp('floorLoad.inclined', { deg: (Math.acos(result.normal[2]) * 180 / Math.PI).toFixed(1) })}</p>{/if}
    {#if result.skipped.zoneAcrossSpan}<p class="fl-warn">{tp('floorLoad.skip.zoneAcrossSpan', { n: result.skipped.zoneAcrossSpan })}</p>{/if}
    {#if result.skipped.unresolved}<p class="fl-warn">{tp('floorLoad.skip.unresolved', { n: result.skipped.unresolved })}</p>{/if}
    {#if result.skipped.crossings}<p class="fl-warn">{tp('floorLoad.skip.crossings', { n: result.skipped.crossings })}</p>{/if}
    {#if result.skipped.open}<p class="fl-hint">{tp('floorLoad.skip.open', { n: result.skipped.open })}</p>{/if}
    {#if result.skipped.trusses}<p class="fl-hint">{tp('floorLoad.skip.trusses', { n: result.skipped.trusses })}</p>{/if}
    {#if result.skipped.otherLevel}<p class="fl-hint">{tp('floorLoad.skip.otherLevel', { n: result.skipped.otherLevel })}</p>{/if}
    {#if result.nodal.length}<p class="fl-hint">{tp('floorLoad.cornerLoads', { n: result.nodal.length })}</p>{/if}
  {:else if preview && preview.loads.length}
    <p class="fl-summary" data-testid="fl-summary">{tp('floorLoad.slabSummary', { n: preview.loads.length })}</p>
  {:else if preview}
    <p class="fl-hint">{t(preview.problem === 'noZone' ? 'floorLoad.noZone' : 'floorLoad.none')}</p>
  {/if}

  <button class="pk-btn pk-btn-primary" disabled={!preview || preview.loads.length === 0} onclick={add} data-testid="fl-apply">{t('floorLoad.add')}</button>
  {#if applied}<p class="fl-hint" data-testid="fl-applied">{applied}</p>{/if}

  {#if defs.length}
    <div class="fl-title">{t('floorLoad.defined')}</div>
    <table class="fl-table" data-testid="fl-defs">
      <thead><tr><th>{t('floorLoad.name')}</th><th>{t('floorLoad.case')}</th><th>q ({unitQ('areaLoad')})</th><th>{t('floorLoad.target')}</th><th>{t('floorLoad.distribution')}</th><th>kN</th><th></th></tr></thead>
      <tbody>
        {#each defs as g (g.id)}
          {@const d = g.data as unknown as FloorLoadDef}
          {@const e = expanded.get(g.id)}
          <tr data-testid="fl-def-row">
            <td>{g.name}</td><td>{caseName(d.caseId)}</td><td class="fl-n">{fmtQ(d.q, 'areaLoad')}</td><td>{targetText(d)}</td>
            <td>{t(d.distribution === 'slab' ? 'floorLoad.slab' : d.distribution === 'oneWay' ? 'floorLoad.oneWay' : 'floorLoad.twoWay')}</td>
            <td class="fl-n">{e && Number.isFinite(e.totalKN) ? e.totalKN.toFixed(1) : '—'}{#if e?.problem} <span class="fl-warn-inline" title={t(`floorLoad.problem.${e.problem}`)}>!</span>{:else if d.target.by === 'zone' && zoneChanged(modelStore.model as unknown as DefinitionModel, d.target.zoneId)} <span class="fl-warn-inline" title={t('loadZone.changed')}>!</span>{/if}</td>
            <td><button class="pro-delete-btn" onclick={() => removeFloorLoadDef(g.id)} aria-label={t('loadTables.delete')} data-testid="fl-def-delete">×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="fl-hint">{t('floorLoad.definedHint')}</p>
  {/if}

  <ProLoadZones />
</div>

<style>
  .fl-target { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .fl { display: flex; flex-direction: column; gap: 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .fl-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .fl-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
  .fl-warn-inline { color: var(--st-warn); font-weight: 600; }
  .fl-summary { margin: 0; }
  .fl-title { font-size: 0.66rem; font-weight: 600; color: var(--st-text); margin-top: 4px; }
  .fl-grid { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 8px; align-items: center; }
  .fl-range { display: flex; flex-direction: column; gap: 2px; }
  .fl-range-label { color: var(--st-text-3); }
  .fl-range :global(.fl-num) { width: 52px; }
  .fl-check { display: inline-flex; align-items: center; gap: 5px; }
  .fl-plan { width: 100%; max-width: 320px; display: block; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .fl-panel { fill: color-mix(in srgb, var(--st-accent) 22%, transparent); stroke: var(--st-accent); stroke-width: 1.5; }
  .fl-panel-off { fill: url(#fl-hatch); stroke: var(--st-warn); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .fl-hatch-line { stroke: var(--st-warn); stroke-width: 1; opacity: 0.6; }
  .fl-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; }
  .fl-table th { text-align: left; color: var(--st-text-3); font-weight: 600; padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .fl-table td { padding: 2px 4px; border-bottom: 1px solid var(--st-surface-2); }
  .fl-n { font-family: var(--st-mono); text-align: right; }
</style>
