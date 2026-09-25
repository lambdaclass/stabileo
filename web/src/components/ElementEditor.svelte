<script lang="ts">
  /**
   * The member card, opened by double-clicking a member.
   *
   * ── Live, with a way back ────────────────────────────────────────
   * Every change goes into the model as it is made — with live calc on the
   * results follow at once — and closing keeps them. Reset puts the member
   * back as it was when the card opened: its material, section, ends, sense
   * and the loads on it. It used to collect the changes and apply them on OK,
   * so nothing could be seen until the card was gone, and Cancel was the only
   * way back.
   *
   * One undo step covers everything done while the card is open.
   */
  import { modelStore, uiStore, historyStore } from '../lib/store';
  import type { Element, Load, Release } from '../lib/store/model.svelte';
  import { t } from '../lib/i18n';
  import EditorCard from './EditorCard.svelte';
  import EndConditionSelect from './EndConditionSelect.svelte';

  const elemId = $derived(uiStore.editingElementId);
  const elem = $derived(elemId !== null ? modelStore.elements.get(elemId) : undefined);
  const rawPos = $derived(uiStore.editScreenPos);
  const is3DMode = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  /* Position, clamping and dragging belong to `EditorCard`. */
  const pos = $derived(rawPos);

  // Basic 3D internal joint — six released relative-DOF masks per end.
  const DOF3D_LABELS = ['dx', 'dy', 'dz', 'θx', 'θy', 'θz'];

  /* The member as the card found it, and the loads on it — what Reset returns to. */
  let original: { id: number; element: Element; loads: Load[] } | null = null;
  let recorded = false;
  $effect(() => {
    const id = elemId;
    if (id === null) { original = null; return; }
    if (original?.id === id) return;
    const el = modelStore.elements.get(id);
    if (!el) return;
    original = {
      id,
      element: $state.snapshot(el) as Element,
      loads: ($state.snapshot(modelStore.model.loads) as Load[]).filter((l) => (l.data as { elementId?: number }).elementId === id),
    };
    recorded = false;
  });
  let changed = $state(false);

  /** The first change records the undo step; the rest belong to it. */
  function record() {
    if (!recorded) { historyStore.pushState({ notifyMutation: false }); recorded = true; }
    changed = true;
  }

  function patch(p: Partial<Element>) {
    if (elemId === null) return;
    record();
    modelStore.updateElement(elemId, p);
  }

  function setEnd(end: 'i' | 'j', r: Release) {
    patch(end === 'i' ? { releaseI: r } : { releaseJ: r });
  }

  function setJoint(end: 'i' | 'j', k: number, on: boolean) {
    if (!elem) return;
    const cur = (end === 'i' ? elem.jointI?.dof : elem.jointJ?.dof) ?? [false, false, false, false, false, false];
    const dof = cur.map((v, i) => (i === k ? on : v)) as NonNullable<Element['jointI']>['dof'];
    const joint = dof.some(Boolean) ? { dof } : undefined;
    patch(end === 'i' ? { jointI: joint } : { jointJ: joint });
  }

  function reverse() {
    if (elemId === null) return;
    record();
    modelStore.reverseElement(elemId);
  }

  function reset() {
    const o = original;
    if (!o || !changed) return;
    const others = modelStore.model.loads.filter((l) => (l.data as { elementId?: number }).elementId !== o.id);
    modelStore.model.loads = [...others, ...o.loads.map((l) => ({ ...l, data: { ...l.data } }) as Load)];
    modelStore.updateElement(o.id, { ...o.element });
    changed = false;
  }

  function close() {
    uiStore.editingElementId = null;
    changed = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    e.stopPropagation();
  }
</script>

