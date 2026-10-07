<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { inspectMember, inspectNode } from '../lib/canvas/draw-despiece';
  import { inspectMember3D, inspectNode3D } from '../lib/three/despiece-3d';
  import { displayUnits, unitQ } from '../lib/store/display-units.svelte';
  import { formatValue } from '../lib/utils/units';

  const inspect = $derived(uiStore.despieceInspect);
  const is3D = $derived(uiStore.is3DWorkspace);
  const active = $derived(resultsStore.diagramType === 'despiece' && inspect !== null);

  function args2D() {
    return {
      elements: [...modelStore.elements.values()].map(e => ({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ })),
      getNode: (id: number) => { const n = modelStore.getNode(id); return n ? { x: n.x, y: n.y } : undefined; },
      getElementForces: (id: number) => {
        const f = resultsStore.getElementForces(id);
        return f ? { elementId: f.elementId, nStart: f.nStart, nEnd: f.nEnd, vStart: f.vStart, vEnd: f.vEnd, mStart: f.mStart, mEnd: f.mEnd } : undefined;
      },
      basis: uiStore.despieceBasis,
    };
  }
  function args3D() {
    return {
      elements: [...modelStore.elements.values()].map(e => ({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, localYx: e.localYx, localYy: e.localYy, localYz: e.localYz, rollAngle: e.rollAngle,
        // The solver adds the section's rotation to the roll, and so do the drawn arrows.
        sectionRotation: modelStore.sections.get(e.sectionId)?.rotation })),
      getNode: (id: number) => { const n = modelStore.getNode(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : undefined; },
      getForces: (id: number) => resultsStore.getElementForces3D(id),
      basis: uiStore.despieceBasis,
      leftHand: uiStore.axisConvention3D === 'leftHand',
    };
  }

  // Aggregate the member-end actions (basis-aware), 2D or 3D.
  const actions = $derived.by<Array<{ elementId: number; end: 'I' | 'J'; nodeId: number; components: Array<{ label: string; value: number }> }>>(() => {
    if (!active || !inspect) return [];
    if (is3D) {
      return inspect.type === 'member' ? (inspectMember3D(args3D(), inspect.id)?.ends ?? []) : inspectNode3D(args3D(), inspect.id).actions;
    }
    return inspect.type === 'member' ? (inspectMember(args2D(), inspect.id)?.ends ?? []) : inspectNode(args2D(), inspect.id).actions;
  });

  // Support reaction at the inspected node (3D), if present and shown — one line.
  const nodeReaction = $derived.by(() => {
    if (!active || !inspect || inspect.type !== 'node' || !is3D || !resultsStore.showReactions) return null;
    const r = (resultsStore.results3D?.reactions ?? []).find(x => x.nodeId === inspect.id);
    return r ? `Fx ${fmt(r.fx, 'force')}  Fy ${fmt(r.fy, 'force')}  Fz ${fmt(r.fz, 'force')} ${unitQ('force')}` : null;
  });

  /*
   * In the chosen unit system, two decimals unless the reader set others for
   * the quantity. M, My, Mz and T are moments; N, V and the F components forces.
   */
  const qtyOf = (label: string): 'force' | 'moment' => (label.startsWith('M') || label === 'T' ? 'moment' : 'force');
  const fmt = (v: number, q: 'force' | 'moment') => formatValue(v, q, uiStore.unitSystem, displayUnits.decimals[q] ?? 2);
  function close() { uiStore.despieceInspect = null; }

  // Keep the panel clear of the app header + floating toolbar, both of which sit
  // above the viewport with a higher z-index and a DYNAMIC height (the toolbar
  // grows when tool-options are shown). Measure their bottom edges live instead
  // of hardcoding a fragile pixel value. Falls back to a safe default if neither
  // element is present.
  let topPx = $state(70);
  $effect(() => {
    if (!active) return;
    const measure = () => {
      const headerBottom = (document.querySelector('.app-header') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 50;
      const ftBottom = (document.querySelector('.floating-tools') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 0;
      topPx = Math.round(Math.max(headerBottom, ftBottom) + 10);
    };
    measure();
    const ft = document.querySelector('.floating-tools');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ft && ro) ro.observe(ft);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  });
</script>

{#if active && inspect}
  <div class="dsp-inspect">
    <div class="dsp-head">
      <span class="dsp-title">
        {inspect.type === 'node' ? t('despiece.inspectNode').replace('{id}', String(inspect.id)) : t('despiece.inspectMember').replace('{id}', String(inspect.id))}
        <span class="dsp-basis">({uiStore.despieceBasis === 'global' ? t('despiece.basisGlobal') : t('despiece.basisLocal')})</span>
      </span>
      <button class="dsp-close" onclick={close} title={t('editor.cancel')}>✕</button>
    </div>
    {#if actions.length === 0}
      <div class="dsp-empty">{t('despiece.inspectEmpty')}</div>
    {:else}
      <table class="dsp-table">
        <thead>
          <tr><th>{t('despiece.colMember')}</th>{#each actions[0].components as c}<th>{c.label} ({unitQ(qtyOf(c.label))})</th>{/each}</tr>
        </thead>
        <tbody>
          {#each actions as a}
            <tr>
              <td>E{a.elementId}·{a.end} <span class="dsp-node">(n{a.nodeId})</span></td>
              {#each a.components as c}<td>{fmt(c.value, qtyOf(c.label))}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if nodeReaction}
      <div class="dsp-react">{t('despiece.legendReaction')}: {nodeReaction}</div>
    {/if}
  </div>
{/if}

<style>
  .dsp-inspect {
    position: fixed;
    top: 70px;
    right: 14px;
    z-index: 60;
    background: var(--st-surface-2);
    border: 1px solid var(--st-surface-3);
    border-radius: 6px;
    padding: 8px 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 210px;
    max-width: 320px;
    font-size: 0.72rem;
    color: var(--st-text);
  }
  .dsp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .dsp-title { font-weight: 600; color: var(--st-value); }
  .dsp-basis { color: var(--st-text-3); font-weight: 400; font-size: 0.68rem; }
  .dsp-close { background: none; border: none; color: var(--st-text-2); cursor: pointer; font-size: 0.8rem; line-height: 1; }
  .dsp-close:hover { color: var(--st-text); }
  .dsp-empty { color: var(--st-text-3); font-style: italic; }
  .dsp-table { border-collapse: collapse; width: 100%; }
  .dsp-table th, .dsp-table td { text-align: right; padding: 1px 6px; }
  .dsp-table th:first-child, .dsp-table td:first-child { text-align: left; }
  .dsp-table th { color: var(--st-text-3); font-weight: 600; border-bottom: 1px solid var(--st-surface-3); }
  .dsp-node { color: var(--st-text-3); }
  .dsp-react { margin-top: 5px; padding-top: 4px; border-top: 1px solid var(--st-surface-3); color: var(--st-ok); }
</style>
