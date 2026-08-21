<script lang="ts">
  /**
   * Live section schematics.
   *
   * IMPORTANT: the section dimensions come from `ctx.axes` (bFlex/hFlex), the same
   * orientation the capacity check uses. The old code read raw `sec.b`/`sec.h` here
   * while the verifier used the axis-corrected pair, so a rotated member showed one
   * section in the drawing and was checked as another.
   */
  import { t } from '../../../lib/i18n';
  import {
    resolveLayers, computeSectionLayout, computeColumnLayout, resolveColumnReinf,
  } from '../../../lib/engine/station-design-forces';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import { getReinforcement } from '../../../lib/store/rebar-edit';

  interface Props { elementId: number; ctx: MemberContext; version: number }
  let { elementId, ctx, version }: Props = $props();

  const view = $derived.by(() => {
    void version;
    const p = getReinforcement(elementId);
    if (!p) return null;
    const b = ctx.axes.bFlex;
    const h = ctx.axes.hFlex;
    const cover = ctx.material.cover;
    const reg = p.regions;
    const stir = reg?.stirrupsSupport ?? reg?.stirrupsSpan ?? p.stirrups;
    const stirDia = stir?.diameter ?? ctx.material.stirrupDia;

    if (ctx.elementType === 'column') {
      const col = resolveColumnReinf(p.column, p.longitudinal);
      if (!col) return null;
      const layout = computeColumnLayout(col.totalCount, col.cornerDia, ctx.section.b, ctx.section.h,
        cover, p.stirrups?.diameter ?? stirDia, p.column);
      return { kind: 'column' as const, b: ctx.section.b, h: ctx.section.h, cover, stirDia: p.stirrups?.diameter ?? stirDia, layout };
    }

    const top = resolveLayers(reg?.topStartLayers, reg?.topStart ?? p.top);
    const topEnd = resolveLayers(reg?.topEndLayers, reg?.topEnd ?? p.top);
    const bot = resolveLayers(reg?.bottomSpanLayers, reg?.bottomSpan ?? p.bottom);
    return {
      kind: 'beam' as const, b, h, cover, stirDia,
      regions: [
        { label: t('design.batch.fieldTopStart'), layout: computeSectionLayout(top, bot, b, h, cover, stirDia), tension: 'top' as const },
        { label: t('design.batch.fieldBottomSpan'), layout: computeSectionLayout(top, bot, b, h, cover, stirDia), tension: 'bottom' as const },
        { label: t('design.batch.fieldTopEnd'), layout: computeSectionLayout(topEnd, bot, b, h, cover, stirDia), tension: 'top' as const },
      ],
    };
  });

  const SCALE_PX = 110;
</script>

{#if view}
  <div class="schematics" data-testid={`schematics-${elementId}`}>
    {#if view.kind === 'beam'}
      <div class="row">
        {#each view.regions as reg (reg.label)}
          {@const L = reg.layout}
          {@const sc = SCALE_PX / Math.max(L.sectionWidth, L.sectionHeight)}
          {@const w = L.sectionWidth * sc + 14}
          {@const hh = L.sectionHeight * sc + 14}
          {@const inset = (view.cover + view.stirDia / 2000) * sc}
          <div class="cell">
            <div class="cap">{reg.label}</div>
            <svg viewBox="0 0 {w} {hh}" width={w} height={hh} role="img"
                 aria-label={`${reg.label} ${(view.b * 100).toFixed(0)}x${(view.h * 100).toFixed(0)} cm`}>
              <rect x="7" y="7" width={L.sectionWidth * sc} height={L.sectionHeight * sc}
                    fill="var(--st-surface-3)" stroke="var(--st-value)" stroke-width="1" />
              <rect x={7 + inset} y={7 + inset}
                    width={L.sectionWidth * sc - 2 * inset} height={L.sectionHeight * sc - 2 * inset}
                    fill="none" stroke="var(--st-warn)" stroke-width={Math.max(view.stirDia / 1000 * sc, 1.2)}
                    rx="2" opacity="0.85" />
              {#each L.allBars as bar}
                {@const isTens = bar.face === reg.tension}
                <circle cx={7 + bar.x * sc} cy={7 + (L.sectionHeight - bar.y) * sc}
                        r={Math.max((bar.diameter / 2000) * sc, 2.2)}
                        fill={isTens ? 'var(--st-ok)' : 'var(--st-warn)'}
                        stroke={isTens ? 'var(--st-ok)' : 'var(--st-warn)'} stroke-width="0.5" />
              {/each}
            </svg>
            <div class="legend">
              <span class="dim">{(view.b * 100).toFixed(0)}×{(view.h * 100).toFixed(0)}</span>
              {#if L.issues.length > 0}<span class="bad">{L.issues.length} ⚠</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      {@const L = view.layout}
      {@const sc = SCALE_PX / Math.max(view.b, view.h)}
      {@const w = view.b * sc + 14}
      {@const hh = view.h * sc + 14}
      {@const inset = (view.cover + view.stirDia / 2000) * sc}
      <div class="row">
        <div class="cell">
          <div class="cap">{t('design.batch.fieldColumnBars')}</div>
          <svg viewBox="0 0 {w} {hh}" width={w} height={hh} role="img"
               aria-label={`column ${(view.b * 100).toFixed(0)}x${(view.h * 100).toFixed(0)} cm`}>
            <rect x="7" y="7" width={view.b * sc} height={view.h * sc}
                  fill="var(--st-surface-3)" stroke="var(--st-value)" stroke-width="1" />
            <rect x={7 + inset} y={7 + inset} width={view.b * sc - 2 * inset} height={view.h * sc - 2 * inset}
                  fill="none" stroke="var(--st-warn)" stroke-width={Math.max(view.stirDia / 1000 * sc, 1.2)}
                  rx="2" opacity="0.85" />
            {#each L.bars as bar}
              <circle cx={7 + bar.x * sc} cy={7 + (view.h - bar.y) * sc}
                      r={Math.max((bar.diameter / 2000) * sc, 2.6)}
                      fill={bar.index < 4 ? 'var(--st-accent)' : 'var(--st-warn)'}
                      stroke={bar.index < 4 ? 'var(--st-danger)' : 'var(--st-warn)'} stroke-width="0.5" />
            {/each}
          </svg>
          <div class="legend">
            <span class="dim">{(view.b * 100).toFixed(0)}×{(view.h * 100).toFixed(0)}</span>
            <span class="dim">{L.totalArea.toFixed(1)} cm²</span>
            {#if L.issues.length > 0}<span class="bad">{L.issues.length} ⚠</span>{/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .schematics { margin-top: 6px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .cap { font-size: 0.64rem; color: var(--st-info); font-weight: 600; }
  .legend { display: flex; gap: 6px; font-size: 0.62rem; font-family: monospace; color: var(--st-text-2); }
  .bad { color: var(--st-danger); font-weight: 700; }
  .dim { color: var(--st-text-3); }
</style>
