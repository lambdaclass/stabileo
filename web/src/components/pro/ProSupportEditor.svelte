<script lang="ts">
  /**
   * One editor for everything a support holds: which degrees of freedom are fixed, a spring on
   * the free ones, a multilinear curve where a spring is not linear, and an inclined plane.
   * It replaces the separate restraint row and spring row the table had, which made a free
   * degree with a spring impossible to state.
   *
   * An inclined support holds the node along a normal, typed, from two points picked in the
   * model, or toward another node; its translations are then free and the normal carries the
   * restraint (the solver's penalty on the normal).
   */
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { placementStore } from '../../lib/store/placement.svelte';
  import type { Support } from '../../lib/store/model.svelte';

  let { support }: { support: Support } = $props();

  const DOF = [
    { key: 'tx', label: 'ux', k: 'kx', unit: 'kN/m', c: 'x' },
    { key: 'ty', label: 'uy', k: 'ky', unit: 'kN/m', c: 'y' },
    { key: 'tz', label: 'uz', k: 'kz', unit: 'kN/m', c: 'z' },
    { key: 'rx', label: 'rx', k: 'krx', unit: 'kN·m/rad', c: null },
    { key: 'ry', label: 'ry', k: 'kry', unit: 'kN·m/rad', c: null },
    { key: 'rz', label: 'rz', k: 'krz', unit: 'kN·m/rad', c: null },
  ] as const;

  const isCustom = $derived(support.type === 'custom3d');
  const restraints = $derived(support.dofRestraints ?? { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false });
  const fixed = (key: (typeof DOF)[number]['key']) => (isCustom ? restraints[key] : false);

  function setFixed(key: (typeof DOF)[number]['key'], v: boolean) {
    modelStore.updateSupport(support.id, { dofRestraints: { ...restraints, [key]: v } });
  }
  function setSpring(k: string, v: string) {
    modelStore.updateSupport(support.id, { [k]: parseFloat(v.replace(',', '.')) || 0 } as never);
  }

  /** "d F; d F" in mm and kN, as typed. */
  const curveText = (c: 'x' | 'y' | 'z') =>
    (support.curves?.[c] ?? []).map(([d, f]) => `${+(d * 1000).toFixed(3)} ${+f.toFixed(3)}`).join('; ');
  function setCurve(c: 'x' | 'y' | 'z', text: string) {
    const pts: Array<[number, number]> = [];
    for (const part of text.split(';').map((x) => x.trim()).filter(Boolean)) {
      const [d, f] = part.split(/\s+/).map((x) => Number(x.replace(',', '.')));
      if (!(d! > 0) || !Number.isFinite(f)) return;
      pts.push([d! / 1000, f!]);
    }
    const next = { ...(support.curves ?? {}) };
    if (pts.length) next[c] = pts.sort((a, b) => a[0] - b[0]); else delete next[c];
    modelStore.updateSupport(support.id, { curves: next });
  }

  // ── Inclined ──
  const inclined = $derived(!!support.isInclined);
  function setNormal(n: [number, number, number] | null) {
    const len = n ? Math.hypot(...n) : 0;
    if (n && len > 1e-12) {
      // The normal carries the restraint, so the translations are left free; rotations stay.
      const r = support.type === 'custom3d' ? restraints : { tx: true, ty: true, tz: true, rx: support.type === 'fixed3d', ry: support.type === 'fixed3d', rz: support.type === 'fixed3d' };
      modelStore.updateSupport(support.id, {
        type: 'custom3d', dofRestraints: { ...r, tx: false, ty: false, tz: false },
        isInclined: true, normalX: n[0] / len, normalY: n[1] / len, normalZ: n[2] / len,
      });
    } else {
      modelStore.updateSupport(support.id, { isInclined: undefined, normalX: undefined, normalY: undefined, normalZ: undefined } as never);
    }
  }
  function normalFromPoints() {
    placementStore.pickPoints(2, (k) => t('support.pickNormal').replace('{k}', String(k)), ([a, b]) => {
      setNormal([b![0] - a![0], b![1] - a![1], b![2] - a![2]]);
    });
  }
  let towardNode = $state('');
  function normalTowardNode() {
    const n = modelStore.nodes.get(Number(towardNode)), me = modelStore.nodes.get(support.nodeId);
    if (!n || !me) return;
    setNormal([n.x - me.x, n.y - me.y, (n.z ?? 0) - (me.z ?? 0)]);
  }
</script>

<div class="se" data-testid="sup-editor-{support.id}">
  <table class="se-grid">
    <thead><tr><th></th>{#if isCustom}<th>{t('support.fixed')}</th>{/if}<th>{t('support.spring')}</th><th>{t('support.curve')}</th></tr></thead>
    <tbody>
      {#each DOF as d (d.key)}
        <tr>
          <td class="se-dof">{d.label}</td>
          {#if isCustom}
            <td><input type="checkbox" checked={fixed(d.key)} onchange={(e) => setFixed(d.key, e.currentTarget.checked)} data-testid="sup-fix-{support.id}-{d.key}" /></td>
          {/if}
          <td>
            <input type="text" class="se-num" value={(support as unknown as Record<string, number | undefined>)[d.k] ?? ''} placeholder={d.unit}
                   disabled={fixed(d.key)} onchange={(e) => setSpring(d.k, e.currentTarget.value)} />
          </td>
          <td>
            {#if d.c}
              <input type="text" class="se-curve" value={curveText(d.c)} placeholder="mm kN; mm kN" disabled={fixed(d.key)}
                     onchange={(e) => setCurve(d.c!, e.currentTarget.value)} data-testid="sup-curve-{support.id}-{d.c}" />
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="se-hint">{t('support.curveHint')}</p>

  <div class="se-row">
    <span>{t('support.inclined')}:</span>
    {#if inclined}
      <span class="se-mono">n = ({support.normalX?.toFixed(3)}, {support.normalY?.toFixed(3)}, {support.normalZ?.toFixed(3)})</span>
      <button type="button" onclick={() => setNormal(null)}>{t('support.inclinedOff')}</button>
    {/if}
    <button type="button" onclick={normalFromPoints} data-testid="sup-normal-points-{support.id}">{t('support.normalPoints')}</button>
    <input type="text" class="se-num" placeholder={t('support.node')} bind:value={towardNode} />
    <button type="button" disabled={!towardNode} onclick={normalTowardNode} data-testid="sup-normal-node-{support.id}">{t('support.normalNode')}</button>
  </div>
</div>

<style>
  .se { display: flex; flex-direction: column; gap: 4px; font-size: 0.64rem; color: var(--st-text-2); }
  .se-grid { border-collapse: collapse; }
  .se-grid th { font-weight: 500; color: var(--st-text-3); text-align: left; padding: 1px 4px; }
  .se-grid td { padding: 1px 4px; }
  .se-dof { font-family: var(--st-mono); }
  .se-num { width: 72px; }
  .se-curve { width: 150px; }
  .se-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .se-mono { font-family: var(--st-mono); }
  .se-hint { margin: 0; color: var(--st-text-3); font-size: 0.6rem; }
  button { padding: 1px 6px; font-size: 0.62rem; background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); border-radius: 3px; cursor: pointer; }
</style>
