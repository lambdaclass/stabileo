<script lang="ts">
  /**
   * Where a generated structure goes: as a new model (replacing the current one), at a point
   * (coordinates, a rotation, the plane it stands in, the anchor picked on a schema, with the
   * ghost shown in the model while the numbers change), or at a node picked with the mouse.
   *
   * Inserted structures become regenerable groups (`store/generated-structures.ts`).
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { placementStore } from '../../../lib/store/placement.svelte';
  import { insertGenerated, regenerate, generatedData, type GeneratedMeta, type SupportMode } from '../../../lib/store/generated-structures';
  import { fragmentFromJSONModel } from '../../../lib/model/edit/fragment-code';
  import { axesOf, sortedLevels } from '../../../lib/model/grid';
  import type { GeneratedModel } from '../../../lib/engine/generators/emit';
  import type { Topology } from '../../../lib/engine/generators/truss-topology';
  import type { Vec3 } from '../../../lib/model/edit/affine';
  import { untrack } from 'svelte';
  import type { OutputState } from '../../../lib/store/generated-structures';

  interface Props {
    topology: Topology | null;
    canGenerate: boolean;
    /** Emit with the current profiles and material, supports as chosen here. */
    build: (supports: SupportMode) => GeneratedModel | null;
    meta: () => GeneratedMeta;
    /** Replace the model (the existing path). */
    onNewModel: (supports: SupportMode) => void;
    /** A generated group being edited: offer to regenerate it instead of inserting a new one. */
    editingGroupId?: number | null;
    onRegenerated?: () => void;
    /** Shared between the two parts: the options scroll with the parameters, the actions stay docked. */
    st: OutputState;
    part: 'options' | 'actions';
    /** What the Generate button is described by (the problem list on screen). */
    describedBy?: string;
  }
  let { topology, canGenerate, build, meta, onNewModel, editingGroupId = null, onRegenerated, st, part, describedBy }: Props = $props();

  const grid = $derived(modelStore.grid);
  const gridAxes = $derived([...axesOf(grid, 'x'), ...axesOf(grid, 'y')]);

  /** The points a structure can be placed by: its supports, then the corners of its box. */
  const anchors = $derived.by((): Array<{ p: Vec3; label: string }> => {
    if (!topology) return [];
    const out: Array<{ p: Vec3; label: string }> = [];
    topology.supports.forEach((s, k) => { const n = topology.nodes[s.node]!; out.push({ p: [n.x, n.y, n.z], label: tp('generator.out.anchorSupport', { k: k + 1 }) }); });
    const xs = topology.nodes.map((n) => n.x), ys = topology.nodes.map((n) => n.y), zs = topology.nodes.map((n) => n.z);
    const lo: Vec3 = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
    const hi: Vec3 = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
    out.push({ p: lo, label: t('generator.out.anchorMin') });
    out.push({ p: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]], label: t('generator.out.anchorBottomCentre') });
    return out;
  });
  $effect(() => { if (part === 'actions' && st.anchorIndex >= anchors.length) st.anchorIndex = 0; });

  const rotation = $derived((st.plane === 'YZ' ? 90 : 0) + (Number(st.rot) || 0));

  function useAxis(id: string) {
    const a = gridAxes.find((x) => x.id === id);
    if (!a) return;
    const others = axesOf(grid, a.axis === 'x' ? 'y' : 'x');
    // Along the axis line: an x = const axis runs along Y, so the structure stands in YZ.
    st.plane = a.axis === 'x' ? 'YZ' : 'XZ';
    st.rot = 0;
    if (a.axis === 'x') { st.px = a.at; st.py = others[0]?.at ?? 0; } else { st.py = a.at; st.px = others[0]?.at ?? 0; }
    const lv = sortedLevels(grid);
    st.pz = uiStore.workingPlane === 'XY' ? uiStore.nodeCreateZ : (lv[0]?.z ?? 0);
  }

  function committer(g: GeneratedModel) {
    const roles = topology?.members.map((m) => m.role) ?? [];
    return (T: Parameters<typeof insertGenerated>[1]) => {
      const r = insertGenerated(g, T, meta(), roles);
      st.result = tp('generator.out.inserted', { members: r.elements.length, nodes: r.nodes.length, welded: r.welded });
      return r;
    };
  }

  const previewing = $derived(placementStore.active && !placementStore.follow && placementStore.label === t('generator.out.ghostLabel'));

  function startPoint() {
    const g = build(st.supportMode);
    if (!g) return;
    placementStore.start({
      fragment: fragmentFromJSONModel(g.json), label: t('generator.out.ghostLabel'), follow: false,
      anchors: anchors.map((a) => a.p), anchorIndex: st.anchorIndex, rotation, target: [Number(st.px) || 0, Number(st.py) || 0, Number(st.pz) || 0],
      commitWith: committer(g), withSupports: true, withLoads: false,
    });
  }
  function startNode() {
    const g = build(st.supportMode);
    if (!g) return;
    placementStore.start({
      fragment: fragmentFromJSONModel(g.json), label: t('generator.out.mouseLabel'),
      anchors: anchors.map((a) => a.p), anchorIndex: st.anchorIndex, rotation, commitWith: committer(g), withSupports: true, withLoads: false,
    });
  }

  // The fixed ghost follows the numbers and the parameters as they change.
  // Only the docked half drives the ghost, so the two halves do not both push it.
  $effect(() => {
    const target: Vec3 = [Number(st.px) || 0, Number(st.py) || 0, Number(st.pz) || 0];
    const r = rotation, a = st.anchorIndex;
    if (part !== 'actions' || !previewing) return;
    untrack(() => {
      placementStore.setTarget(target);
      placementStore.setRotation(r);
      placementStore.setAnchorIndex(a);
    });
  });
  $effect(() => {
    void topology; const sm = st.supportMode;
    if (part !== 'actions' || !previewing) return;
    const ax = anchors.map((x) => x.p);
    untrack(() => {
      const g = build(sm);
      if (g) placementStore.replaceFragment(fragmentFromJSONModel(g.json), ax, committer(g));
    });
  });

  function regen() {
    if (editingGroupId === null) return;
    const g = build(st.supportMode);
    if (!g || !generatedData(editingGroupId)) return;
    const r = regenerate(editingGroupId, g, meta(), topology?.members.map((m) => m.role) ?? []);
    if (r) st.result = tp('generator.out.regenerated', { kept: r.kept, added: r.added, removed: r.removed, keptSections: r.keptSections });
    onRegenerated?.();
  }

  // ── The anchor schema: the structure in elevation or plan, anchors as numbered dots ──
  const W = 260, H = 120, PAD = 12;
  const schema = $derived.by(() => {
    if (!topology || topology.nodes.length === 0) return null;
    const ys = topology.nodes.map((n) => n.y), zs = topology.nodes.map((n) => n.z);
    const spanZ = Math.max(...zs) - Math.min(...zs), spanY = Math.max(...ys) - Math.min(...ys);
    const planView = spanZ < 1e-6 || spanY > spanZ * 1.5;
    const v = (n: { x: number; y: number; z: number }) => [n.x, planView ? n.y : n.z] as const;
    const pts = topology.nodes.map(v);
    const u0 = Math.min(...pts.map((p) => p[0])), u1 = Math.max(...pts.map((p) => p[0]));
    const v0 = Math.min(...pts.map((p) => p[1])), v1 = Math.max(...pts.map((p) => p[1]));
    const k = Math.min((W - 2 * PAD) / Math.max(u1 - u0, 1e-6), (H - 2 * PAD) / Math.max(v1 - v0, 1e-6));
    const tx = (u: number) => PAD + (u - u0) * k, ty = (w: number) => H - PAD - (w - v0) * k;
    const lines = topology.members.length <= 3000 ? topology.members.map((m) => {
      const a = v(topology.nodes[m.a]!), b = v(topology.nodes[m.b]!);
      return `M${tx(a[0]).toFixed(1)},${ty(a[1]).toFixed(1)}L${tx(b[0]).toFixed(1)},${ty(b[1]).toFixed(1)}`;
    }).join('') : '';
    const dots = anchors.map((a) => ({ x: tx(a.p[0]), y: ty(planView ? a.p[1] : a.p[2]) }));
    return { lines, dots, planView };
  });
