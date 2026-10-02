<script lang="ts">
  /**
   * The quick card: with it on, clicking one node or one member shows what it is and what it
   * carries, in the units chosen, without opening an editor. A node: its coordinates, support,
   * displacement and reaction. A member: its ends, length, section, material and its largest
   * end forces in the result set on screen.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { viewState } from '../../lib/store/view-state.svelte';
  import { fmtQ, unitQ } from '../../lib/store/display-units.svelte';

  const node = $derived(viewState.quickInfo && uiStore.selectedNodes.size === 1 && uiStore.selectedElements.size === 0 ? modelStore.nodes.get([...uiStore.selectedNodes][0]!) : undefined);
  const elem = $derived(viewState.quickInfo && uiStore.selectedElements.size === 1 && uiStore.selectMode !== 'shells' ? modelStore.elements.get([...uiStore.selectedElements][0]!) : undefined);
  const r = $derived(resultsStore.results3D);
  const disp = $derived(node && r ? r.displacements.find((d) => d.nodeId === node.id) : undefined);
  const reac = $derived(node && r ? r.reactions.find((d) => d.nodeId === node.id) : undefined);
  const support = $derived(node ? [...modelStore.supports.values()].find((s) => s.nodeId === node.id) : undefined);
  const ef = $derived(elem && r ? r.elementForces.find((f) => f.elementId === elem.id) : undefined);
  const length = $derived.by(() => {
    if (!elem) return 0;
    const a = modelStore.nodes.get(elem.nodeI), b = modelStore.nodes.get(elem.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  });
  const peak = (a: number, b: number) => (Math.abs(a) >= Math.abs(b) ? a : b);
</script>

{#if node || elem}
  <div class="qi" data-testid="quick-info">
    {#if node}
      <div class="qi-title">{t('quick.node')} {node.id}</div>
      <div>x, y, z = {fmtQ(node.x, 'length')}; {fmtQ(node.y, 'length')}; {fmtQ(node.z ?? 0, 'length')} {unitQ('length')}</div>
      {#if support}<div>{t('quick.support')}: {support.type}</div>{/if}
      {#if disp}<div>u = {fmtQ(disp.ux, 'displacement')}; {fmtQ(disp.uy, 'displacement')}; {fmtQ(disp.uz, 'displacement')} {unitQ('displacement')}</div>{/if}
      {#if reac}<div>R = {fmtQ(reac.fx, 'force')}; {fmtQ(reac.fy, 'force')}; {fmtQ(reac.fz, 'force')} {unitQ('force')}</div>{/if}
    {:else if elem}
      <div class="qi-title">{t('quick.member')} {elem.id} · {elem.type}</div>
      <div>{elem.nodeI} → {elem.nodeJ} · L = {fmtQ(length, 'length')} {unitQ('length')}</div>
      <div>{modelStore.sections.get(elem.sectionId)?.name ?? elem.sectionId} · {modelStore.materials.get(elem.materialId)?.name ?? elem.materialId}</div>
      {#if ef}
        <div>N = {fmtQ(peak(ef.nStart, ef.nEnd), 'force')} · Vy = {fmtQ(peak(ef.vyStart, ef.vyEnd), 'force')} · Vz = {fmtQ(peak(ef.vzStart, ef.vzEnd), 'force')} {unitQ('force')}</div>
        <div>My = {fmtQ(peak(ef.myStart, ef.myEnd), 'moment')} · Mz = {fmtQ(peak(ef.mzStart, ef.mzEnd), 'moment')} · T = {fmtQ(peak(ef.mxStart, ef.mxEnd), 'moment')} {unitQ('moment')}</div>
        <div class="qi-hint">{t('quick.endsHint')}</div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .qi { position: absolute; left: 12px; top: 12px; z-index: 20; max-width: 300px; padding: 8px 10px; border-radius: 6px;
    background: rgba(20, 24, 38, 0.88); border: 1px solid rgba(255, 255, 255, 0.14); color: #e6e9f0; font-size: 11px; line-height: 1.45; pointer-events: none; }
  .qi-title { font-weight: 600; margin-bottom: 2px; }
  .qi-hint { opacity: 0.6; font-size: 10px; }
</style>
