<script lang="ts">
  /**
   * The values of a load on shells, for the write card: an area load with its direction, its field
   * and its extent; a fluid to a level; a force at a point. `build` turns them into the model's
   * loads on the shells picked (`shell-load-tools.ts` for the two tools).
   *
   * Every magnitude is typed in the display units (`QuantityInput`) and kept here in SI, `null`
   * while empty; the list of corner values is read the same way, value by value.
   */
  import { t } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { fromDisplay, unitLabel } from '../../../lib/utils/units';
  import QuantityInput from './QuantityInput.svelte';
  import type { SketchInput } from './LoadSketch.svelte';
  import { hydrostaticSurfaceLoads, shellPointNodalLoads, type ShellRef } from '../../../lib/model/loads/shell-load-tools';
  import type { Load, SurfaceLoad3D } from '../../../lib/store/model.svelte';
  import type { Vec3 } from '../../../lib/engine/shell-load-integration';

  interface Props {
    kind: 'surface' | 'hydro' | 'shellPoint';
    /** What the fields say, for the card's sketch (`LoadSketch`). */
    sketch?: SketchInput['shell'];
  }
  let { kind, sketch = $bindable() }: Props = $props();

  type N = number | null;
  const num = (v: N, fallback = 0): number => v ?? fallback;
  const opt = (v: N): N => v;
  const AXIS: Record<'X' | 'Y' | 'Z', Vec3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

  // ── Area load ──
  let dirMode = $state<'down' | 'local' | 'global' | 'projected'>('down');
  let dirAxis = $state<'X' | 'Y' | 'Z'>('Z');
  let field = $state<'uniform' | 'corners' | 'axis'>('uniform');
  let q = $state<N>(null);
  let qc = $state('');
  let va = $state<{ axis: 'X' | 'Y' | 'Z'; c1: N; q1: N; c2: N; q2: N }>({ axis: 'Z', c1: null, q1: null, c2: null, q2: null });
  let partial = $state(false);
  let rect = $state<{ plane: 'XY' | 'XZ' | 'YZ'; u1: N; v1: N; u2: N; v2: N }>({ plane: 'XY', u1: null, v1: null, u2: null, v2: null });
  // ── Fluid ──
  let gamma = $state<N>(10);
  let level = $state<N>(null);
  let inside = $state<Record<'x' | 'y' | 'z', N>>({ x: null, y: null, z: null });
  // ── Point ──
  let at = $state<Record<'x' | 'y' | 'z', N>>({ x: null, y: null, z: null });
  let pf = $state<Record<'fx' | 'fy' | 'fz', N>>({ fx: null, fy: null, fz: null });

  $effect(() => {
    const corners = qc.split(';').map((x) => parseDecimal(x.trim())).filter((x): x is number => x !== null);
    sketch = { dirMode, dirAxis, field, q, corners, va: { ...va }, partial, gamma, level, at: { ...at }, pf: { ...pf } };
  });

  /** The rectangle as a region: its plane's two axes, projected along the third. */
  function region(): SurfaceLoad3D['region'] | string {
    const [u1, v1, u2, v2] = [opt(rect.u1), opt(rect.v1), opt(rect.u2), opt(rect.v2)];
    if (u1 === null || v1 === null || u2 === null || v2 === null || u1 === u2 || v1 === v2) return t('writeLoad.shell.rectIncomplete');
    const put = (u: number, v: number): Vec3 => (rect.plane === 'XY' ? [u, v, 0] : rect.plane === 'XZ' ? [u, 0, v] : [0, u, v]);
    const normal: Vec3 = rect.plane === 'XY' ? [0, 0, 1] : rect.plane === 'XZ' ? [0, 1, 0] : [1, 0, 0];
    return { normal, points: [put(u1, v1), put(u2, v1), put(u2, v2), put(u1, v2)] };
  }

  /** The loads on the shells picked, or why there are none. */
  export function build(shells: readonly ShellRef[], caseId: number | undefined): Load[] | string {
    if (!shells.length) return t('writeLoad.noTarget');
    const c = caseId !== undefined ? { caseId } : {};
    if (kind === 'shellPoint') {
      const F: Vec3 = [num(pf.fx), num(pf.fy), num(pf.fz)];
      if (F.every((v) => v === 0)) return t('writeLoad.zero');
      const nodal = shellPointNodalLoads(shells, [num(at.x), num(at.y), num(at.z)], F);
      if (!nodal) return t('writeLoad.shell.pointOutside');
      return nodal.map((n) => ({ type: 'nodal3d', data: { id: 0, ...n, ...c } }) as Load);
    }
    if (kind === 'hydro') {
      const g = opt(gamma), z = opt(level);
      if (g === null || g === 0 || z === null) return t('writeLoad.shell.hydroIncomplete');
      const pt = [opt(inside.x), opt(inside.y), opt(inside.z)];
      const loads = hydrostaticSurfaceLoads(shells, g, z, pt.every((v) => v !== null) ? (pt as Vec3) : undefined);
      if (!loads.length) return t('writeLoad.shell.hydroNothing');
      return loads.map((l) => ({ type: 'surface3d', data: { id: 0, ...l, ...c } }) as Load);
    }

    const extra: Partial<SurfaceLoad3D> = {};
    if (dirMode !== 'down') extra.frame = dirMode;
    if (dirMode === 'global' || dirMode === 'projected') extra.dir = AXIS[dirAxis];
    let qv = 0;
    if (field === 'uniform') {
      const v = opt(q);
      if (v === null || v === 0) return t('writeLoad.zero');
      qv = v;
    } else if (field === 'corners') {
      const vals = qc.split(';').map((s) => parseDecimal(s.trim())).filter((v): v is number => v !== null).map((v) => fromDisplay(v, 'areaLoad', uiStore.unitSystem));
      if (vals.length < 3) return t('writeLoad.shell.cornersIncomplete');
      if (vals.every((v) => v === 0)) return t('writeLoad.zero');
      // Three values for a triangle, four for a quad; a triangle picked with four takes the first three.
      extra.qNodes = vals;
    } else {
      const [c1, q1, c2, q2] = [opt(va.c1), opt(va.q1), opt(va.c2), opt(va.q2)];
      if (c1 === null || q1 === null || c2 === null || q2 === null || c1 === c2) return t('writeLoad.shell.varyIncomplete');
      if (q1 === 0 && q2 === 0) return t('writeLoad.zero');
      extra.vary = { dir: AXIS[va.axis], c1, q1, c2, q2 };
    }
    if (partial) {
      const r = region();
      if (typeof r === 'string') return r;
      extra.region = r;
    }
    if (extra.qNodes && shells.some((s) => s.pts.length > extra.qNodes!.length)) return t('writeLoad.shell.cornersIncomplete');
    return shells.map((s) => ({
      type: 'surface3d',
      data: { id: 0, quadId: s.id, ...(s.on ? { on: s.on } : {}), q: qv, ...extra, ...(extra.qNodes ? { qNodes: extra.qNodes.slice(0, s.pts.length) } : {}), ...c },
    }) as Load);
  }
