<script module lang="ts">
  import { registerFeatureDictionaries } from '../../lib/i18n/store.svelte';

  if (__PUBLIC_FEATURES__.proPlatesUnified) {
    void import('virtual:mesher-i18n').then(({ default: dictionaries }) => registerFeatureDictionaries(dictionaries));
  }
</script>

<script lang="ts">
  import { modelVec } from '../../lib/axes/display';
  import Hint from './Hint.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { generateMesh, type Loop2, type MeshInput, type SideSpec } from '../../lib/model/edit/mesher';
  import { applyMesh, modelPoints } from '../../lib/model/edit/mesh-apply';
  import type { Vec3 } from '../../lib/model/edit/affine';
  import { fromDisplay, unitLabel } from '../../lib/utils/units';
  import { parseDecimal } from '../../lib/utils/numeric-input';
  import QuantityInput from './loads/QuantityInput.svelte';

  type OuterKind = 'polygon' | 'circle';
  let outerKind = $state<OuterKind>('polygon');
  let outlineText = $state('');
  let circleCenter = $state('0; 0; 0');
  let circleRadius = $state(3);
  let holes = $state<Array<{ kind: 'polygon' | 'circle'; nodes: string; center: string; radius: number }>>([]);
  let size = $state(0.5);
  let element = $state<'quad' | 'tri'>('quad');
  let sides = $state<SideSpec[]>([]);
  let materialId = $state(1);
  let thickness = $state(0.2);
  let splitBeams = $state(true);
  let message = $state<string | null>(null);

  function polygonIds(text: string): number[] | null {
    const tokens = text.trim().split(/[,\s;]+/).filter(Boolean);
    if (tokens.length < 3 || tokens.some(token => !/^[+-]?\d+$/.test(token))) return null;
    const ids = tokens.map(Number);
    if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || !modelStore.nodes.has(id))) return null;
    return ids;
  }

  function polygon(ids: readonly number[]): Loop2 {
    return {
      kind: 'polygon',
      points: ids.map(id => {
        const node = modelStore.nodes.get(id)!;
        return [node.x, node.y, node.z ?? 0];
      }),
    };
  }

  function circle(text: string, radius: number): Loop2 | null {
    const [x, y, z, ...extra] = text.split(';').map(parseDecimal);
    if (x == null || y == null || z == null || extra.length || !Number.isFinite(radius) || radius <= 0) return null;
    const length = (value: number) => fromDisplay(value, 'length', uiStore.unitSystem);
    const center: Vec3 = [length(x), length(y), length(z)];
    return { kind: 'circle', center, radius };
  }

  const lenUnit = $derived(unitLabel('length', uiStore.unitSystem));

  function fromSelection() { outlineText = [...uiStore.selectedNodes].join(', '); }

  const outlineIds = $derived(outerKind === 'polygon' ? polygonIds(outlineText) : null);
  $effect(() => {
    const n = outerKind === 'circle' ? 0 : outlineIds?.length;
    if (n !== undefined && sides.length !== n) sides = Array.from({ length: n }, (_, i) => sides[i] ?? {});
  });

  const input = $derived.by((): MeshInput | null => {
    const outer = outerKind === 'circle' ? circle(circleCenter, circleRadius) : outlineIds && polygon(outlineIds);
    if (!outer) return null;
    const boundaries: Loop2[] = [];
    for (const hole of holes) {
      const ids = hole.kind === 'polygon' ? polygonIds(hole.nodes) : null;
      const boundary = hole.kind === 'circle' ? circle(hole.center, hole.radius) : ids && polygon(ids);
      if (!boundary) return null;
      boundaries.push(boundary);
    }
    return { outer, holes: boundaries, size, element, sides: outer.kind === 'polygon' ? sides : undefined };
  });

  const proposal = $derived.by(() => {
    if (!input) return null;
    const mesh = generateMesh({ ...input, fixedPoints: modelPoints() });
    return mesh ? { input, mesh } : null;
  });
  const mesh = $derived(proposal?.mesh ?? null);

  function apply() {
    if (!proposal) return;
    const r = applyMesh(proposal.input, { materialId, thickness, splitBeams }, proposal.mesh);
    if (!r) return;
    if (r.occupied) { message = t('mesher.occupied'); return; }
    message = tp('mesher.applied', { quads: r.quads.length, plates: r.plates.length, nodes: r.newNodes, split: r.splitCount });
  }

  const W = 260, H = 180, PAD = 8;
  const preview = $derived.by(() => {
    if (!mesh || mesh.cells.length > 20000) return null;
    const { o, u, v } = mesh.plane;
    const p2 = mesh.points.map((p) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return [d[0]! * u[0] + d[1]! * u[1] + d[2]! * u[2], d[0]! * v[0] + d[1]! * v[1] + d[2]! * v[2]]; });
    const xs = p2.map((p) => p[0]!), ys = p2.map((p) => p[1]!);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-9), (H - 2 * PAD) / Math.max(y1 - y0, 1e-9));
    const X = (x: number) => (PAD + (x - x0) * k).toFixed(1), Y = (y: number) => (H - PAD - (y - y0) * k).toFixed(1);
    return mesh.cells.map((c) => c.map((i, n) => `${n ? 'L' : 'M'}${X(p2[i]![0]!)},${Y(p2[i]![1]!)}`).join('') + 'Z').join('');
  });
</script>