{#if elem}
  <EditorCard
    title="{t('editor.element')} {elemId}"
    anchor={pos}
    onClose={close}
    onKeydown={handleKeydown}
    testid="element-editor"
  >

    <div class="field">
      <span>{t('editor.material')}:</span>
      <select value={elem.materialId} onchange={(e) => patch({ materialId: Number(e.currentTarget.value) })}>
        {#each Array.from(modelStore.materials.values()) as mat}
          <option value={mat.id}>{mat.name}</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <span>{t('editor.section')}:</span>
      <select value={elem.sectionId} onchange={(e) => patch({ sectionId: Number(e.currentTarget.value) })}>
        {#each Array.from(modelStore.sections.values()) as sec}
          <option value={sec.id}>{sec.name}</option>
        {/each}
      </select>
    </div>

    <!--
      ── Releases, one end at a time ──────────────────────────────────
      Each end gets one dropdown naming exactly what it releases, and an axis
      beside it when there is a slide to orient. The combined entries are not
      padding: a hinge releases rotation and a slider a translation, so a
      pin-on-roller is a real end condition. Sliding joints are a plane-frame
      device, so in 3D only one already set is offered (to remove it).
    -->
    <div class="rel">
      <div class="rel-title">{t('editor.releases')}</div>

      {#each [
        { key: 'i', label: t('editor.atStart') },
        { key: 'j', label: t('editor.atEnd') },
      ] as const as end (end.key)}
        {@const rel = end.key === 'i' ? elem.releaseI : elem.releaseJ}
        <div class="rel-row">
          <span class="rel-end">{end.label}</span>
          <EndConditionSelect release={rel} is3D={is3DMode} onchange={(r) => setEnd(end.key, r)} testid="release-{end.key}" axisTestid="release-axis-{end.key}" />
        </div>
        {#if is3DMode && rel?.slide}
          <span class="rel-warn">{t('editor.slideNot3D')}</span>
        {/if}
      {/each}

      <button class="ee-btn ee-flip" onclick={reverse} title={t('editor.reverseHint')} data-testid="element-editor-reverse">
        ⇄ {t('editor.reverse')}
      </button>
    </div>

    {#if is3DMode && elem.type === 'frame'}
      <div class="joint3d" title={t('editor.joint3dHint')}>
        <div class="joint3d-title">{t('editor.joint3dTitle')}</div>
        {#each [{ end: 'i', label: 'I' }, { end: 'j', label: 'J' }] as const as row (row.end)}
          {@const dof = (row.end === 'i' ? elem.jointI?.dof : elem.jointJ?.dof) ?? [false, false, false, false, false, false]}
          <div class="joint3d-row">
            <span class="joint3d-end">{row.label}</span>
            {#each DOF3D_LABELS as label, i}
              <label class="joint3d-dof"><input type="checkbox" checked={dof[i]} onchange={(e) => setJoint(row.end, i, e.currentTarget.checked)} />{label}</label>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <div class="info">
      {t('editor.nodesLabel')}: {elem.nodeI} → {elem.nodeJ}
      | L = {modelStore.getElementLength(elemId!).toFixed(3)} m
    </div>

    {#snippet footer()}
      <button class="ee-btn" onclick={reset} disabled={!changed} title={t('editor.resetHint')} data-testid="element-editor-reset">{t('editor.reset')}</button>
      <button class="ee-btn ee-ok" onclick={close} data-testid="element-editor-ok">OK</button>
    {/snippet}
  </EditorCard>
{/if}

<style>
  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .field > span {
    flex: 1;
    color: var(--st-text-2);
  }

  .field select {
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.7rem;
    max-width: 130px;
  }

  .field select:focus { outline: none; border-color: var(--st-accent); }

  /* ── Releases ─────────────────────────────────────────────────── */
  .rel {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
  }

  .rel-title {
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .rel-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .rel-end {
    width: 52px;
    flex: none;
    color: var(--st-text-2);
  }


  /* ── 3D joints ────────────────────────────────────────────────── */
  .joint3d {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
  }

  .joint3d-title {
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .joint3d-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .joint3d-end {
    width: 14px;
    color: var(--st-text-3);
  }

  .joint3d-dof {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.64rem;
    color: var(--st-text-2);
  }

  .info {
    padding-top: 0.35rem;
    border-top: 1px solid var(--st-hair);
    font-size: 0.64rem;
    color: var(--st-text-3);
  }

  .ee-btn {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ee-btn:hover { color: var(--st-text); }

  .ee-ok {
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .ee-ok:hover { background: var(--st-selected-bg); }
  .ee-btn:disabled { opacity: 0.45; cursor: default; }
  .ee-flip { align-self: flex-start; margin-top: 0.15rem; }
  .rel-warn { font-size: 0.65rem; color: var(--st-warn, #b45309); }
</style>
