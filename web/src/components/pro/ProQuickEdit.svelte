<script lang="ts">
  import { parseDecimal } from '../../lib/utils/numeric-input';
  /**
   * PRO's double-click editor: what Basic's node and member cards offer, in PRO's terms, and a
   * card for shells, which Basic does not have.
   *
   *   node     its coordinates
   *   member   section, material, axial behaviour, the two ends (rigid or pinned) and β
   *   shell    its nodes, material and thickness; turning it over, which flips its local axes
   *            when they point the unwanted way; and, for a quad, meshing it into a grid
   *
   * Each change is one undo step, written through the store like every PRO panel, so the card
   * needs no OK. What a member is told beyond this is one press away, in Specifications.
   * Placed and dragged by `EditorCard`, the frame Basic's cards share.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import EditorCard from '../EditorCard.svelte';
  import { quickEdit } from '../../lib/store/pro-quick-edit.svelte';
  import { AXIAL_CHOICES, axialOf, setAxial, type Axial } from '../../lib/pro/member-axial';
  import { meshQuad } from '../../lib/model/edit/mesh-region';
  import { parseIdList } from '../../lib/model/select-ops';

  const target = $derived(quickEdit.target);
  const node = $derived(target?.kind === 'node' ? modelStore.nodes.get(target.id) : undefined);
  const member = $derived(target?.kind === 'member' ? modelStore.elements.get(target.id) : undefined);
  const shell = $derived(target?.kind === 'plate' ? modelStore.plates.get(target.id)
    : target?.kind === 'quad' ? modelStore.quads.get(target.id) : undefined);
  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);

  // A target deleted under the card (undo, Delete) closes it.
  $effect(() => { if (target && !node && !member && !shell) quickEdit.close(); });

  // Escape closes it wherever the focus is: the global shortcuts skip a focused select or input.
  $effect(() => {
    if (!target) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') quickEdit.close(); };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  });

  const title = $derived(
    node ? `${t('pro.thNode')} ${node.id}`
      : member ? `${t('pro.oneElement')} ${member.id}`
      : shell ? `${t(target?.kind === 'plate' ? 'quickEdit.plate' : 'quickEdit.quad')} ${shell.id}`
      : '',
  );

  const num = (v: string) => parseDecimal(v);
  const AXIAL_LABEL: Record<Axial, string> = {
    frame: 'spec.axial.frame', truss: 'spec.axial.truss', tensionOnly: 'behaviour.tensionOnly',
    compressionOnly: 'behaviour.compressionOnly', cable: 'spec.axial.cable', inactive: 'behaviour.inactive',
  };

  // ── Node ──
  function setCoord(k: 'x' | 'y' | 'z', v: string) {
    if (!node) return;
    const n = num(v);
    if (n === null) return;
    const p = { x: node.x, y: node.y, z: node.z ?? 0, [k]: n };
    modelStore.updateNode(node.id, p.x, p.y, p.z);
  }

  // ── Member ends: rigid, pinned (both bending moments released), or something else ──
  type EndKind = 'fixed' | 'pinned' | 'other';
  function endOf(end: 'start' | 'end'): EndKind {
    const r = end === 'start' ? member?.releaseI : member?.releaseJ;
    const j = (end === 'start' ? member?.jointI : member?.jointJ)?.dof?.some(Boolean);
    if (!r?.my && !r?.mz && !r?.t && !j) return 'fixed';
    if (r?.my && r?.mz && !r?.t && !j) return 'pinned';
    return 'other';
  }
  function setEnd(end: 'start' | 'end', k: EndKind) {
    if (!member || k === 'other' || endOf(end) === k) return;
    const cur = end === 'start' ? member.releaseI : member.releaseJ;
    const next = { ...cur, my: k === 'pinned', mz: k === 'pinned', t: false };
    modelStore.updateElement(member.id, end === 'start' ? { releaseI: next } : { releaseJ: next });
  }
  function setRoll(v: string) {
    if (!member) return;
    const n = num(v);
    if (n === null) return;
    modelStore.updateElement(member.id, { rollAngle: n === 0 ? undefined : n });
  }
  function openSpec() {
    if (!member) return;
    uiStore.specSection = 'members';
    uiStore.proActiveTab = 'specifications';
    uiStore.proPanelVisible = true;
    uiStore.setSelection(new Set(), new Set([member.id]));
    quickEdit.close();
  }

  // ── Shell ──
  let nodesError = $state<string | null>(null);
  function setShellNodes(v: string) {
    if (!shell || !target) return;
    const want = target.kind === 'plate' ? 3 : 4;
    const { ids, bad } = parseIdList(v);
    if (bad.length > 0 || ids.length !== want || new Set(ids).size !== want || ids.some((id) => !modelStore.nodes.has(id))) {
      nodesError = tp('quickEdit.nodesInvalid', { n: want });
      return;
    }
    nodesError = null;
    if (target.kind === 'plate') modelStore.updatePlateNodes(shell.id, ids as [number, number, number]);
    else modelStore.updateQuadNodes(shell.id, ids as [number, number, number, number]);
  }
  /** The same corners the other way round: the local z, and with it the face, turns over. */
  function flip() {
    if (!shell || !target) return;
    const [a, ...rest] = shell.nodes;
    const nodes = [a!, ...rest.reverse()];
    if (target.kind === 'plate') modelStore.updatePlateNodes(shell.id, nodes as [number, number, number]);
    else modelStore.updateQuadNodes(shell.id, nodes as [number, number, number, number]);
  }
  function setShell(patch: { materialId?: number; thickness?: number }) {
    if (!shell || !target) return;
    if (target.kind === 'plate') modelStore.updatePlate(shell.id, patch);
    else modelStore.updateQuad(shell.id, patch);
  }

  /**
   * Mesh a quad into a grid of the size given, welded to the members around it; one undo step.
   * The mesh keeps the quad's loads and groups (`meshQuad`); a region the mesher refuses leaves
   * the quad as it was.
   */
  let meshSize = $state(0.5);
  let meshNote = $state<string | null>(null);
  function mesh() {
    if (!shell || target?.kind !== 'quad' || !(meshSize > 0)) return;
    const r = meshQuad(shell.id, { density: { mode: 'targetSize', size: meshSize }, splitBeams: true });
    if (!r) return;
    if ('refused' in r) { uiStore.toast(t(r.refused === 'occupied' ? 'mesher.occupied' : 'mesher.failed'), 'error'); return; }
    meshNote = tp('quickEdit.meshed', { n: r.quadCount });
    uiStore.toast(meshNote, 'success');
    quickEdit.close();
  }