<div class="ms" data-testid="mesher">
  <Hint text={t('mesher.hint')} />
  <div class="ms-row">
    <label><input type="radio" bind:group={outerKind} value="polygon" /> {t('mesher.polygon')}</label>
    <label><input type="radio" bind:group={outerKind} value="circle" data-testid="ms-circle" /> {t('mesher.circle')}</label>
  </div>
  {#if outerKind === 'polygon'}
    <div class="ms-row">
      <input class="ms-wide" placeholder={t('mesher.outlinePlaceholder')} bind:value={outlineText} data-testid="ms-outline" />
      <button class="pro-btn" disabled={uiStore.selectedNodes.size < 3} onclick={fromSelection}>{t('mesher.fromSelection')}</button>
    </div>
    {#if outlineIds && sides.length > 0}
      <table class="ms-sides">
        <thead><tr><th>{t('mesher.side')}</th><th>{t('mesher.divisions')}</th><th>{t('mesher.bias')}</th></tr></thead>
        <tbody>
          {#each sides as s, i (i)}
            <tr>
              <td>{outlineIds[i]}–{outlineIds[(i + 1) % outlineIds.length]}</td>
              <td><input type="number" min="1" step="1" placeholder={t('mesher.auto')} value={s.divisions ?? ''} onchange={(e) => { const v = Number(e.currentTarget.value); sides[i] = { ...sides[i], divisions: v >= 1 ? Math.floor(v) : undefined }; }} data-testid="ms-div-{i}" /></td>
              <td><input type="number" min="0.1" step="0.1" placeholder="1" value={s.bias ?? ''} onchange={(e) => { const v = Number(e.currentTarget.value); sides[i] = { ...sides[i], bias: v > 0 ? v : undefined }; }} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {:else}
    <div class="ms-row">
      <label>{t('mesher.center')} <input bind:value={circleCenter} placeholder="x; y; z" data-testid="ms-center" /> <span class="ms-unit">{lenUnit}</span></label>
      <label>R <QuantityInput min={0.1} bind:value={circleRadius} quantity="length" cls="ms-num" testid="ms-radius" /></label>
    </div>
  {/if}

  <div class="ms-row"><span>{t('mesher.holes')}</span>
    <button class="pro-btn" onclick={() => (holes = [...holes, { kind: 'circle', nodes: '', center: '0; 0; 0', radius: 0.5 }])} data-testid="ms-add-hole">+</button>
  </div>
  {#each holes as h, i (i)}
    <div class="ms-row ms-hole">
      <select bind:value={h.kind}><option value="circle">{t('mesher.circle')}</option><option value="polygon">{t('mesher.polygon')}</option></select>
      {#if h.kind === 'polygon'}<input class="ms-wide" bind:value={h.nodes} placeholder={t('mesher.outlinePlaceholder')} />
      {:else}<input bind:value={h.center} placeholder="x; y; z" data-testid="ms-hole-center-{i}" /> <span class="ms-unit">{lenUnit}</span> R <QuantityInput min={0.05} bind:value={h.radius} quantity="length" cls="ms-num" testid="ms-hole-r-{i}" />{/if}
      <button class="pro-btn" onclick={() => (holes = holes.filter((_, k) => k !== i))}>×</button>
    </div>
  {/each}

  <div class="ms-row">
    <label>{t('mesher.size')} <QuantityInput min={0.05} bind:value={size} quantity="length" cls="ms-num" testid="ms-size" /></label>
    <select bind:value={element} data-testid="ms-element">
      <option value="quad">{t('mesher.quads')}</option>
      <option value="tri">{t('mesher.tris')}</option>
    </select>
  </div>
  <div class="ms-row">
    <label>{t('pro.thMaterial')} <select bind:value={materialId}>{#each [...modelStore.materials.values()] as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
    <label>{t('pro.thicknessLabel')} <QuantityInput min={0.001} bind:value={thickness} quantity="length" cls="ms-num" /></label>
  </div>
  <label class="ms-row"><input type="checkbox" bind:checked={splitBeams} /> {t('pro.meshSplitBeams')}</label>

  {#if mesh}
    {#if preview}<svg viewBox="0 0 {W} {H}" class="ms-preview" role="img" aria-label={t('mesher.preview')}><path d={preview} /></svg>{/if}
    <p class="ms-hint" data-testid="ms-summary">{tp(mesh.structured ? 'mesher.summaryStructured' : 'mesher.summary', { cells: mesh.cells.length, points: mesh.points.length })}</p>
  {:else if outerKind === 'circle' || outlineText.trim() || holes.length}
    <p class="ms-warn">{t('mesher.failed')}</p>
  {/if}
  <button class="pro-btn pro-btn-accent" disabled={!mesh} onclick={apply} data-testid="ms-apply">{t('pro.generateMesh')}</button>
  {#if message}<p class="ms-hint" data-testid="ms-done">{message}</p>{/if}
</div>

<style>
  .ms { display: flex; flex-direction: column; gap: 5px; font-size: 0.68rem; color: var(--st-text-2); }
  .ms-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ms-row :global(input.ms-num) { width: 60px; }
  .ms-unit { font-size: 0.66rem; color: var(--st-text-3); }
  .ms-wide { flex: 1; min-width: 120px; }
  .ms-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .ms-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
  .ms-sides { border-collapse: collapse; font-size: 0.64rem; }
  .ms-sides th { font-weight: 500; color: var(--st-text-3); text-align: left; padding: 1px 4px; }
  .ms-sides td { padding: 1px 4px; }
  .ms-sides input { width: 56px; }
  .ms-preview { width: 100%; max-width: 300px; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .ms-preview path { fill: color-mix(in srgb, var(--st-accent) 12%, transparent); stroke: var(--st-accent); stroke-width: 0.6; }
</style>
