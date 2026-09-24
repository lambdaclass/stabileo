<script lang="ts">
  /**
   * Cut, merge and clean up — the topology commands over the selection.
   *
   * The rules live in `lib/model/edit/` (cut-members, merge-collinear, cleanup, and the split every
   * cut reduces to). Every button is one undo step and says what it did.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { splitAtNodes, intersectMembers, type CutReport } from '../../lib/model/edit/cut-members';
  import { mergeCollinear } from '../../lib/model/edit/merge-collinear';
  import {
    coincidentNodeGroups, cleanUpModel, mergeCoincidentNodes, removeDuplicateMembers,
    removeOrphanNodes, removeZeroLengthMembers, type CleanupReport,
  } from '../../lib/model/edit/cleanup';

  let parts = $state(2);
  let message = $state<string | null>(null);

  /** Selected members, and the members wholly between selected nodes. */
  const members = $derived.by(() => {
    const nodes = new Set(uiStore.selectedNodes);
    // A selection can outlive the members it named — a merge removes them — so it is read
    // against the model, not trusted.
    const out = new Set([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
    for (const e of modelStore.elements.values()) if (nodes.has(e.nodeI) && nodes.has(e.nodeJ)) out.add(e.id);
    return [...out];
  });
  const scope = $derived(members.length > 0 ? members : [...modelStore.elements.keys()]);
  const scopeText = $derived(members.length > 0
    ? tp('edit.scopeSelected', { n: members.length })
    : tp('edit.scopeAll', { n: modelStore.elements.size }));

  // What the clean-up would find, counted before it runs.
  const findings = $derived.by(() => {
    void modelStore.modelVersion;
    const coincident = coincidentNodeGroups().reduce((s, g) => s + g.length - 1, 0);
    const pairs = new Map<string, number>();
    let duplicates = 0, zero = 0;
    for (const e of modelStore.elements.values()) {
      const k = e.nodeI < e.nodeJ ? `${e.nodeI}-${e.nodeJ}` : `${e.nodeJ}-${e.nodeI}`;
      if (pairs.has(k)) duplicates++; else pairs.set(k, e.id);
      const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
      if (e.nodeI === e.nodeJ || (a && b && Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) <= 1e-4)) zero++;
    }
    return { coincident, duplicates, zero };
  });

  function cutMessage(r: CutReport): string {
    return [
      tp('edit.cutDone', { n: r.cut.length, segments: r.cut.reduce((s, c) => s + c.segments.length, 0), nodes: r.nodes.length }),
      r.reinforcementDropped > 0 ? tp('edit.reinforcementDropped', { n: r.reinforcementDropped }) : '',
    ].filter(Boolean).join(' ');
  }
  function cleanupMessage(r: CleanupReport): string {
    const parts = (Object.entries(r) as Array<[keyof CleanupReport, number]>).filter(([, n]) => n > 0).map(([k, n]) => tp(`edit.clean.${k}`, { n }));
    return parts.length ? parts.join(' ') : t('edit.clean.nothing');
  }

  function doSplitAtNodes() { message = cutMessage(splitAtNodes(scope)); }
  function doIntersect() { message = cutMessage(intersectMembers(scope)); }
  function doSubdivide() {
    const n = Math.floor(parts);
    if (!(n >= 2 && n <= 20)) { message = t('edit.partsRange'); return; }
    modelStore.batch(() => { for (const id of members) modelStore.subdivideElement(id, n); });
    message = tp('edit.subdivided', { n: members.length, parts: n });
  }
  function doMerge() {
    const r = mergeCollinear(scope);
    const refused = Object.entries(r.refused).map(([k, n]) => tp(`edit.refused.${k}`, { n: n ?? 0 })).join(' ');
    message = [
      tp('edit.merged', { chains: r.merged.length, absorbed: r.merged.reduce((s, m) => s + m.absorbed, 0), nodes: r.removedNodes }),
      refused,
      r.reinforcementDropped > 0 ? tp('edit.reinforcementDropped', { n: r.reinforcementDropped }) : '',
    ].filter(Boolean).join(' ');
  }
</script>

<div class="ep" data-testid="edit-panel">
  <p class="ep-scope" data-testid="ep-scope">{scopeText}</p>

  <section>
    <h4>{t('edit.cutTitle')}</h4>
    <div class="ep-row">
      <button onclick={doSplitAtNodes} data-testid="ep-split-nodes">{t('edit.splitAtNodes')}</button>
      <button onclick={doIntersect} data-testid="ep-intersect">{t('edit.intersect')}</button>
    </div>
    <div class="ep-row">
      <label>{t('edit.parts')} <input type="number" min="2" max="20" step="1" bind:value={parts} data-testid="ep-parts" /></label>
      <button onclick={doSubdivide} disabled={members.length === 0} data-testid="ep-subdivide">{t('edit.subdivide')}</button>
    </div>
    <p class="ep-note">{t('edit.cutNote')}</p>
  </section>

  <section>
    <h4>{t('edit.mergeTitle')}</h4>
    <button onclick={doMerge} data-testid="ep-merge">{t('edit.merge')}</button>
    <p class="ep-note">{t('edit.mergeNote')}</p>
  </section>

  <section>
    <h4>{t('edit.cleanTitle')}</h4>
    <ul class="ep-findings">
      <li>{tp('edit.found.coincident', { n: findings.coincident })} <button disabled={findings.coincident === 0} onclick={() => (message = cleanupMessage(mergeCoincidentNodes()))} data-testid="ep-merge-nodes">{t('edit.fix')}</button></li>
      <li>{tp('edit.found.duplicates', { n: findings.duplicates })} <button disabled={findings.duplicates === 0} onclick={() => (message = cleanupMessage(removeDuplicateMembers()))}>{t('edit.fix')}</button></li>
      <li>{tp('edit.found.zero', { n: findings.zero })} <button disabled={findings.zero === 0} onclick={() => (message = cleanupMessage(removeZeroLengthMembers()))}>{t('edit.fix')}</button></li>
      <li>{t('edit.found.orphans')} <button onclick={() => (message = cleanupMessage(removeOrphanNodes()))}>{t('edit.fix')}</button></li>
    </ul>
    <button class="ep-all" onclick={() => (message = cleanupMessage(cleanUpModel()))} data-testid="ep-clean-all">{t('edit.cleanAll')}</button>
  </section>

  {#if message}<p class="ep-done" data-testid="ep-done">{message}</p>{/if}
</div>

<style>
  .ep { display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.72rem; }
  .ep-scope { margin: 0; color: var(--st-text-3); }
  section { display: flex; flex-direction: column; gap: 4px; }
  h4 { margin: 0; font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.04em; }
  .ep-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .ep-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-3); }
  input { width: 50px; padding: 3px 5px; font-size: 0.68rem; background: var(--st-surface); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); text-align: right; }
  button {
    align-self: flex-start; padding: 3px 9px; font-size: 0.68rem; color: var(--st-text); background: var(--st-surface-3);
    border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer;
  }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .ep-all { border-color: var(--st-accent); }
  .ep-findings { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 3px; color: var(--st-text-2); }
  .ep-findings button { margin-left: 6px; padding: 1px 6px; font-size: 0.62rem; }
  .ep-note { margin: 0; color: var(--st-text-3); font-style: italic; font-size: 0.64rem; }
  .ep-done { margin: 0; color: var(--st-ok); }
</style>
