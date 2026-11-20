<script lang="ts">
  import Hint from './Hint.svelte';
  /**
   * The project's design data, the ones most edited first: the reinforcing steel and the bar
   * diameters each family chooses among, each kind of element's exposure and clear cover against
   * the minimum of CIRSOC 201-2025 Table 20.5.1.3.1, the concrete of each kind of element, the
   * options the design takes, and a slab's fixed base mesh. Changing any of it keeps the solve and
   * retires the design it fed (`store/design-data.ts`), except the concrete, which is the model's.
   * Office templates carry it with the rest of the starting library.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import {
    BAR_DIAMETERS_MM, DESIGN_KINDS, REBAR_GRADES, coversUnderMinimum, minimumCoverFor, withCirsocCovers,
    type DesignKind, type Exposure, type ProjectDesignData,
  } from '../../lib/model/design-data';
  import { designData, patchDesignData, setDesignData, storedDesignData } from '../../lib/store/design-data';
  import ProConcreteByLevel from './ProConcreteByLevel.svelte';
  import DesignOptionsSections from './design/DesignOptionsSections.svelte';
  import { SLAB_BAR_RANGE, TIE_BAR_RANGE, WALL_BAR_RANGE, inRange } from '../../lib/rc-sheets/types';

  const d = $derived.by(() => { void modelStore.designData; return designData(); });
  const stated = $derived(modelStore.designData !== undefined);
  const under = $derived(coversUnderMinimum(d));
  const EXPOSURES: Exposure[] = ['interior', 'exterior', 'ground'];

  const setCover = (k: DesignKind, mm: number) => { if (mm >= 0) patchDesignData({ covers: { ...storedDesignData().covers, [k]: mm / 1000 } }); };
  const setExposure = (k: DesignKind, e: Exposure) => patchDesignData({ exposure: { ...storedDesignData().exposure, [k]: e } });
  type ListKey = 'longDiametersMm' | 'stirrupDiametersMm' | 'slabDiametersMm' | 'wallDiametersMm';
  const LISTS: Array<{ key: ListKey; id: string; label: string; range: { min: number; max: number } }> = [
    { key: 'longDiametersMm', id: 'long', label: 'designData.longitudinal', range: { min: 8, max: Infinity } },
    { key: 'stirrupDiametersMm', id: 'ties', label: 'designData.stirrups', range: TIE_BAR_RANGE },
    { key: 'slabDiametersMm', id: 'slab', label: 'designData.slabBars', range: SLAB_BAR_RANGE },
    { key: 'wallDiametersMm', id: 'wall', label: 'designData.wallBar', range: WALL_BAR_RANGE },
  ];
  const slabBaseSummary = $derived.by(() => {
    const on = (['bottomX', 'bottomY', 'topX', 'topY'] as const).flatMap((k) => (d.slabBase?.[k] ? [`${t(`slabEd.key.${k}`)} Ø${d.slabBase[k]!.diameter} c/${d.slabBase[k]!.spacing * 100}`] : []));
    return on.length ? on.join(' · ') : t('designData.slabBaseNone');
  });
  const toggle = (key: ListKey, dia: number) => {
    const list = d[key];
    const next = list.includes(dia) ? list.filter((x) => x !== dia) : [...list, dia].sort((a, b) => a - b);
    if (next.length > 0) patchDesignData({ [key]: next } as Partial<ProjectDesignData>);
  };
  function grade(name: string) {
    const g = REBAR_GRADES.find((x) => x.name === name);
    if (g) patchDesignData({ rebarGrade: g.name, rebarFy: g.fy });
  }

</script>

<div class="pk dd" data-testid="design-data-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('designData.title')}</h4>
    <Hint text={t('designData.explain')} />
    <div class="dd-row">
      <button class="pk-btn pk-btn-primary" onclick={() => patchDesignData({ rebarGrade: 'ADN 420', rebarFy: 420, covers: withCirsocCovers({ ...d, rebarGrade: 'ADN 420', rebarFy: 420 }).covers })} data-testid="design-data-cirsoc">{t('designData.cirsocPreset')}</button>
      {#if stated}<button class="pk-btn" onclick={() => setDesignData(null)} data-testid="design-data-reset">{t('designData.reset')}</button>{/if}
    </div>
  </section>

  <section class="pk-card" data-testid="design-data-steel">
    <h5 class="dd-h">{t('designData.steel')}</h5>
    <div class="dd-row">
      <label class="dd-inline">{t('designData.grade')}
        <select value={d.rebarGrade} onchange={(e) => grade(e.currentTarget.value)} data-testid="design-data-grade">
          {#each REBAR_GRADES as g}<option value={g.name}>{g.name}</option>{/each}
          {#if !REBAR_GRADES.some((g) => g.name === d.rebarGrade)}<option value={d.rebarGrade}>{d.rebarGrade}</option>{/if}
        </select>
      </label>
      <label class="dd-inline">fy <input type="number" min="200" step="10" value={d.rebarFy} onchange={(e) => patchDesignData({ rebarFy: Number(e.currentTarget.value) || d.rebarFy })} data-testid="design-data-fy" /> MPa</label>
    </div>
    <h5 class="dd-h dd-gap">{t('designData.diameters')}</h5>
    <Hint text={t('designData.diametersHint')} />
    {#each LISTS as l (l.key)}
      <div class="dd-sub">{t(l.label)}</div>
      <div class="dd-chips">
        {#each BAR_DIAMETERS_MM.filter((x) => inRange(x, l.range)) as dia}
          <button class="dd-chip" class:on={d[l.key].includes(dia)} aria-pressed={d[l.key].includes(dia)} onclick={() => toggle(l.key, dia)} data-testid="design-data-{l.id}-{dia}">Ø{dia}</button>
        {/each}
      </div>
    {/each}
  </section>

  <section class="pk-card" data-testid="design-data-covers">
    <h5 class="dd-h">{t('designData.covers')}</h5>
    <Hint text={t('designData.coversHint')} />
    <label class="dd-inline"><input type="checkbox" checked={d.executionControl !== false} onchange={(e) => patchDesignData({ executionControl: e.currentTarget.checked ? undefined : false })} data-testid="design-data-control" /> {t('designData.executionControl')}</label>
    <table class="dd-table">
      <thead><tr><th></th><th>{t('designData.exposure')}</th><th>{t('designData.cover')}</th><th>{t('designData.minimum')}</th></tr></thead>
      <tbody>
        {#each DESIGN_KINDS as k (k)}
          {@const min = minimumCoverFor(d, k)}
          <tr class:dd-under={d.covers[k] < min - 1e-9}>
            <td>{t(`designData.kind.${k}`)}</td>
            <td>
              <select value={d.exposure[k]} onchange={(e) => setExposure(k, e.currentTarget.value as Exposure)}>
                {#each EXPOSURES as x}<option value={x}>{t(`designData.exp.${x}`)}</option>{/each}
              </select>
            </td>
            <td><input type="number" min="0" step="5" value={Math.round(d.covers[k] * 1000)} onchange={(e) => setCover(k, Number(e.currentTarget.value))} data-testid="design-data-cover-{k}" /> mm</td>
            <td class="dd-num">{Math.round(min * 1000)} mm</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if under.length > 0}
      <p class="pk-hint dd-warn" data-testid="design-data-under">{tp('designData.underMinimum', { kinds: under.map((u) => t(`designData.kind.${u.kind}`)).join(', ') })}</p>
    {/if}
  </section>

  <ProConcreteByLevel />

  <DesignOptionsSections />

  <details class="pk-card dd-more" data-testid="design-data-slab-base">
    <summary><span class="dd-h">{t('designData.slabBase')}</span> <span class="dd-sum">{slabBaseSummary}</span></summary>
    <Hint text={t('designData.slabBaseHint')} />
    {#each ['bottomX', 'bottomY', 'topX', 'topY'] as k}
      {@const v = d.slabBase?.[k as 'bottomX']}
      <div class="dd-row">
        <label class="dd-inline"><input type="checkbox" checked={!!v} onchange={(e) => patchDesignData({ slabBase: { ...(d.slabBase ?? {}), [k]: e.currentTarget.checked ? { diameter: 8, spacing: 0.2 } : undefined } })} /> {t(`slabEd.key.${k}`)}</label>
        {#if v}
          <label class="dd-inline">Ø<input type="number" min="6" max="20" value={v.diameter} onchange={(e) => patchDesignData({ slabBase: { ...(d.slabBase ?? {}), [k]: { ...v, diameter: Number(e.currentTarget.value) } } })} /></label>
          <label class="dd-inline">c/<input type="number" min="5" max="45" step="2.5" value={v.spacing * 100} onchange={(e) => patchDesignData({ slabBase: { ...(d.slabBase ?? {}), [k]: { ...v, spacing: Number(e.currentTarget.value) / 100 } } })} /> cm</label>
        {/if}
      </div>
    {/each}
  </details>
</div>

<style>
  .dd-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .dd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; }
  .dd-inline { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .dd-inline input { width: 4.5rem; font-size: 0.72rem; }
  .dd-table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  .dd-table th { text-align: left; font-weight: 500; color: var(--st-text-2); padding: 2px 4px; }
  .dd-table td { padding: 2px 4px; border-top: 1px solid var(--st-hair); }
  .dd-table input { width: 3.6rem; font-size: 0.7rem; }
  .dd-num { font-variant-numeric: tabular-nums; color: var(--st-text-2); }
  .dd-under td { color: var(--st-warn); }
  .dd-warn { color: var(--st-warn); }
  .dd-sub { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); margin-top: 4px; }
  /* Read as working copy in its own place of design, so its hints meet AA (--st-text-2). */
  .dd :global(.pk-hint:not(.dd-warn)) { color: var(--st-text-2); }
  .dd-chips { display: flex; flex-wrap: wrap; gap: 3px; margin: 3px 0 6px; }
  .dd-chip { font-size: 0.66rem; padding: 1px 7px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-2); border-radius: 10px; cursor: pointer; }
  .dd-chip.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-3); }
  .dd-gap { margin-top: 10px; }
  .dd-more > summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .dd-sum { font-size: 0.68rem; color: var(--st-text-2); }
</style>
