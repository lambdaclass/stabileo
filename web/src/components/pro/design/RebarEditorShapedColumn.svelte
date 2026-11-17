<script lang="ts">
  /**
   * The reinforcement of a circular, T or L column: how many bars go around its outline and their
   * diameter, and its ties or, on a circle, its spiral. A drawing of the section shows where the
   * bars sit (`shaped-column.ts`, the same positions the check and the detailing use).
   */
  import { t } from '../../../lib/i18n';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import { grossAreaOf, outlineOf, shapedBarPositions, minClear } from '../../../lib/engine/design/shaped-column';
  import { outlineRings } from '../../../lib/engine/codes/argentina/cirsoc201-section';
  import { getReinforcement, setShapedBars, setTies } from '../../../lib/store/rebar-edit';

  interface Props { elementId: number; ctx: MemberContext; version: number }
  let { elementId, ctx, version }: Props = $props();
  const DIAS = [10, 12, 16, 20, 25, 32];
  const TIE_DIAS = [6, 8, 10, 12];

  const st = $derived.by(() => {
    void version;
    const shape = ctx.shape!;
    const p = getReinforcement(elementId);
    const s = p?.shaped;
    const tieDia = s?.spiral?.diameter ?? p?.stirrups?.diameter ?? ctx.material.stirrupDia;
    const pts = s ? shapedBarPositions(shape, s.count, s.diameter, ctx.material.cover, tieDia) : [];
    const area = s ? s.count * Math.PI * s.diameter ** 2 / 400 : 0;
    const rho = area / (grossAreaOf(shape) * 1e4);
    return { shape, p, s, pts, area, rho, clear: s ? minClear(pts, s.diameter) : 0, outer: outlineRings(outlineOf(shape)).outer };
  });
  const box = $derived.by(() => {
    const xs = st.outer.map((q) => q.x), ys = st.outer.map((q) => q.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  });
  const sc = $derived(110 / Math.max(box.maxX - box.minX, box.maxY - box.minY, 1e-6));
  const X = (x: number) => 8 + (x - box.minX) * sc, Y = (y: number) => 8 + (box.maxY - y) * sc;
</script>

<div class="editor" data-testid={`rebar-editor-shaped-${elementId}`}>
  <div class="region">
    <div class="region-head"><span class="region-title">{t(`shapedCol.kind.${st.shape.kind}`)}</span></div>
    <div class="line">
      <input type="number" class="num" min="4" max="40" value={st.s?.count ?? 6} aria-label={t('design.batch.count')}
             data-testid={`shaped-count-${elementId}`} onchange={(e) => setShapedBars(elementId, { count: +e.currentTarget.value })} />
      <select class="sel" value={st.s?.diameter ?? 16} aria-label={t('design.batch.diameter')}
              onchange={(e) => setShapedBars(elementId, { diameter: +e.currentTarget.value })}>
        {#each DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
      </select>
      <span class="total" class:bad={st.rho < 0.01 || st.rho > 0.08}>ρ = {(st.rho * 100).toFixed(2)} % · {st.area.toFixed(1)} cm²</span>
      {#if st.s}<span class="total" class:bad={st.clear < Math.max(0.04, 1.5 * st.s.diameter / 1000)}>{t('shapedCol.clear')} {(st.clear * 100).toFixed(1)} cm</span>{/if}
    </div>
    <svg width={X(box.maxX) + 8} height={Y(box.minY) + 8} role="img" aria-label={t(`shapedCol.kind.${st.shape.kind}`)}>
      {#if st.shape.kind === 'circle'}
        <circle cx={X(0)} cy={Y(0)} r={(st.shape.D / 2) * sc} class="conc" />
      {:else}
        <polygon points={st.outer.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')} class="conc" />
      {/if}
      {#each st.pts as q}<circle cx={X(q.x)} cy={Y(q.y)} r={Math.max(((st.s?.diameter ?? 16) / 2000) * sc, 2)} class="bar" />{/each}
    </svg>
  </div>

  <div class="region">
    <div class="region-head"><span class="region-title">{st.s?.spiral ? t('shapedCol.spiral') : t('design.batch.fieldTies')}</span></div>
    {#if st.shape.kind === 'circle'}
      <label class="line sub"><input type="checkbox" checked={!!st.s?.spiral} data-testid={`shaped-spiral-${elementId}`}
        onchange={(e) => setShapedBars(elementId, { spiral: e.currentTarget.checked ? { diameter: 10, pitch: 0.06 } : null })} /> {t('shapedCol.useSpiral')}</label>
    {/if}
    {#if st.s?.spiral}
      <div class="line">
        <span class="sub">Ø</span>
        <select class="sel" value={st.s.spiral.diameter} onchange={(e) => setShapedBars(elementId, { spiral: { ...st.s!.spiral!, diameter: +e.currentTarget.value } })}>
          {#each TIE_DIAS as d (d)}<option value={d}>{d}</option>{/each}
        </select>
        <span class="sub">{t('shapedCol.pitch')}</span>
        <QuantityInput quantity="length" cls="num num-sp" min={0.03} max={0.1} value={st.s.spiral.pitch}
          ariaLabel={t('shapedCol.pitch')} onchange={(v) => setShapedBars(elementId, { spiral: { ...st.s!.spiral!, pitch: v } })} />
      </div>
    {:else}
      <div class="line">
        <span class="sub">eØ</span>
        <select class="sel" value={st.p?.stirrups?.diameter ?? 8} onchange={(e) => setTies(elementId, { diameter: +e.currentTarget.value })}>
          {#each TIE_DIAS as d (d)}<option value={d}>{d}</option>{/each}
        </select>
        <span class="sub">c/</span>
        <QuantityInput quantity="length" cls="num num-sp" min={0.05} max={0.5} value={st.p?.stirrups?.spacing ?? 0.15}
          ariaLabel={t('design.batch.spacingShort')} onchange={(v) => setTies(elementId, { spacing: v })} />
      </div>
    {/if}
  </div>
</div>

<style>
  .editor { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
  .region { background: var(--st-surface-2); border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 5px 7px; }
  .region-head { display: flex; gap: 5px; margin-bottom: 3px; }
  .region-title { font-size: 0.7rem; font-weight: 600; color: var(--st-info); }
  .line { display: flex; align-items: center; gap: 4px; margin: 2px 0; flex-wrap: wrap; }
  .num { width: 46px; padding: 1px 4px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); font-size: 0.7rem; }
  .line :global(input.num-sp) { width: 56px; }
  .sel { padding: 1px 3px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); font-size: 0.7rem; }
  .sub { font-size: 0.64rem; color: var(--st-text-2); }
  .total { font-family: monospace; font-size: 0.66rem; color: var(--st-text-2); }
  .total.bad { color: var(--st-danger); font-weight: 700; }
  .conc { fill: var(--st-surface-3); stroke: var(--st-value); stroke-width: 1; }
  .bar { fill: var(--st-ok); }
</style>