</script>

{#if target && (node || member || shell)}
  <EditorCard {title} anchor={quickEdit.at} onClose={() => quickEdit.close()}
    testid="quick-edit">
    <div class="qe">
      {#if node}
        <div class="qe-grid3">
          {#each ['x', 'y', 'z'] as const as k (k)}
            <label class="qe-field"><span>{k.toUpperCase()} (m)</span>
              <input type="number" step="any" value={k === 'z' ? (node.z ?? 0) : node[k]}
                onchange={(e) => setCoord(k, e.currentTarget.value)} data-testid="qe-node-{k}" />
            </label>
          {/each}
        </div>
      {:else if member}
        <label class="qe-field"><span>{t('pro.thSection')}</span>
          <select value={member.sectionId} onchange={(e) => modelStore.updateElementSection(member.id, Number(e.currentTarget.value))} data-testid="qe-section">
            {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
        <label class="qe-field"><span>{t('pro.thMaterial')}</span>
          <select value={member.materialId} onchange={(e) => modelStore.updateElementMaterial(member.id, Number(e.currentTarget.value))} data-testid="qe-material">
            {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
          </select>
        </label>
        <label class="qe-field"><span>{t('spec.members.axial')}</span>
          <select value={axialOf(member)} onchange={(e) => setAxial([member.id], e.currentTarget.value as Axial)} data-testid="qe-axial">
            {#each AXIAL_CHOICES as a (a)}<option value={a}>{t(AXIAL_LABEL[a])}</option>{/each}
          </select>
        </label>
        <div class="qe-grid2">
          {#each [['start', 'stress.endI'], ['end', 'stress.endJ']] as const as [end, key] (end)}
            <label class="qe-field"><span>{t(key)}</span>
              <select value={endOf(end)} onchange={(e) => setEnd(end, e.currentTarget.value as EndKind)} data-testid="qe-end-{end}">
                <option value="fixed">{t('quickEdit.endFixed')}</option>
                <option value="pinned">{t('quickEdit.endPinned')}</option>
                {#if endOf(end) === 'other'}<option value="other" disabled>{t('quickEdit.endOther')}</option>{/if}
              </select>
            </label>
          {/each}
        </div>
        <label class="qe-field qe-narrow"><span>β (°)</span>
          <input type="number" step="any" value={member.rollAngle ?? 0} onchange={(e) => setRoll(e.currentTarget.value)} data-testid="qe-roll" />
        </label>
        <button class="qe-link" onclick={openSpec} data-testid="qe-open-spec">{t('quickEdit.moreInSpec')}</button>
      {:else if shell}
        <label class="qe-field"><span>{t('quickEdit.nodes')}</span>
          <input type="text" value={shell.nodes.join(', ')} onchange={(e) => setShellNodes(e.currentTarget.value)} data-testid="qe-shell-nodes" />
        </label>
        {#if nodesError}<p class="qe-err" role="alert">{nodesError}</p>{/if}
        <div class="qe-grid2">
          <label class="qe-field"><span>{t('pro.thMaterial')}</span>
            <select value={shell.materialId} onchange={(e) => setShell({ materialId: Number(e.currentTarget.value) })} data-testid="qe-shell-material">
              {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
            </select>
          </label>
          <label class="qe-field"><span>{t('pro.thickness')}</span>
            <input type="number" step="0.01" min="0.001" value={shell.thickness}
              onchange={(e) => { const v = num(e.currentTarget.value); if (v && v > 0) setShell({ thickness: v }); }} data-testid="qe-shell-thickness" />
          </label>
        </div>
        <button class="qe-btn" onclick={flip} title={t('quickEdit.flipHint')} data-testid="qe-flip">{t('quickEdit.flip')}</button>
        {#if target.kind === 'quad'}
          <div class="qe-row">
            <label class="qe-field qe-narrow"><span>{t('quickEdit.meshSize')}</span>
              <input type="number" step="0.1" min="0.05" bind:value={meshSize} data-testid="qe-mesh-size" />
            </label>
            <button class="qe-btn" onclick={mesh} disabled={!(meshSize > 0)} data-testid="qe-mesh">{t('quickEdit.mesh')}</button>
          </div>
          <p class="qe-hint">{t('quickEdit.meshHint')}</p>
        {/if}
      {/if}
    </div>
  </EditorCard>
{/if}

<style>
  .qe { display: flex; flex-direction: column; gap: 8px; font-size: 0.72rem; color: var(--st-text-2); min-width: 230px; }
  .qe-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .qe-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .qe-row { display: flex; align-items: flex-end; gap: 8px; }
  .qe-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .qe-field > span { font-size: 0.64rem; color: var(--st-text-3); }
  .qe-narrow { max-width: 7rem; }
  .qe select, .qe input {
    box-sizing: border-box; width: 100%; height: 26px; padding: 0 6px;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit;
  }
  .qe input[type='number'] { font-family: var(--st-mono); text-align: right; }
  .qe-btn {
    height: 26px; padding: 0 10px; background: none; color: var(--st-text-2);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; white-space: nowrap;
  }
  .qe-btn:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-accent); }
  .qe-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .qe-link { align-self: flex-start; background: none; border: none; padding: 0; color: var(--st-text-2); text-decoration: underline; font: inherit; cursor: pointer; }
  .qe-link:hover { color: var(--st-text); }
  .qe-hint { margin: 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.4; }
  .qe-err { margin: 0; font-size: 0.66rem; color: var(--st-danger); }
</style>
