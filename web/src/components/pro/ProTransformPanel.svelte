<script lang="ts">
  /**
   * Repeat, polar repeat, mirror, rotate and move — one panel over one edit layer.
   *
   * Every mode is an isometry applied to the selection, either as copies (`copyTransformed`) or in
   * place (`transformInPlace`). The rules for what each carries — frames, offsets, joints,
   * supports, loads, groups — live in `lib/model/edit/`, not here. Each run is one undo step.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { translation, rotation, reflection, type Affine, type Vec3, repeatOffsets, parseSpacings } from '../../lib/model/edit/affine';
  import { copyTransformed, type EditReport } from '../../lib/model/edit/transformed-copy';
  import { transformInPlace } from '../../lib/model/edit/transform-in-place';
  import type { EditWarning } from '../../lib/model/edit/transform-fields';
  import { detach, fragmentOf } from '../../lib/model/edit/fragment';
  import { editPreview } from '../../lib/store/edit-preview.svelte';
  import { placementStore } from '../../lib/store/placement.svelte';
  import { onDestroy } from 'svelte';

  type Mode = 'repeat' | 'polar' | 'mirror' | 'rotate' | 'move';
  const MODES: Mode[] = ['repeat', 'polar', 'mirror', 'rotate', 'move'];
  /** A generous ceiling: a copy count is typed, and a slip of a digit should not freeze the tab. */
  const MAX_COPIES = 200;

  let mode = $state<Mode>('repeat');
  let count = $state(1);
  /** Unequal steps along the offset's direction, e.g. "6; 7,5; 6". Blank: equal steps. */
  let spacingText = $state('');
  const spacings = $derived(mode === 'repeat' && spacingText.trim() ? parseSpacings(spacingText) : null);
  let d = $state<Vec3>([0, 0, 3]);
  let point = $state<Vec3>([0, 0, 0]);
  let axis = $state<'X' | 'Y' | 'Z' | 'custom'>('Z');
  let axisCustom = $state<Vec3>([0, 0, 1]);
  let angle = $state(90);
  let asCopy = $state(true);
  let withLoads = $state(true);
  let withSupports = $state(false);
  let link = $state(false);
  let linkType = $state<'frame' | 'truss'>('frame');
  let linkMaterial = $state(1);
  let linkSection = $state(1);
  let message = $state<string | null>(null);
  let showPreview = $state(true);

  /** Past this many members the preview is not drawn: a thousand copies of a building is not a preview. */
  const PREVIEW_LIMIT = 20000;

  /** The selection as an entity set: members and shells picked, plus those wholly inside the nodes. */
  const set = $derived.by(() => {
    const nodes = new Set([...uiStore.selectedNodes].filter((id) => modelStore.nodes.has(id)));
    const elements = new Set([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
    for (const e of modelStore.elements.values()) if (nodes.has(e.nodeI) && nodes.has(e.nodeJ)) elements.add(e.id);
    const quads = new Set<number>(), plates = new Set<number>();
    for (const key of uiStore.selectedShells) {
      const id = Number(key.slice(1));
      if (key[0] === 'q' ? modelStore.quads.has(id) : modelStore.plates.has(id)) (key[0] === 'q' ? quads : plates).add(id);
    }
    for (const q of modelStore.quads.values()) if (q.nodes.every((n) => nodes.has(n))) quads.add(q.id);
    for (const p of modelStore.plates.values()) if (p.nodes.every((n) => nodes.has(n))) plates.add(p.id);
    return { nodes, elements, quads, plates };
  });
  const size = $derived(set.nodes.size + set.elements.size + set.quads.size + set.plates.size);

  /** Link-bar defaults follow the first selected member, the likeliest intent. */
  $effect(() => {
    const first = [...set.elements][0];
    const e = first !== undefined ? modelStore.elements.get(first) : undefined;
    if (e) { linkMaterial = e.materialId; linkSection = e.sectionId; }
  });

  const axisVec = $derived<Vec3>(axis === 'X' ? [1, 0, 0] : axis === 'Y' ? [0, 1, 0] : axis === 'Z' ? [0, 0, 1] : axisCustom);
  const canCopy = $derived(mode !== 'move' && asCopy);
  const copies = $derived(mode === 'mirror' ? 1 : spacings ? spacings.length : Math.floor(count));
  const countOk = $derived(!canCopy || mode === 'mirror' || (copies >= 1 && copies <= MAX_COPIES));
  const axisOk = $derived(mode === 'repeat' || mode === 'move' || Math.hypot(...axisVec) > 1e-9);
  const spacingOk = $derived(mode !== 'repeat' || !spacingText.trim() || (spacings !== null && Math.hypot(...d) > 1e-9));
  const canRun = $derived(size > 0 && countOk && axisOk && spacingOk);

  /** Centre of the selected nodes: where a mirror plane or an axis is most often wanted. */
  function centreOfSelection() {
    const pts = [...set.nodes, ...[...set.elements].flatMap((id) => {
      const e = modelStore.elements.get(id); return e ? [e.nodeI, e.nodeJ] : [];
    })].map((id) => modelStore.nodes.get(id)).filter((n) => !!n);
    if (pts.length === 0) return;
    const c: Vec3 = [0, 0, 0];
    for (const n of pts) { c[0] += n!.x; c[1] += n!.y; c[2] += n!.z ?? 0; }
    point = [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
  }

  function transforms(): Affine[] {
    switch (mode) {
      case 'repeat': return repeatOffsets(d, copies, spacings ?? undefined).map((o) => translation(o));
      case 'polar': return Array.from({ length: copies }, (_, k) => rotation(point, axisVec, angle * (k + 1)));
      case 'mirror': return [reflection(point, axisVec)];
      case 'rotate': return asCopy
        ? Array.from({ length: copies }, (_, k) => rotation(point, axisVec, angle * (k + 1)))
        : [rotation(point, axisVec, angle)];
      case 'move': return [translation(d)];
    }
  }

  // ── The preview: what Run would do, as a ghost, while the numbers change ──
  const previewFragment = $derived(size > 0 ? fragmentOf(set, { withGroups: false }) : null);
  $effect(() => {
    if (!showPreview || !canRun || !previewFragment) { editPreview.clear('transform'); return; }
    const ts = transforms();
    if (previewFragment.elements.length * ts.length > PREVIEW_LIMIT) { editPreview.clear('transform'); return; }
    editPreview.show('transform', previewFragment, ts);
  });
  onDestroy(() => editPreview.clear('transform'));

  // ── Picking in the model ──
  const pickLabel = (key: string) => (k: number) => tp(key, { k });
  /** The axis or plane point, with one click. */
  function pickPoint() {
    placementStore.pickPoints(1, pickLabel('transform.pick.point'), ([p]) => { point = p!; });
  }
  /** A mirror plane through two clicked points, standing vertical. */
  function pickMirror() {
    placementStore.pickPoints(2, pickLabel('transform.pick.mirror'), ([a, b]) => {
      const dx = b![0] - a![0], dy = b![1] - a![1];
      if (Math.hypot(dx, dy) < 1e-9) return;
      point = a!;
      axis = 'custom';
      axisCustom = [dy, -dx, 0];
    });
  }
  /** A rotation about a vertical axis: centre, then from, then to. */
  function pickRotation() {
    placementStore.pickPoints(3, pickLabel('transform.pick.rotate'), ([c, f, g]) => {
      const a1 = Math.atan2(f![1] - c![1], f![0] - c![0]), a2 = Math.atan2(g![1] - c![1], g![0] - c![0]);
      let deg = ((a2 - a1) * 180) / Math.PI;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      point = c!;
      axis = 'Z';
      angle = Math.round(deg * 1e6) / 1e6;
    });
  }
  /** The repeat step, as the vector between two clicked points. */
  function pickOffset() {
    placementStore.pickPoints(2, pickLabel('transform.pick.offset'), ([a, b]) => {
      d = [b![0] - a![0], b![1] - a![1], b![2] - a![2]].map((v) => Math.round(v * 1e6) / 1e6) as Vec3;
    });
  }
  /** Move by two points: the base, then where it goes. Ctrl or Cmd on the second click copies. */
  function moveByTwoPoints() {
    const moveSet = { nodes: [...set.nodes], elements: [...set.elements], quads: [...set.quads], plates: [...set.plates] };
    placementStore.pickPoints(1, pickLabel('transform.pick.base'), ([base]) => {
      placementStore.start({
        fragment: detach(fragmentOf(moveSet, { withLoads, withSupports })), label: t('transform.pick.destination'),
        mode: 'move', moveSet, anchors: [base!], target: base!,
      });
    });
  }

  function warningsText(w: Partial<Record<EditWarning, number>>): string {
    return Object.entries(w).map(([k, n]) => tp(`transform.warn.${k}`, { n: n ?? 0 })).join(' ');
  }

  function run() {
    if (!canRun) return;
    message = null;
    const T = transforms();
    const leftHand = uiStore.axisConvention3D === 'leftHand';
    if (mode === 'move' || !asCopy) {
      const r = transformInPlace(set, T[0]!, { leftHand });
      message = [
        tp('transform.movedDone', { n: r.movedNodes, stretched: r.stretchedMembers }),
        r.welded > 0 ? tp('transform.welded', { n: r.welded }) : '',
        warningsText(r.warnings),
      ].filter(Boolean).join(' ');
      return;
    }
    const r: EditReport = copyTransformed(set, T, {
      withLoads, withSupports, withGroups: true, leftHand,
      link: link && (mode === 'repeat' || mode === 'polar' || mode === 'rotate')
        ? { type: linkType, materialId: linkMaterial, sectionId: linkSection } : null,
    });
    message = [
      tp('transform.copyDone', { n: r.nodes.length, e: r.elements.length, s: r.quads.length + r.plates.length, links: r.links.length }),
      r.welded > 0 ? tp('transform.welded', { n: r.welded }) : '',
      r.duplicates > 0 ? tp('transform.duplicates', { n: r.duplicates }) : '',
      r.groups.length > 0 ? tp('transform.groups', { n: r.groups.length }) : '',
      warningsText(r.warnings),
    ].filter(Boolean).join(' ');
    // The copies become the selection, so the next repeat or move acts on them.
    uiStore.setSelection(
      new Set(r.nodes), new Set([...r.elements, ...r.links]), true,
      new Set([...r.quads.map((id) => `q${id}`), ...r.plates.map((id) => `p${id}`)]),
    );
  }
</script>

<div class="pk tp" data-testid="transform-panel">
  <section class="pk-card">
  <div class="pk-tabs" role="tablist">
    {#each MODES as m (m)}
      <button role="tab" class:on={mode === m} aria-selected={mode === m} onclick={() => (mode = m)} data-testid="tp-mode-{m}">
        {t(`transform.mode.${m}`)}
      </button>
    {/each}
  </div>
  <p class="tp-lead">{t(`transform.lead.${mode}`)}</p>
  <p class="pk-hint" data-testid="tp-selection">
    {size === 0 ? t('transform.nothingSelected') : tp('transform.selected', {
      n: set.nodes.size, e: set.elements.size, s: set.quads.size + set.plates.size,
    })}
  </p>
  </section>

  <section class="pk-card">
  <h4 class="pk-heading">{t('kit.parameters')}</h4>

  {#if mode === 'rotate'}
    <label class="tp-check"><input type="checkbox" bind:checked={asCopy} data-testid="tp-copy" /> {t('transform.asCopy')}</label>
  {:else if mode === 'mirror'}
    <label class="tp-check"><input type="checkbox" bind:checked={asCopy} data-testid="tp-copy" /> {t('transform.mirrorCopy')}</label>
  {/if}

  {#if (mode === 'repeat' || mode === 'polar' || (mode === 'rotate' && asCopy))}
    <label class="tp-field">
      <span>{t('transform.count')}</span>
      <input type="number" min="1" max={MAX_COPIES} step="1" bind:value={count} data-testid="tp-count" />
    </label>
    {#if !countOk}<p class="tp-err">{tp('transform.tooMany', { max: MAX_COPIES })}</p>{/if}
  {/if}

  {#if mode === 'repeat'}
    <label class="tp-field">
      <span title={t('transform.spacingsHint')}>{t('transform.spacings')}</span>
      <input type="text" placeholder="6; 7,5; 6" bind:value={spacingText} data-testid="tp-spacings" />
    </label>
    {#if !spacingOk}<p class="tp-err">{t('transform.spacingsInvalid')}</p>{/if}
    {#if spacings}<p class="pk-hint">{tp('transform.spacingsApplied', { n: spacings.length })}</p>{/if}
  {/if}

  {#if mode === 'move'}
    <button class="tp-link" disabled={size === 0} onclick={moveByTwoPoints} data-testid="tp-two-points">{t('transform.twoPoints')}</button>
  {:else if mode === 'repeat'}
    <button class="tp-link" onclick={pickOffset} data-testid="tp-pick-offset">{t('transform.pickOffset')}</button>
  {/if}
  {#if mode === 'repeat' || mode === 'move'}
    <div class="tp-vec">
      <span class="tp-label">{t(mode === 'repeat' ? 'transform.stepOffset' : 'transform.offset')}</span>
      <div class="tp-row">
        {#each ['X', 'Y', 'Z'] as ax, i (ax)}
          <label><span>{ax}</span><input type="number" step="0.1" bind:value={d[i]} data-testid="tp-d{ax.toLowerCase()}" /></label>
        {/each}
      </div>
    </div>
  {:else}
    <div class="tp-vec">
      <span class="tp-label">{t(mode === 'mirror' ? 'transform.planePoint' : 'transform.axisPoint')}</span>
      <div class="tp-row">
        {#each ['X', 'Y', 'Z'] as ax, i (ax)}
          <label><span>{ax}</span><input type="number" step="0.1" bind:value={point[i]} data-testid="tp-p{ax.toLowerCase()}" /></label>
        {/each}
      </div>
      <div class="tp-row">
        <button class="tp-link" onclick={centreOfSelection}>{t('transform.atCentre')}</button>
        {#if mode === 'mirror'}
          <button class="tp-link" disabled={size === 0} onclick={pickMirror} data-testid="tp-pick-mirror">{t('transform.pickMirror')}</button>
        {:else if mode === 'rotate'}
          <button class="tp-link" disabled={size === 0} onclick={pickRotation} data-testid="tp-pick-rotate">{t('transform.pickRotate')}</button>
        {:else}
          <button class="tp-link" onclick={pickPoint} data-testid="tp-pick-point">{t('transform.pickPoint')}</button>
        {/if}
      </div>
    </div>
    <label class="tp-field">
      <span>{t(mode === 'mirror' ? 'transform.planeNormal' : 'transform.axis')}</span>
      <select bind:value={axis} data-testid="tp-axis">
        <option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option>
        <option value="custom">{t('transform.custom')}</option>
      </select>
    </label>
    {#if axis === 'custom'}
      <div class="tp-row">
        {#each ['X', 'Y', 'Z'] as ax, i (ax)}
          <label><span>{ax}</span><input type="number" step="0.1" bind:value={axisCustom[i]} /></label>
        {/each}
      </div>
      {#if !axisOk}<p class="tp-err">{t('transform.zeroAxis')}</p>{/if}
    {/if}
    {#if mode !== 'mirror'}
      <label class="tp-field">
        <span>{t(mode === 'polar' ? 'transform.stepAngle' : 'transform.angle')} (°)</span>
        <input type="number" step="5" bind:value={angle} data-testid="tp-angle" />
      </label>
    {/if}
  {/if}

  </section>

  <section class="pk-card">
  <h4 class="pk-heading">{t('kit.options')}</h4>
  {#if canCopy}
    <label class="tp-check"><input type="checkbox" bind:checked={withLoads} /> {t('transform.withLoads')}</label>
    <label class="tp-check"><input type="checkbox" bind:checked={withSupports} /> {t('transform.withSupports')}</label>
    {#if mode !== 'mirror'}
      <label class="tp-check"><input type="checkbox" bind:checked={link} data-testid="tp-link" /> {t('transform.link')}</label>
      {#if link}
        <div class="tp-row tp-linkrow">
          <select bind:value={linkType}><option value="frame">{t('transform.frame')}</option><option value="truss">{t('transform.truss')}</option></select>
          <select bind:value={linkMaterial}>{#each [...modelStore.materials.values()] as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
          <select bind:value={linkSection}>{#each [...modelStore.sections.values()] as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select>
        </div>
      {/if}
    {/if}
  {:else}
    <p class="tp-note">{t('transform.keepsConnections')}</p>
  {/if}

  <label class="tp-check"><input type="checkbox" bind:checked={showPreview} data-testid="tp-preview" /> {t('transform.preview')}</label>
  <div class="pk-row pk-row-end">
    <button class="pk-btn pk-btn-primary" disabled={!canRun} onclick={run} data-testid="tp-run">{t(`transform.run.${mode}`)}</button>
  </div>
  {#if message}<p class="pk-ok" data-testid="tp-done">{message}</p>{/if}
  <p class="pk-hint">{t('transform.weldNote')}</p>
  </section>
</div>

<style>
  .tp-lead { margin: 0; color: var(--st-text-2); }
  .tp-sel { margin: 0; color: var(--st-text-3); }
  .tp-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--st-text-2); }
  .tp-field input, .tp-field select, .tp-row input, .tp-row select {
    padding: 3px 5px; font-size: 0.68rem; background: var(--st-surface); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text-2);
  }
  .tp-field input { width: 70px; text-align: right; }
  .tp-vec { display: flex; flex-direction: column; gap: 3px; }
  .tp-label { color: var(--st-text-3); }
  .tp-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .tp-row label { display: flex; align-items: center; gap: 3px; color: var(--st-text-3); }
  .tp-row input { width: 58px; text-align: right; }
  .tp-linkrow select { max-width: 110px; }
  .tp-check { display: flex; align-items: center; gap: 6px; color: var(--st-text-2); cursor: pointer; }
  .tp-link {
    align-self: flex-start; padding: 2px 6px; font-size: 0.62rem; color: var(--st-interactive);
    background: transparent; border: 1px solid var(--st-surface-3); border-radius: 3px; cursor: pointer;
  }
  .tp-err { margin: 0; color: var(--st-warn); }
  .tp-done { margin: 0; color: var(--st-ok); }
  .tp-note { margin: 0; color: var(--st-text-3); font-size: 0.64rem; }
</style>