</script>

{#if part === 'options'}
<div class="go-out" data-testid="gen-output">
  <label class="go-field">{t('generator.out.supports')}
    <select bind:value={st.supportMode} data-testid="gen-support-mode">
      {#each ['generated', 'none', 'pinned', 'fixed'] as m (m)}<option value={m}>{t(`generator.out.supports.${m}`)}</option>{/each}
    </select>
  </label>
  {#if editingGroupId === null}
    <div class="go-modes" role="radiogroup" aria-label={t('generator.out.where')}>
      {#each ['newModel', 'atPoint', 'atNode'] as m (m)}
        <label class="go-mode"><input type="radio" name="gen-out" value={m} bind:group={st.mode} data-testid="gen-out-{m}" /> {t(`generator.out.${m}`)}</label>
      {/each}
    </div>
    {#if st.mode !== 'newModel'}
      {#if schema}
        <svg viewBox="0 0 {W} {H}" class="go-schema" role="img" aria-label={t('generator.out.anchor')}>
          <path d={schema.lines} class="go-lines" />
          {#each schema.dots as d, i (i)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <g class="go-dot" class:on={i === st.anchorIndex} role="button" tabindex="-1" onclick={() => (st.anchorIndex = i)} data-testid="gen-anchor-dot-{i}">
              <circle cx={d.x} cy={d.y} r="6" />
              <text x={d.x + 8} y={d.y - 6}>{i + 1}</text>
            </g>
          {/each}
        </svg>
      {/if}
      <label class="go-field">{t('generator.out.anchor')}
        <select bind:value={st.anchorIndex} data-testid="gen-anchor">
          {#each anchors as a, i (i)}<option value={i}>{i + 1}. {a.label}</option>{/each}
        </select>
      </label>
      <div class="go-row">
        <label class="go-field">{t('generator.out.plane')}
          <select bind:value={st.plane} data-testid="gen-plane"><option value="XZ">XZ</option><option value="YZ">YZ</option></select>
        </label>
        <label class="go-field">{t('generator.out.rotation')}
          <input type="number" step="15" bind:value={st.rot} data-testid="gen-rot" />
        </label>
        {#if gridAxes.length > 0}
          <label class="go-field">{t('generator.out.onAxis')}
            <select bind:value={st.axisId} onchange={() => useAxis(st.axisId)} data-testid="gen-on-axis">
              <option value="">—</option>
              {#each gridAxes as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
      {#if st.mode === 'atPoint'}
        <div class="go-row">
          <label class="go-field">X<input type="number" step="0.5" bind:value={st.px} data-testid="gen-x" /></label>
          <label class="go-field">Y<input type="number" step="0.5" bind:value={st.py} data-testid="gen-y" /></label>
          <label class="go-field">Z<input type="number" step="0.5" bind:value={st.pz} data-testid="gen-z" /></label>
        </div>
      {:else}
        <p class="go-hint">{t('generator.out.atNodeHint')}</p>
      {/if}
    {/if}
  {/if}
</div>
{:else}
<div class="go-out" data-testid="gen-actions">
  {#if editingGroupId !== null}
    <p class="go-hint">{t('generator.out.regenerateHint')}</p>
    <button class="go" type="button" disabled={!canGenerate} onclick={regen} data-testid="gen-regenerate">{t('generator.out.regenerate')}</button>
  {:else if st.mode === 'newModel'}
    <p class="warn">{t('generator.ui.replacesModel')}</p>
    <button class="go" type="button" data-testid="gen-generate" disabled={!canGenerate}
      aria-describedby={describedBy} onclick={() => onNewModel(st.supportMode)}>{t('generator.ui.generate')}</button>
  {:else if st.mode === 'atPoint'}
    {#if previewing}
      <div class="go-row">
        <button class="go" type="button" onclick={() => placementStore.commit()} data-testid="gen-insert">{t('generator.out.insert')}</button>
        <button class="go-sec" type="button" onclick={() => placementStore.cancel()}>{t('placement.cancel')}</button>
      </div>
    {:else}
      <button class="go" type="button" disabled={!canGenerate} aria-describedby={describedBy} onclick={startPoint} data-testid="gen-preview-point">{t('generator.out.preview')}</button>
    {/if}
  {:else}
    <button class="go" type="button" disabled={!canGenerate} aria-describedby={describedBy} onclick={startNode} data-testid="gen-place-mouse">{t('generator.out.placeWithMouse')}</button>
  {/if}
  {#if st.result}<p class="result" role="status" data-testid="gen-out-result">{st.result}</p>{/if}
</div>
{/if}

<style>
  .go-out { display: flex; flex-direction: column; gap: 6px; }
  .warn { margin: 0; font-size: 0.68rem; color: var(--st-warn); }
  .go {
    padding: 6px 10px; font-size: 0.76rem; font-weight: 600; cursor: pointer;
    background: var(--st-hair-strong); border: 1px solid var(--st-interactive); border-radius: 3px; color: var(--st-text);
  }
  .go:disabled { opacity: 0.45; cursor: not-allowed; border-color: var(--st-hair-strong); }
  .go:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 2px; }
  .result { margin: 0; font-size: 0.7rem; color: var(--st-ok); }
  .go-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
  .go-field { display: flex; flex-direction: column; gap: 2px; font-size: 0.64rem; color: var(--st-text-3); }
  .go-field input { width: 64px; }
  .go-modes { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.68rem; }
  .go-mode { display: flex; gap: 4px; align-items: center; }
  .go-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .go-schema { width: 100%; max-width: 300px; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .go-lines { stroke: var(--st-text-3); stroke-width: 1; fill: none; }
  .go-dot { cursor: pointer; }
  .go-dot circle { fill: var(--st-surface); stroke: var(--st-accent); stroke-width: 1.5; }
  .go-dot.on circle { fill: var(--st-accent); }
  .go-dot text { font-size: 9px; fill: var(--st-text-2); }
  .go-sec { background: transparent; border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 0.25rem 0.6rem; color: var(--st-text-2); cursor: pointer; }
</style>
