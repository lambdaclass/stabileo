<script lang="ts">
  import { defaultShellMaterial } from '../../lib/pro/design-home';
  import { untrack } from 'svelte';
  /**
   * Cut, merge and clean up — the topology commands over the selection.
   *
   * The rules live in `lib/model/edit/` (cut-members, merge-collinear, cleanup, and the split every
   * cut reduces to). Every button is one undo step and says what it did.
   */
  import { looseParts, freeShellEdges, unconnectedCrossings, repeatedProperties } from '../../lib/model/edit/hygiene';
  import { flipMembers } from '../../lib/model/edit/flip-members';
  import { taperMembers, validateTaper, DEFAULT_TAPER_SEGMENTS, type TaperSpec } from '../../lib/model/edit/taper';
  import { unifyProperties } from '../../lib/model/edit/cleanup';
  import { weldTolerance, setWeldTolerance } from '../../lib/model/weld-tolerance';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { splitAtNodes, intersectMembers, type CutReport } from '../../lib/model/edit/cut-members';
  import { perpendicularMember, midpointMember, fillHoles, constructionPreview } from '../../lib/model/edit/construct';
  import type { Fragment } from '../../lib/model/edit/fragment';
  import { renumber, designDocumentFields, type AxisOrder } from '../../lib/model/edit/renumber';
  import { nextMember } from '../../lib/store/next-member.svelte';
  import { mergeCollinear } from '../../lib/model/edit/merge-collinear';
  import {
    coincidentNodeGroups, cleanUpModel, mergeCoincidentNodes, removeDuplicateMembers,
    removeOrphanNodes, removeZeroLengthMembers, type CleanupReport,
  } from '../../lib/model/edit/cleanup';
  import { editPreview } from '../../lib/store/edit-preview.svelte';
  import { onDestroy } from 'svelte';
  import type { Vec3 } from '../../lib/model/edit/affine';

  let parts = $state(2);
  let message = $state<string | null>(null);
  let fillMaterial = $state(defaultShellMaterial(modelStore.materials));
  let fillThickness = $state(0.15);
  /** Target element size, m; 0 fills each hole with one quad. */
  let fillSize = $state(1.0);
  let order = $state<AxisOrder>('zyx');
  let renumberNodes = $state(true);
  let renumberMembers = $state(true);

  /** New members take the next-member choice, falling back to the model's first. */
  const spec = $derived({
    type: uiStore.elementCreateType,
    materialId: nextMember.resolvedMaterialId,
    sectionId: nextMember.resolvedSectionId,
  });
  const selNodes = $derived([...uiStore.selectedNodes].filter((id) => modelStore.nodes.has(id)));
  const designDocs = $derived.by(() => { void modelStore.modelVersion; return designDocumentFields(); });

  // Before anything is pressed: where "split into N" would cut, and the member a construction
  // would add (perpendicular from the node, or between the two midpoints).
  $effect(() => {
    const n = Math.floor(parts);
    const pts: Vec3[] = [];
    if (n >= 2 && n <= 20) {
      for (const id of members) {
        const e = modelStore.elements.get(id);
        const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
        if (!e || !a || !b || e.arc) continue;
        for (let k = 1; k < n; k++) {
          const f = k / n;
          pts.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f]);
        }
      }
    }
    const bar = selNodes.length === 1 && members.length === 1 ? constructionPreview('perpendicular', selNodes[0]!, members[0]!)
      : selNodes.length === 0 && members.length === 2 ? constructionPreview('midpoints', members[0]!, members[1]!)
        : null;
    const frag: Fragment | null = bar ? {
      nodes: [{ id: 1, x: bar[0][0], y: bar[0][1], z: bar[0][2] }, { id: 2, x: bar[1][0], y: bar[1][1], z: bar[1][2] }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 0, sectionId: 0 } as never],
      quads: [], plates: [], supports: [], loads: [], groups: [], materials: [], sections: [], loadCases: [], local: true,
    } : null;
    if (!frag && pts.length === 0) { editPreview.clear('edit'); return; }
    editPreview.show('edit', frag, frag ? [{ A: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }] : [], pts);
  });
  onDestroy(() => editPreview.clear('edit'));

  function refusal(r: { refused: string }) { message = t(`edit.refused.${r.refused}`); }

  function doPerpendicular() {
    const r = perpendicularMember(selNodes[0]!, members[0]!, spec);
    if ('refused' in r) refusal(r); else message = t('edit.perpendicularDone');
  }
  function doMidpoints() {
    const r = midpointMember(members[0]!, members[1]!, spec);
    if ('refused' in r) refusal(r); else message = t('edit.midpointDone');
  }
  function doFill() {
    const r = fillHoles(scope, fillMaterial, fillThickness, fillSize > 0 ? { density: { mode: 'targetSize', size: fillSize } } : {});
    if ('refused' in r) { refusal(r); return; }
    message = tp('edit.filled', { quads: r.quads.length, plates: r.plates.length, skipped: r.skippedExisting })
      + (r.openings > 0 ? ` ${tp('edit.filledOpenings', { n: r.openings })}` : '');
  }
  let renumberShells = $state(false);
  let renumberOnlySel = $state(false);
  let renumberFrom = $state<number | null>(null);
  function doRenumber() {
    const only = renumberOnlySel ? { nodes: new Set(uiStore.selectedNodes), elements: new Set(uiStore.selectedElements), shells: new Set(uiStore.selectedShells) } : undefined;
    const r = renumber({ nodes: renumberNodes, members: renumberMembers, shells: renumberShells, order, only, ...(renumberFrom && renumberFrom > 0 ? { start: Math.floor(renumberFrom) } : {}) });
    if ('refused' in r) {
      message = r.refused === 'hasDesignDocuments'
        ? tp('edit.renumberRefused', { fields: r.fields.join(', ') })
        : tp('edit.renumberCollision', { kind: t(`edit.kind.${r.kind}`), ids: r.ids.slice(0, 12).join(', ') + (r.ids.length > 12 ? '…' : '') });
      return;
    }
    message = tp('edit.renumbered', { nodes: r.changedNodes, members: r.changedMembers }) + (r.changedShells ? ` ${tp('edit.renumberedShells', { n: r.changedShells })}` : '');
  }

  // ── Model hygiene: found, then selected or fixed ──
  const hygieneModel = () => ({
    nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates,
    supports: modelStore.supports, connectors: modelStore.model.connectors, constraints: modelStore.model.constraints as never,
    materials: modelStore.materials, sections: modelStore.sections,
  });
  const hygiene = $derived.by(() => {
    void modelStore.modelVersion;
    const m = hygieneModel();
    return { loose: looseParts(m as never), edges: freeShellEdges(m as never), crossings: unconnectedCrossings(modelStore.elements.keys()), repeated: repeatedProperties(m as never) };
  });
  function selectLoose() {
    uiStore.setSelection(new Set(hygiene.loose.flatMap((p) => p.nodes)), new Set(hygiene.loose.flatMap((p) => p.elements)), true);
  }
  function selectEdges() { uiStore.selectMode = 'nodes'; uiStore.setSelection(new Set(hygiene.edges.flat()), new Set(), true); }
  function selectCrossings() { uiStore.selectMode = 'elements'; uiStore.setSelection(new Set(), new Set(hygiene.crossings.flatMap((c) => [c.a, c.b])), true); }
  function doFlip() {
    const r = flipMembers(members);
    message = tp('edit.flipped', { n: r.flipped.length }) + (r.skipped.length ? ` ${tp('edit.flipSkipped', { n: r.skipped.length })}` : '');
  }

  // ── Taper: welded I from depth hI at end I to hJ at end J, in prismatic segments ──
  let taper = $state({ hI: 600, hJ: 300, b: 200, tf: 12, tw: 8, segments: DEFAULT_TAPER_SEGMENTS });
  /** Start from the first selected member's own I, when it has one. */
  $effect(() => {
    const first = members[0];
    const sec = first != null ? modelStore.sections.get(modelStore.elements.get(first)?.sectionId ?? -1) : undefined;
    if (sec && (sec.shape === 'I' || sec.shape === 'H') && sec.h && sec.b && sec.tf && sec.tw) {
      const mm = (v: number) => Math.round(v * 10000) / 10;
      untrack(() => { taper = { ...taper, hI: mm(sec.h!), hJ: mm(sec.h! / 2), b: mm(sec.b!), tf: mm(sec.tf!), tw: mm(sec.tw!) }; });
    }
  });
  const taperSpec = $derived<TaperSpec>({ hI: taper.hI / 1000, hJ: taper.hJ / 1000, b: taper.b / 1000, tf: taper.tf / 1000, tw: taper.tw / 1000, segments: taper.segments });
  const taperProblems = $derived(validateTaper(taperSpec));
  function doTaper() {
    const r = taperMembers(members, taperSpec);
    message = tp('edit.tapered', { n: r.tapered.length / taperSpec.segments, s: r.sections }) + (r.skipped.length ? ` ${tp('edit.flipSkipped', { n: r.skipped.length })}` : '');
  }

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
  /** The weld tolerance, mm on screen; every weld reads it (`model/weld-tolerance.ts`). */
  let weldMm = $state(weldTolerance() * 1000);
  const findings = $derived.by(() => {
    void weldMm;
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

<div class="pk ep" data-testid="edit-panel">
  <p class="pk-hint ep-scope" data-testid="ep-scope">{scopeText}</p>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.cutTitle')}</h4>
    <div class="pk-row ep-row">
      <button class="pk-btn" onclick={doSplitAtNodes} data-testid="ep-split-nodes">{t('edit.splitAtNodes')}</button>
      <button class="pk-btn" onclick={doIntersect} data-testid="ep-intersect">{t('edit.intersect')}</button>
    </div>
    <div class="pk-row ep-row">
      <label>{t('edit.parts')} <input type="number" min="2" max="20" step="1" bind:value={parts} data-testid="ep-parts" /></label>
      <button class="pk-btn" onclick={doSubdivide} disabled={members.length === 0} data-testid="ep-subdivide">{t('edit.subdivide')}</button>
    </div>
    <p class="pk-hint">{t('edit.cutNote')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.mergeTitle')}</h4>
    <button class="pk-btn" onclick={doMerge} data-testid="ep-merge">{t('edit.merge')}</button>
    <p class="pk-hint">{t('edit.mergeNote')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.constructTitle')}</h4>
    <div class="pk-row ep-row">
      <button class="pk-btn" onclick={doPerpendicular} disabled={selNodes.length !== 1 || members.length !== 1} data-testid="ep-perpendicular">{t('edit.perpendicular')}</button>
      <button class="pk-btn" onclick={doMidpoints} disabled={members.length !== 2} data-testid="ep-midpoints">{t('edit.midpoints')}</button>
    </div>
    <p class="pk-hint">{t('edit.constructNote')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.fillTitle')}</h4>
    <div class="pk-row ep-row">
      <select bind:value={fillMaterial} aria-label={t('edit.fillMaterial')}>{#each [...modelStore.materials.values()] as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
      <label>{t('edit.thickness')} <input type="number" min="0.01" step="0.01" bind:value={fillThickness} /></label>
      <label>{t('edit.fillSize')} <input type="number" min="0" step="0.25" bind:value={fillSize} /></label>
      <button class="pk-btn" onclick={doFill} disabled={scope.length < 3} data-testid="ep-fill">{t('edit.fill')}</button>
    </div>
    <p class="pk-hint">{t('edit.fillNote')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.renumberTitle')}</h4>
    <div class="pk-row ep-row">
      <select bind:value={order} aria-label={t('edit.order')}>
        <option value="zyx">{t('edit.order.zyx')}</option><option value="zxy">{t('edit.order.zxy')}</option>
        <option value="xyz">{t('edit.order.xyz')}</option><option value="yxz">{t('edit.order.yxz')}</option>
      </select>
      <label class="pk-check"><input type="checkbox" bind:checked={renumberNodes} /> {t('edit.renumberNodes')}</label>
      <label class="pk-check"><input type="checkbox" bind:checked={renumberMembers} /> {t('edit.renumberMembers')}</label>
      <label class="pk-check"><input type="checkbox" bind:checked={renumberShells} data-testid="ep-renumber-shells" /> {t('edit.renumberShells')}</label>
    </div>
    <div class="pk-row ep-row">
      <label class="pk-check"><input type="checkbox" bind:checked={renumberOnlySel} data-testid="ep-renumber-selection" /> {t('edit.renumberOnlySelection')}</label>
      <label>{t('edit.renumberFrom')} <input type="number" min="1" step="1" bind:value={renumberFrom} placeholder="1" data-testid="ep-renumber-from" /></label>
      <button class="pk-btn" onclick={doRenumber} disabled={designDocs.length > 0 || (!renumberNodes && !renumberMembers && !renumberShells)} data-testid="ep-renumber">{t('edit.renumber')}</button>
    </div>
    <p class="pk-hint">{designDocs.length > 0 ? tp('edit.renumberRefused', { fields: designDocs.join(', ') }) : t('edit.renumberNote')}</p>
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('edit.cleanTitle')}</h4>
    <label class="pk-row ep-weld">{t('edit.weldTol')}
      <input type="number" min="0.001" max="100" step="0.1" value={weldMm} onchange={(e) => (weldMm = setWeldTolerance(Number(e.currentTarget.value) / 1000) * 1000)} data-testid="ep-weld-tol" /> mm
    </label>
    <ul class="ep-findings">
      <li>{tp('edit.found.coincident', { n: findings.coincident })} <button class="pk-btn" disabled={findings.coincident === 0} onclick={() => (message = cleanupMessage(mergeCoincidentNodes()))} data-testid="ep-merge-nodes">{t('edit.fix')}</button></li>
      <li>{tp('edit.found.duplicates', { n: findings.duplicates })} <button class="pk-btn" disabled={findings.duplicates === 0} onclick={() => (message = cleanupMessage(removeDuplicateMembers()))}>{t('edit.fix')}</button></li>
      <li>{tp('edit.found.zero', { n: findings.zero })} <button class="pk-btn" disabled={findings.zero === 0} onclick={() => (message = cleanupMessage(removeZeroLengthMembers()))}>{t('edit.fix')}</button></li>
      <li>{t('edit.found.orphans')} <button class="pk-btn" onclick={() => (message = cleanupMessage(removeOrphanNodes()))}>{t('edit.fix')}</button></li>
      <li data-testid="ep-hyg-loose">{tp('edit.found.loose', { n: hygiene.loose.length })} <button class="pk-btn" disabled={hygiene.loose.length === 0} onclick={selectLoose}>{t('edit.select')}</button></li>
      <li data-testid="ep-hyg-edges">{tp('edit.found.freeEdges', { n: hygiene.edges.length })} <button class="pk-btn" disabled={hygiene.edges.length === 0} onclick={selectEdges}>{t('edit.select')}</button></li>
      <li data-testid="ep-hyg-crossings">{tp('edit.found.crossings', { n: hygiene.crossings.length })} <button class="pk-btn" disabled={hygiene.crossings.length === 0} onclick={selectCrossings}>{t('edit.select')}</button></li>
      <li data-testid="ep-hyg-repeated">{tp('edit.found.repeated', { m: hygiene.repeated.materials.reduce((s, g) => s + g.length - 1, 0), s: hygiene.repeated.sections.reduce((s, g) => s + g.length - 1, 0) })}
        <button class="pk-btn" disabled={hygiene.repeated.materials.length + hygiene.repeated.sections.length === 0}
          onclick={() => { const n = unifyProperties('materials', hygiene.repeated.materials) + unifyProperties('sections', hygiene.repeated.sections); message = tp('edit.unified', { n }); }} data-testid="ep-unify">{t('edit.unify')}</button></li>
    </ul>
    <div class="pk-row"><button class="pk-btn" disabled={members.length === 0} onclick={doFlip} data-testid="ep-flip">{tp('edit.flip', { n: members.length })}</button></div>
    <button class="pk-btn pk-btn-primary" onclick={() => (message = cleanupMessage(cleanUpModel()))} data-testid="ep-clean-all">{t('edit.cleanAll')}</button>
  </section>

  <section class="pk-card" data-testid="ep-taper">
    <h4 class="pk-heading">{t('edit.taperTitle')}</h4>
    <p class="ep-note">{t('edit.taperNote')}</p>
    <div class="pk-row ep-row">
      {#each ['hI', 'hJ', 'b', 'tf', 'tw'] as k (k)}
        <label>{k}<input type="number" min="1" step="1" value={taper[k as 'hI']} data-testid="ep-taper-{k}"
          onchange={(e) => (taper = { ...taper, [k]: Number(e.currentTarget.value) })} /></label>
      {/each}
      <span class="ep-unit">mm</span>
      <label>{t('edit.taperSegments')}<input type="number" min="2" max="50" step="1" value={taper.segments} data-testid="ep-taper-n"
        onchange={(e) => (taper = { ...taper, segments: Number(e.currentTarget.value) })} /></label>
    </div>
    {#if taperProblems.length}<p class="ep-note warn">{taperProblems.map((p) => t(`edit.taperProblem.${p}`)).join(' ')}</p>{/if}
    <div class="pk-row"><button class="pk-btn" disabled={members.length === 0 || taperProblems.length > 0} onclick={doTaper} data-testid="ep-taper-go">{tp('edit.taperGo', { n: members.length })}</button></div>
  </section>

  {#if message}<p class="pk-ok" data-testid="ep-done">{message}</p>{/if}
</div>

<style>
  .ep-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-3); }
  .ep-row input[type='number'] { width: 56px; text-align: right; }
  .ep-note { margin: 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.35; }
  .ep-note.warn { color: var(--st-warn); }
  .ep-unit { color: var(--st-text-3); font-size: 0.64rem; }
  .ep-findings { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 4px; color: var(--st-text-2); }
  .ep-findings li { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .ep-findings :global(.pk-btn) { min-height: 20px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
</style>