</script>

{#if kind === 'surface'}
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.direction')}</span>
    <span class="fg-wide">
      <select class="fg-wide" bind:value={dirMode} data-testid="wl-sl-dir">
        <option value="down">{t('writeLoad.shell.dir.down')}</option>
        <option value="local">{t('writeLoad.shell.dir.local')}</option>
        <option value="global">{t('writeLoad.shell.dir.global')}</option>
        <option value="projected">{t('writeLoad.shell.dir.projected')}</option>
      </select>
      {#if dirMode === 'global' || dirMode === 'projected'}
        <select class="fg-in sl-axis" bind:value={dirAxis} data-testid="wl-sl-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>+{a}</option>{/each}</select>
      {/if}
    </span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.field')}</span>
    <select class="fg-wide" bind:value={field} data-testid="wl-sl-field">
      <option value="uniform">{t('writeLoad.shell.field.uniform')}</option>
      <option value="corners">{t('writeLoad.shell.field.corners')}</option>
      <option value="axis">{t('writeLoad.shell.field.axis')}</option>
    </select></div>
  {#if field === 'uniform'}
    <div class="fg-r"><span class="fg-l">q</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={q} quantity="areaLoad" testid="wl-sq" /><span class="fg-u">{unitLabel('areaLoad', uiStore.unitSystem)}</span></div>
  {:else if field === 'corners'}
    <div class="fg-r"><span class="fg-l">q₁; q₂; q₃; q₄</span><input type="text" bind:value={qc} class="fg-in sl-list" data-testid="wl-sl-corners" /><span class="fg-u sl-list-u">{unitLabel('areaLoad', uiStore.unitSystem)}</span></div>
  {:else}
    <div class="fg-r"><span class="fg-l">{t('loadTarget.axis')}</span><select class="fg-in" bind:value={va.axis} data-testid="wl-sl-vary-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>{a}</option>{/each}</select></div>
    <div class="fg-r fg-head"><span></span><span>{va.axis} ({unitLabel('length', uiStore.unitSystem)})</span><span>q ({unitLabel('areaLoad', uiStore.unitSystem)})</span></div>
    <div class="fg-r"><span class="fg-l">1</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.c1} quantity="length" testid="wl-sl-c1" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.q1} quantity="areaLoad" testid="wl-sl-q1" /></div>
    <div class="fg-r"><span class="fg-l">2</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.c2} quantity="length" testid="wl-sl-c2" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.q2} quantity="areaLoad" testid="wl-sl-q2" /></div>
    <p class="wl-hint fg-full">{t('writeLoad.shell.varyHint')}</p>
  {/if}
  <label class="wl-check fg-full"><input type="checkbox" bind:checked={partial} data-testid="wl-sl-partial" /> {t('writeLoad.shell.partial')}</label>
  {#if partial}
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.plane')}</span><select class="fg-in" bind:value={rect.plane} data-testid="wl-sl-plane">{#each ['XY', 'XZ', 'YZ'] as p (p)}<option value={p}>{p}</option>{/each}</select></div>
    <div class="fg-r fg-head"><span></span><span>{rect.plane[0]}</span><span>{rect.plane[1]}</span></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.corner')} 1</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.u1} quantity="length" testid="wl-sl-u1" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.v1} quantity="length" testid="wl-sl-v1" /><span class="fg-u fg-u2">{unitLabel('length', uiStore.unitSystem)}</span></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.corner')} 2</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.u2} quantity="length" testid="wl-sl-u2" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.v2} quantity="length" testid="wl-sl-v2" /><span class="fg-u fg-u2">{unitLabel('length', uiStore.unitSystem)}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.shell.partialHint')}</p>
  {/if}
{:else if kind === 'hydro'}
  <div class="fg-r"><span class="fg-l">γ</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={gamma} quantity="density" testid="wl-hy-gamma" /><span class="fg-u">{unitLabel('density', uiStore.unitSystem)}</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.level')}</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={level} quantity="length" testid="wl-hy-level" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.inside')}</p>
  <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.point')}</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.x} quantity="length" testid="wl-hy-x" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.y} quantity="length" testid="wl-hy-y" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.z} quantity="length" testid="wl-hy-z" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.hydroHint')}</p>
{:else}
  <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.point')}</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.x} quantity="length" testid="wl-sp-x" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.y} quantity="length" testid="wl-sp-y" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.z} quantity="length" testid="wl-sp-z" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <div class="fg-r"><span class="fg-l">F</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fx} quantity="force" testid="wl-sp-fx" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fy} quantity="force" testid="wl-sp-fy" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fz} quantity="force" testid="wl-sp-fz" /><span class="fg-u">{unitLabel('force', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.pointHint')}</p>
{/if}

<style>
  /* The grid and its cells are the card's (`ProWriteLoadCard`), shared with every other kind. */
  :global(.wl .fg-r) .sl-list { grid-column: 2 / 5; }
  .sl-axis { width: auto; }
</style>
