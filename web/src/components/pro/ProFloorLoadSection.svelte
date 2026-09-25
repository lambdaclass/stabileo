<script lang="ts">
  /**
   * A floor load: an area load on a level, a floor group or the selected beams, carried to the
   * beams by tributary area (`engine/loads/floor-loads.ts`). The plan shows the panels found and
   * which ones are loaded before anything is applied; applying adds ordinary member loads to the
   * chosen case, as one undo step.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { floorLoad, type FloorBeam } from '../../lib/engine/loads/floor-loads';
  import { sortedLevels } from '../../lib/model/grid';

  type Target = { kind: 'level'; z: number } | { kind: 'group'; id: number } | { kind: 'selection' };

  const floorGroups = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'floor' && (g.members.elements?.length ?? 0) > 0));
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
  let distribution = $state<'twoWay' | 'oneWay'>('twoWay');
  let spanAxis = $state<'x' | 'y'>('x');
  let applied = $state<string | null>(null);

  const targets = $derived<Array<{ key: string; label: string; target: Target }>>([
    ...levels.map((l) => ({ key: `z:${l.z}`, label: l.name, target: { kind: 'level' as const, z: l.z } })),
    ...floorGroups.map((g) => ({ key: `g:${g.id}`, label: g.name, target: { kind: 'group' as const, id: g.id } })),
    { key: 'sel', label: t('floorLoad.selection'), target: { kind: 'selection' as const } },
  ]);
  $effect(() => {
    if (!targets.some((x) => x.key === targetKey)) targetKey = targets[0]?.key ?? 'sel';
    const cases = modelStore.model.loadCases;
    if (caseId === null || !cases.some((c) => c.id === caseId)) caseId = (cases.find((c) => c.type === 'L') ?? cases[0])?.id ?? null;
  });

  const beams = $derived.by((): FloorBeam[] => {
    const target = targets.find((x) => x.key === targetKey)?.target;
    if (!target) return [];
    let ids: number[];
    if (target.kind === 'group') ids = modelStore.model.groups.get(target.id)?.members.elements ?? [];
    else if (target.kind === 'selection') ids = [...uiStore.selectedElements];
    else ids = [...modelStore.elements.values()].filter((e) => {
      const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
      return a && b && Math.abs((a.z ?? 0) - target.z) < 1e-3 && Math.abs((b.z ?? 0) - target.z) < 1e-3;
    }).map((e) => e.id);
    return ids.map((id) => modelStore.elements.get(id)).filter((e) => !!e).map((e) => ({
      id: e!.id, nodeI: e!.nodeI, nodeJ: e!.nodeJ, type: e!.type, sectionId: e!.sectionId,
      localYx: e!.localYx, localYy: e!.localYy, localYz: e!.localYz, rollAngle: e!.rollAngle,
    }));
  });

  const result = $derived(beams.length > 0 && q > 0 ? floorLoad({
    nodes: modelStore.nodes, beams, q, distribution, spanAxis,
    sectionRotation: (id) => modelStore.sections.get(id)?.rotation ?? 0,
    leftHand: uiStore.axisConvention3D === 'leftHand',
  }) : null);

  function apply() {
    if (!result || caseId === null || result.loads.length === 0) return;
    const cid = caseId;
    modelStore.batch(() => {
      for (const l of result.loads) modelStore.addDistributedLoad3D(l.elementId, l.qYI, l.qYJ, l.qZI, l.qZJ, l.a, l.b, cid);
    });
    applied = tp('floorLoad.applied', { n: result.loads.length, total: result.totalKN.toFixed(1), case: modelStore.model.loadCases.find((c) => c.id === cid)?.name ?? '' });
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
    <select id="fl-target" bind:value={targetKey} data-testid="fl-target">
      {#each targets as x (x.key)}<option value={x.key}>{x.label}</option>{/each}
    </select>
    <label for="fl-q">{t('floorLoad.q')}</label>
    <span><input id="fl-q" type="number" min="0" step="0.5" bind:value={q} data-testid="fl-q" /> kN/m²</span>
    <label for="fl-case">{t('floorLoad.case')}</label>
    <select id="fl-case" bind:value={caseId} data-testid="fl-case">
      {#each modelStore.model.loadCases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <label for="fl-dist">{t('floorLoad.distribution')}</label>
    <select id="fl-dist" bind:value={distribution} data-testid="fl-distribution">
      <option value="twoWay">{t('floorLoad.twoWay')}</option>
      <option value="oneWay">{t('floorLoad.oneWay')}</option>
    </select>
    {#if distribution === 'oneWay'}
      <label for="fl-span">{t('floorLoad.span')}</label>
      <select id="fl-span" bind:value={spanAxis} data-testid="fl-span">
        <option value="x">X</option>
        <option value="y">Y</option>
      </select>
    {/if}
  </div>

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
    {#if result.skipped.nonConvex}<p class="fl-warn">{tp('floorLoad.skip.nonConvex', { n: result.skipped.nonConvex })}</p>{/if}
    {#if result.skipped.crossings}<p class="fl-warn">{tp('floorLoad.skip.crossings', { n: result.skipped.crossings })}</p>{/if}
    {#if result.skipped.open}<p class="fl-hint">{tp('floorLoad.skip.open', { n: result.skipped.open })}</p>{/if}
    {#if result.skipped.trusses}<p class="fl-hint">{tp('floorLoad.skip.trusses', { n: result.skipped.trusses })}</p>{/if}
    {#if result.skipped.otherLevel}<p class="fl-hint">{tp('floorLoad.skip.otherLevel', { n: result.skipped.otherLevel })}</p>{/if}
  {:else}
    <p class="fl-hint">{t('floorLoad.none')}</p>
  {/if}

  <button class="pk-btn pk-btn-primary" disabled={!result || result.loads.length === 0 || caseId === null} onclick={apply} data-testid="fl-apply">{t('floorLoad.apply')}</button>
  {#if applied}<p class="fl-hint" data-testid="fl-applied">{applied}</p>{/if}
</div>

<style>
  .fl { display: flex; flex-direction: column; gap: 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .fl-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .fl-warn { margin: 0; font-size: 0.62rem; color: var(--st-warning); }
  .fl-summary { margin: 0; }
  .fl-grid { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 8px; align-items: center; }
  .fl-grid input[type='number'] { width: 70px; }
  .fl-plan { width: 100%; max-width: 320px; display: block; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .fl-panel { fill: color-mix(in srgb, var(--st-accent) 22%, transparent); stroke: var(--st-accent); stroke-width: 1.5; }
  .fl-panel-off { fill: url(#fl-hatch); stroke: var(--st-warning); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .fl-hatch-line { stroke: var(--st-warning); stroke-width: 1; opacity: 0.6; }
</style>
