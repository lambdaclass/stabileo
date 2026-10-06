<script lang="ts">
  /**
   * Where a generated structure goes, as a paste does: with the mouse (its ghost follows the
   * pointer and snaps to nodes; R turns it, F mirrors it, Tab changes the anchor, Shift+click
   * places another), or at typed coordinates (the anchor picked on a schema and marked on the
   * ghost in the model, which follows the numbers as they change). It no longer replaces the
   * model: on an empty one, the structure simply goes in at the point given.
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
  import QuantityInput from '../loads/QuantityInput.svelte';
  import type { OutputState } from '../../../lib/store/generated-structures';

  interface Props {
    topology: Topology | null;
    canGenerate: boolean;
    /** Emit with the current profiles and material, supports as chosen here. */
    build: (supports: SupportMode) => GeneratedModel | null;
    meta: () => GeneratedMeta;
    /** Runs inside the insertion's undo step with the members it made; its note joins the result. */
    afterInsert?: (elements: number[]) => string | null;
    /** A generated group being edited: offer to regenerate it instead of inserting a new one. */
    editingGroupId?: number | null;
    onRegenerated?: () => void;
    /** Shared between the two parts: the options scroll with the parameters, the actions stay docked. */
    st: OutputState;
    part: 'options' | 'actions';
    /** What the Generate button is described by (the problem list on screen). */
    describedBy?: string;
  }
  let { topology, canGenerate, build, meta, afterInsert, editingGroupId = null, onRegenerated, st, part, describedBy }: Props = $props();

  const grid = $derived(modelStore.grid);
  const gridAxes = $derived([...axesOf(grid, 'x'), ...axesOf(grid, 'y')]);

  /**
   * The points a structure can be placed by: its supports, then the corners of its box. A
   * structure with more than six supports (a shed has two per chord per column per frame) is
   * offered the four corners of its base instead, so the schema stays readable and the anchor
   * is a point a reader can name.
   */
  const MAX_SUPPORT_ANCHORS = 6;
  const anchors = $derived.by((): Array<{ p: Vec3; label: string }> => {
    if (!topology) return [];
    const out: Array<{ p: Vec3; label: string }> = [];
    const xs = topology.nodes.map((n) => n.x), ys = topology.nodes.map((n) => n.y), zs = topology.nodes.map((n) => n.z);
    const lo: Vec3 = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
    const hi: Vec3 = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
    if (topology.supports.length <= MAX_SUPPORT_ANCHORS) {
      topology.supports.forEach((s, k) => { const n = topology.nodes[s.node]!; out.push({ p: [n.x, n.y, n.z], label: tp('generator.out.anchorSupport', { k: k + 1 }) }); });
      out.push({ p: lo, label: t('generator.out.anchorMin') });
    } else {
      out.push({ p: lo, label: t('generator.out.anchorMin') });
      out.push({ p: [hi[0], lo[1], lo[2]], label: tp('generator.out.anchorCorner', { k: 2 }) });
      out.push({ p: [hi[0], hi[1], lo[2]], label: tp('generator.out.anchorCorner', { k: 3 }) });
      out.push({ p: [lo[0], hi[1], lo[2]], label: tp('generator.out.anchorCorner', { k: 4 }) });
    }
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
    return (T: Parameters<typeof insertGenerated>[1], o?: { withSupports: boolean }) => {
      let r!: ReturnType<typeof insertGenerated>;
      let note: string | null = null;
      modelStore.batch(() => {
        r = insertGenerated(g, T, meta(), roles, { withSupports: o?.withSupports ?? true });
        note = afterInsert?.(r.elements) ?? null;
      });
      st.result = tp('generator.out.inserted', { members: r.elements.length, nodes: r.nodes.length, welded: r.welded })
        + (note ? ` ${note}` : '');
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
    if (r) {
      st.result = tp('generator.out.regenerated', { kept: r.kept, added: r.added, removed: r.removed, keptSections: r.keptSections })
        + (r.welded + r.duplicates > 0 ? ` ${tp('generator.out.regeneratedJoined', { welded: r.welded, duplicates: r.duplicates })}` : '');
    }
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
    // Where the generated axes end up in the model, after the plane and the rotation.
    const r = (rotation * Math.PI) / 180;
    const name = (dx: number, dy: number) => {
      if (Math.abs(Math.abs(dx) - 1) < 1e-9) return dx > 0 ? '+X' : '−X';
      if (Math.abs(Math.abs(dy) - 1) < 1e-9) return dy > 0 ? '+Y' : '−Y';
      return `${Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10}°`;
    };
    const hName = name(Math.cos(r), Math.sin(r));
    const vName = planView ? name(-Math.sin(r), Math.cos(r)) : '+Z';
    return { lines, dots, planView, h: hName, v: vName };
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
      {#each ['atNode', 'atPoint'] as m (m)}
        <label class="go-mode"><input type="radio" name="gen-out" value={m} bind:group={st.mode} data-testid="gen-out-{m}" /> {t(`generator.out.${m}`)}</label>
      {/each}
    </div>
      {#if schema}
        <svg viewBox="0 0 {W} {H}" class="go-schema" role="img" aria-label={t('generator.out.anchor')}>
          <path d={schema.lines} class="go-lines" />
          <!-- The generated x and y (or z), named by where they point in the model. -->
          <g class="go-axes" data-testid="gen-schema-axes">
            <path d="M8,{H - 8} L34,{H - 8} M8,{H - 8} L8,{H - 34}" />
            <path d="M34,{H - 8} l-4,-3 v6 z M8,{H - 34} l-3,4 h6 z" class="go-arrow" />
            <text x="37" y={H - 5}>{schema.h}</text>
            <text x="3" y={H - 38}>{schema.v}</text>
            {#if Math.abs(rotation % 360) > 1e-9}
              <path d="M{W - 30},{H - 12} a10,10 0 1,0 12,-12" class="go-rot" />
              <path d="M{W - 18},{H - 24} l2,5 l-5,-1 z" class="go-arrow" />
              <text x={W - 36} y={H - 28} data-testid="gen-schema-rot">{Math.round(rotation * 10) / 10}°</text>
            {/if}
          </g>
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
          <input type="number" step="15" bind:value={st.rot} aria-describedby="gen-out-rot-hint" data-testid="gen-rot" />
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
      <p class="go-hint" id="gen-out-rot-hint">{t('generator.out.rotHint')}</p>
      {#if st.mode === 'atPoint'}
        <div class="go-row">
          <label class="go-field">X<QuantityInput quantity="length" bind:value={st.px} describedBy="gen-out-at-hint" title={t('generator.out.atHint')} testid="gen-x" /></label>
          <label class="go-field">Y<QuantityInput quantity="length" bind:value={st.py} describedBy="gen-out-at-hint" title={t('generator.out.atHint')} testid="gen-y" /></label>
          <label class="go-field">Z<QuantityInput quantity="length" bind:value={st.pz} describedBy="gen-out-at-hint" title={t('generator.out.atHint')} testid="gen-z" /></label>
        </div>
        <p class="go-hint" id="gen-out-at-hint">{t('generator.out.atHint')}</p>
      {:else}
        <p class="go-hint">{t('generator.out.atNodeHint')}</p>
      {/if}
  {/if}
</div>
{:else}
<div class="go-out" data-testid="gen-actions">
  {#if editingGroupId !== null}
    <p class="go-hint">{t('generator.out.regenerateHint')}</p>
    <button class="go" type="button" disabled={!canGenerate} onclick={regen} data-testid="gen-regenerate">{t('generator.out.regenerate')}</button>
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
  .go-field :global(input) { width: 64px; }
  .go-modes { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.68rem; }
  .go-mode { display: flex; gap: 4px; align-items: center; }
  .go-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .go-schema { width: 100%; max-width: 300px; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .go-lines { stroke: var(--st-text-3); stroke-width: 1; fill: none; }
  .go-axes path { stroke: var(--st-text-2); stroke-width: 1.2; fill: none; }
  .go-axes .go-arrow { fill: var(--st-text-2); stroke: none; }
  .go-axes .go-rot { stroke: var(--st-accent); }
  .go-axes text { font-size: 8px; fill: var(--st-text-2); }
  .go-dot { cursor: pointer; }
  .go-dot circle { fill: var(--st-surface); stroke: var(--st-accent); stroke-width: 1.5; }
  .go-dot.on circle { fill: var(--st-accent); }
  .go-dot text { font-size: 9px; fill: var(--st-text-2); }
  .go-sec { background: transparent; border: 1px solid var(--st-hair); border-radius: var(--st-radius); padding: 0.25rem 0.6rem; color: var(--st-text-2); cursor: pointer; }
</style>
