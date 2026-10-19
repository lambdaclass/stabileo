<script lang="ts">
  /**
   * Foundations placed as the other elements are: a kind of footing chosen from its drawing and
   * put under the supports (centred, or held at the sides named property lines), two or more
   * columns on one combined footing, a wall on its strip, piles under a cap with the soil's strata
   * for their capacity; the sizes worked out from the solved reactions; tie and strap beams
   * proposed by distance and visibility angle and shown on the plan before they are placed.
   * Each footing is then edited in the foundations editor below, the same one design uses.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { physicalGroups } from '../../lib/store/physical';
  import {
    anchorsFor, combineFootings, placeFootings, placeFoundationBeams, proposeStraps, proposeTies, stripUnderWall, supportedNodes,
    type BeamProposal, type PropertyLines,
  } from '../../lib/model/foundation/generate';
  import { presizeModelFootings, type PresizeOutcome } from '../../lib/store/foundation-tools';
  import FootingKindPicker from './building/FootingKindPicker.svelte';
  import SoilStrataCard from './building/SoilStrataCard.svelte';
  import FoundationsPanel from './design/FoundationsPanel.svelte';

  let kind = $state<'isolated' | 'combined' | 'strip' | 'pileCap'>('isolated');
  let thickness = $state(0.5);
  let lines = $state<PropertyLines>({});
  let onlySelected = $state(false);
  let pileDiameter = $state(0.5), pileLength = $state(12);
  let wallId = $state<number | null>(null);
  let status = $state<string | null>(null);
  let presized = $state<PresizeOutcome[]>([]);

  const supports = $derived.by(() => { void modelStore.supports; void modelStore.model.footings; return supportedNodes(); });
  const selectedSupported = $derived([...uiStore.selectedNodes].filter((id) => supports.all.includes(id)));
  const targets = $derived(onlySelected ? selectedSupported.filter((id) => supports.bare.includes(id)) : supports.bare);
  const walls = $derived.by(() => { void modelStore.model.groups; return physicalGroups().filter((g) => g.physical.kind === 'wall'); });
  $effect(() => { if (wallId === null || !walls.some((w) => w.id === wallId)) wallId = walls[0]?.id ?? null; });
  const footingCount = $derived(modelStore.model.footings.size);

  function place() {
    if (kind === 'combined') {
      const id = combineFootings(selectedSupported, thickness);
      status = id === null ? t('fdn.needTwo') : tp('fdn.placed', { n: 1 });
    } else if (kind === 'strip') {
      const id = wallId !== null ? stripUnderWall(wallId, thickness) : null;
      status = id === null ? t('fdn.noWall') : tp('fdn.placed', { n: 1 });
    } else {
      const ids = placeFootings(targets, {
        kind, thickness, // The property lines are the sides of the building: read off every support.
        anchors: anchorsFor(supports.all, lines),
        ...(kind === 'pileCap' ? { piles: { count: 2, diameter: pileDiameter, length: pileLength, spacing: 3 * pileDiameter } } : {}),
      });
      status = tp('fdn.placed', { n: ids.length });
    }
  }

  function presize() {
    presized = presizeModelFootings();
    const ok = presized.filter((p) => 'size' in p).length;
    status = tp('fdn.presized', { ok, total: presized.length });
  }

  // ── Foundation beams ──
  let maxDistance = $state(8), visibility = $state(45), withStraps = $state(true), withTies = $state(true);
  let proposal = $state<BeamProposal[]>([]);
  let showAfter = $state(true);
  const sections = $derived([...modelStore.sections.values()]);
  const materials = $derived([...modelStore.materials.values()]);
  let sectionId = $state(0), materialId = $state(0);
  $effect(() => {
    if (!modelStore.sections.has(sectionId) && sections[0]) sectionId = sections[0].id;
    if (!modelStore.materials.has(materialId) && materials[0]) materialId = materials[0].id;
  });
  function propose() {
    const straps = withStraps ? proposeStraps() : [];
    const same = (p: BeamProposal, q: BeamProposal) => (p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a);
    const ties = withTies ? proposeTies(maxDistance, visibility).filter((x) => !straps.some((s) => same(s, x))) : [];
    proposal = [...straps, ...ties];
    showAfter = true;
  }
  function placeBeams() {
    const n = placeFoundationBeams(proposal, { sectionId, materialId });
    status = tp('fdn.beamsPlaced', { n });
    proposal = [];
  }

  // The plan, before and after: footings, the foundation beams there are, and those proposed.
  const plan = $derived.by(() => {
    void modelStore.model.footings; void modelStore.model.groups;
    const fs = [...modelStore.model.footings.values()];
    const pts = fs.map((f) => modelStore.nodes.get(f.nodeId)).filter(Boolean) as Array<{ x: number; y: number }>;
    if (pts.length === 0) return null;
    const minX = Math.min(...pts.map((p) => p.x)) - 1.5, maxX = Math.max(...pts.map((p) => p.x)) + 1.5;
    const minY = Math.min(...pts.map((p) => p.y)) - 1.5, maxY = Math.max(...pts.map((p) => p.y)) + 1.5;
    const P = (id: number) => modelStore.nodes.get(id)!;
    const existing = physicalGroups().filter((g) => g.physical.typology === 'tie' || g.physical.typology === 'strap' || g.physical.typology === 'foundation')
      .flatMap((g) => (g.members.elements ?? []).map((e) => modelStore.elements.get(e)).filter(Boolean)) as Array<{ nodeI: number; nodeJ: number }>;
    return {
      box: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`, w: maxX - minX,
      footings: fs.map((f) => {
        const n = P(f.nodeId), B = f.B || 0.6, L = f.L || 0.6, th = (f.rotationDeg * Math.PI) / 180;
        const cx = n.x + f.eccentricityB * Math.cos(th) - f.eccentricityL * Math.sin(th), cy = n.y + f.eccentricityB * Math.sin(th) + f.eccentricityL * Math.cos(th);
        return { cx, cy: -cy, B, L, rot: -f.rotationDeg, sized: f.B > 0 };
      }),
      existing: existing.map((e) => [P(e.nodeI), P(e.nodeJ)] as const),
    };
  });
  const P = (id: number) => modelStore.nodes.get(id)!;
</script>

<div class="pk fd" data-testid="foundation-model-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('fdn.title')}</h4>
    <p class="pk-hint">{t('fdn.explain')}</p>
    <FootingKindPicker bind:value={kind} />
    <div class="fd-row">
      <label class="fd-inline">{t('building.thickness')} <input type="number" min="0.2" step="0.05" bind:value={thickness} data-testid="foundation-thickness" /></label>
      {#if kind === 'pileCap'}
        <label class="fd-inline">{t('fdn.pileDiameter')} <input type="number" min="0.2" step="0.05" bind:value={pileDiameter} /></label>
        <label class="fd-inline">{t('fdn.pileLength')} <input type="number" min="2" step="0.5" bind:value={pileLength} /></label>
      {/if}
    </div>
    {#if kind === 'isolated' || kind === 'pileCap'}
      <div class="fd-row" role="group" aria-label={t('fdn.propertyLines')}>
        <span class="fd-label">{t('fdn.propertyLines')}</span>
        {#each [['minX', '−X'], ['maxX', '+X'], ['minY', '−Y'], ['maxY', '+Y']] as const as [k, label]}
          <label><input type="checkbox" checked={!!lines[k]} onchange={() => (lines = { ...lines, [k]: !lines[k] })} data-testid="foundation-line-{k}" /> {label}</label>
        {/each}
      </div>
      <label class="fd-row"><input type="checkbox" bind:checked={onlySelected} /> {tp('fdn.onlySelected', { n: selectedSupported.length })}</label>
      <button class="pk-btn pk-btn-primary" disabled={targets.length === 0} onclick={place} data-testid="foundation-place">{tp('fdn.placeUnder', { n: targets.length })}</button>
    {:else if kind === 'combined'}
      <p class="pk-hint">{tp('fdn.combinedHint', { n: selectedSupported.length })}</p>
      <button class="pk-btn pk-btn-primary" disabled={selectedSupported.length < 2} onclick={place} data-testid="foundation-place">{t('fdn.placeCombined')}</button>
    {:else}
      {#if walls.length === 0}<p class="pk-hint">{t('fdn.noWall')}</p>{:else}
        <label class="fd-inline">{t('fdn.wall')}
          <select bind:value={wallId}>{#each walls as w (w.id)}<option value={w.id}>{w.name}</option>{/each}</select>
        </label>
        <button class="pk-btn pk-btn-primary" onclick={place} data-testid="foundation-place">{t('fdn.placeStrip')}</button>
      {/if}
    {/if}
    {#if status}<p class="pk-hint fd-status" role="status" data-testid="foundation-status">{status}</p>{/if}
  </section>

  {#if footingCount > 0}
    <section class="pk-card" data-testid="foundation-presize">
      <h5 class="fd-h">{t('fdn.presizeTitle')}</h5>
      <p class="pk-hint">{t('fdn.presizeHint')}</p>
      <button class="pk-btn" onclick={presize} data-testid="foundation-presize-run">{t('fdn.presize')}</button>
      {#if presized.length > 0}
        <ul class="fd-list">
          {#each presized as p (p.id)}
            <li>
              <b>{p.name}</b>
              {#if 'size' in p}{p.size.B.toFixed(2)} × {p.size.L.toFixed(2)} m{#if p.size.piles} · {tp('fdn.piles', { n: p.size.piles.count })}{/if}
                {#each p.notes as n}<span class="fd-note"> · {t(`fdn.note.${n}`)}</span>{/each}
              {:else}<span class="fd-warn">{t(`fdn.refused.${p.refused}`)}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="pk-card" data-testid="foundation-beams">
      <h5 class="fd-h">{t('fdn.beamsTitle')}</h5>
      <p class="pk-hint">{t('fdn.beamsHint')}</p>
      <div class="fd-row">
        <label><input type="checkbox" bind:checked={withTies} /> {t('physical.typ.tie')}</label>
        <label><input type="checkbox" bind:checked={withStraps} /> {t('physical.typ.strap')}</label>
        <label class="fd-inline">{t('fdn.maxDistance')} <input type="number" min="1" step="0.5" bind:value={maxDistance} data-testid="foundation-max-distance" /> m</label>
        <label class="fd-inline">{t('fdn.visibility')} <input type="number" min="5" max="90" step="5" bind:value={visibility} /> °</label>
      </div>
      <div class="fd-row">
        <label class="fd-inline">{t('building.section')} <select bind:value={sectionId}>{#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
        <label class="fd-inline">{t('building.material')} <select bind:value={materialId}>{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
      </div>
      <button class="pk-btn" onclick={propose} data-testid="foundation-propose">{t('fdn.propose')}</button>
      {#if plan}
        <div class="fd-seg" role="radiogroup" aria-label={t('fdn.preview')}>
          <button class:on={!showAfter} role="radio" aria-checked={!showAfter} onclick={() => (showAfter = false)}>{t('fdn.before')}</button>
          <button class:on={showAfter} role="radio" aria-checked={showAfter} onclick={() => (showAfter = true)} data-testid="foundation-after">{tp('fdn.after', { n: proposal.length })}</button>
        </div>
        <svg class="fd-plan" viewBox={plan.box} data-testid="foundation-plan">
          {#each plan.existing as [a, b]}<line class="fd-beam" x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke-width={plan.w / 150} />{/each}
          {#if showAfter}
            {#each proposal as p}<line class="fd-new fd-{p.kind}" x1={P(p.a).x} y1={-P(p.a).y} x2={P(p.b).x} y2={-P(p.b).y} stroke-width={plan.w / 120} stroke-dasharray="{plan.w / 60} {plan.w / 120}" />{/each}
          {/if}
          {#each plan.footings as f}<rect class="fd-foot" class:unsized={!f.sized} x={f.cx - f.B / 2} y={f.cy - f.L / 2} width={f.B} height={f.L} transform="rotate({f.rot} {f.cx} {f.cy})" stroke-width={plan.w / 200} />{/each}
        </svg>
        <button class="pk-btn pk-btn-primary" disabled={proposal.length === 0} onclick={placeBeams} data-testid="foundation-place-beams">{tp('fdn.placeBeams', { n: proposal.length })}</button>
      {/if}
    </section>
  {/if}

  <SoilStrataCard />

  <details class="pk-card fd-editor">
    <summary>{tp('fdn.editor', { n: footingCount })}</summary>
    <FoundationsPanel />
  </details>
</div>

<style>
  .fd-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .fd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; }
  .fd-inline { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); font-size: 0.7rem; }
  .fd-inline input { width: 4.2rem; font-size: 0.72rem; }
  .fd-label { color: var(--st-text-2); }
  .fd-status { border-left: 2px solid var(--st-accent); padding-left: 6px; }
  .fd-list { margin: 4px 0; padding-left: 16px; font-size: 0.7rem; }
  .fd-note { color: var(--st-text-3); }
  .fd-warn { color: var(--st-warn); }
  .fd-seg { display: inline-flex; gap: 2px; margin: 6px 0 4px; }
  .fd-seg button { font-size: 0.66rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-2); border-radius: 3px; cursor: pointer; }
  .fd-seg .on { border-color: var(--st-accent); color: var(--st-text); }
  .fd-plan { width: 100%; max-height: 16rem; background: var(--st-surface); border: 1px solid var(--st-hair); }
  .fd-foot { fill: color-mix(in srgb, var(--st-text-3) 25%, transparent); stroke: var(--st-text-2); }
  .fd-foot.unsized { fill: none; stroke: var(--st-warn); }
  .fd-beam { stroke: var(--st-text-2); }
  .fd-new { stroke: var(--st-accent); }
  .fd-new.fd-strap { stroke: var(--st-warn); }
  .fd-editor summary { cursor: pointer; font-size: 0.74rem; font-weight: 500; }
</style>
