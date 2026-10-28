<script lang="ts">
  /**
   * The member selected whole (`store/curved-members.ts`): an arc or a member a mesh cut. For an
   * arc, its geometry, the segments it is analysed with and their chord error, remade from here
   * keeping its identity, and the loads along it, kept as definitions.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { addCurveLoad, arcHandLoads, curveLoadDefs, remakeArc, removeCurveLoad, selectedPiece, type CurveLoadDef } from '../../../lib/store/curved-members';
  import { arcThroughThree, chordError } from '../../../lib/model/curved-member';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';

  const p = $derived.by(() => { void modelStore.modelVersion; void uiStore.selectedElements; return selectedPiece(); });
  const arc = $derived.by(() => {
    if (!p || p.kind !== 'arc') return null;
    const e = modelStore.elements.get(p.segments[0]!.elementId);
    return e?.arc ? { id: e.arc.id, spec: e.arc.spec, geo: arcThroughThree(e.arc.spec.start, e.arc.spec.through, e.arc.spec.end) } : null;
  });
  const loads = $derived.by(() => { void modelStore.model.groups; return arc ? curveLoadDefs(arc.id) : []; });
  const cases = $derived(modelStore.model.loadCases);

  let segments = $state(12);
  $effect(() => { if (p) segments = p.segments.length; });
  const err = $derived(arc?.geo ? chordError(arc.geo, segments) : 0);
  const handLoads = $derived.by(() => { void modelStore.loads; return arc ? arcHandLoads(arc.id) : 0; });
  let message = $state<string | null>(null);

  function remake() {
    if (!arc) return;
    const r = remakeArc(arc.id, { segments });
    if (!r) return;
    uiStore.selectElements(r.members);
    message = tp('pieces.remade', { n: r.members.length }) + (r.droppedLoads ? ' ' + tp('pieces.droppedLoads', { n: r.droppedLoads }) : '') + (r.keptNodes ? ' ' + tp('pieces.keptNodes', { n: r.keptNodes }) : '');
  }

  let loadCase = $state(1);
  let loadQ = $state(1);
  let loadDir = $state<'gravity' | 'x' | 'y' | 'z'>('gravity');
  const DIRS: Record<string, [number, number, number]> = { gravity: [0, 0, -1], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  function addLoad() {
    if (!arc) return;
    addCurveLoad({ arcId: arc.id, caseId: loadCase, q: loadQ, dir: DIRS[loadDir]! });
  }
  const dirLabel = (d: [number, number, number]) => {
    const k = Object.entries(DIRS).find(([, v]) => v.every((x, i) => Math.abs(x - d[i]!) < 1e-9))?.[0];
    return k ? t(`pieces.dir.${k}`) : `(${d.map((v) => v.toFixed(2)).join(', ')})`;
  };
</script>

{#if p}
  <section class="pc" data-testid="piece-panel">
    <header>
      <strong>{arc ? tp('pieces.arcTitle', { id: arc.id }) : t('pieces.chainTitle')}</strong>
      <span class="pc-dim">{tp('pieces.summary', { n: p.segments.length, length: fmtQ(p.length, 'length'), unit: unitQ('length') })}</span>
    </header>
    {#if arc?.geo}
      <p class="pc-dim">{tp('pieces.arcGeo', { r: fmtQ(arc.geo.radius, 'length'), unit: unitQ('length'), sweep: ((arc.geo.sweep * 180) / Math.PI).toFixed(1) })}</p>
      <div class="pc-row">
        <label>{t('pieces.segments')} <input type="number" min="1" max="64" bind:value={segments} data-testid="piece-segments" /></label>
        <span class="pc-dim">{tp('pieces.chordError', { e: fmtQ(err, 'length'), unit: unitQ('length') })}</span>
        <button class="pc-btn" disabled={segments === p.segments.length} onclick={remake} data-testid="piece-remake">{t('pieces.remake')}</button>
      </div>
      {#if handLoads && segments !== p.segments.length}<p class="pc-warn">{tp('pieces.handLoadsWarn', { n: handLoads })}</p>{/if}
      <p class="pc-dim">{t('pieces.drawingNote')}</p>

      <div class="pc-block">
        <span class="pc-label">{t('pieces.curveLoads')}</span>
        {#each loads as d (d.id)}
          {@const def = d.data as unknown as CurveLoadDef}
          <div class="pc-row">
            <span>{cases.find((c) => c.id === def.caseId)?.name ?? `#${def.caseId}`}: {fmtQ(def.q, 'distributedLoad')} {unitQ('distributedLoad')} · {dirLabel(def.dir)}</span>
            <button class="pc-x" onclick={() => removeCurveLoad(d.id)} title={t('pieces.removeLoad')}>×</button>
          </div>
        {/each}
        <div class="pc-row">
          <select bind:value={loadCase} data-testid="piece-load-case">{#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
          <QuantityInput value={loadQ} quantity="distributedLoad" cls="pc-num" testid="piece-load-q" onchange={(v) => (loadQ = v)} />
          <select bind:value={loadDir} data-testid="piece-load-dir">
            {#each Object.keys(DIRS) as k (k)}<option value={k}>{t(`pieces.dir.${k}`)}</option>{/each}
          </select>
          <button class="pc-btn" onclick={addLoad} data-testid="piece-load-add">{t('pieces.addLoad')}</button>
        </div>
        <p class="pc-dim">{t('pieces.curveLoadHint')}</p>
      </div>
    {/if}
    {#if message}<p class="pc-msg" data-testid="piece-message">{message}</p>{/if}
    <button class="pc-btn" onclick={() => { uiStore.memberPickScope = 'segment'; }} data-testid="piece-pick-segments">{t('pieces.pickSegments')}</button>
  </section>
{/if}

<style>
  .pc { margin: 6px 8px 10px; padding: 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); display: flex; flex-direction: column; gap: 6px; font-size: 0.74rem; color: var(--st-text-2); }
  header { display: flex; flex-direction: column; gap: 2px; }
  header strong { color: var(--st-text); }
  .pc-dim { color: var(--st-text-3); margin: 0; }
  .pc-warn { color: var(--st-warn, #d9a441); margin: 0; }
  .pc-msg { margin: 0; }
  .pc-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .pc-block { display: flex; flex-direction: column; gap: 4px; }
  .pc-label { font-weight: 600; }
  input[type='number'], select, .pc :global(input.pc-num) { width: 60px; padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; }
  select { width: auto; }
  .pc-btn { align-self: flex-start; padding: 3px 9px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .pc-btn:disabled { opacity: 0.5; cursor: default; }
  .pc-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
</style>
