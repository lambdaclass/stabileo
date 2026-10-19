<script lang="ts">
  /**
   * The project's design data, in one place: the reinforcing steel, the stirrup the depth
   * arithmetic assumes, each kind of element's exposure and clear cover against the minimum of
   * CIRSOC 201-2025 Table 20.5.1.3.1, the bar diameters the design may choose from, a wall's bar,
   * whether the beams are part of the lateral-force-resisting system (§9.7.3.8.2; each beam may
   * declare its own on the desk), the concrete of each kind of element by level, and the
   * deflection limits. Changing any of it
   * keeps the solve and retires the design it fed (`store/design-data.ts`). Office templates
   * carry it with the rest of the starting library.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import {
    BAR_DIAMETERS_MM, DESIGN_KINDS, REBAR_GRADES, coversUnderMinimum, largestBar, minimumCover, withCirsocCovers,
    type DesignKind, type Exposure, type ProjectDesignData,
  } from '../../lib/model/design-data';
  import { designData, patchDesignData, setDesignData } from '../../lib/store/design-data';
  import { assignConcrete } from '../../lib/model/building/assign-concrete';
  import { materialFamilyOf } from '../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../lib/engine/steel/grade-family';
  import ProDeflectionLimits from './ProDeflectionLimits.svelte';
  import { setBeamsLateral } from '../../lib/store/lateral-system';

  const d = $derived.by(() => { void modelStore.designData; return designData(); });
  const stated = $derived(modelStore.designData !== undefined);
  const under = $derived(coversUnderMinimum(d));
  const EXPOSURES: Exposure[] = ['interior', 'exterior', 'ground'];

  const setCover = (k: DesignKind, mm: number) => { if (mm >= 0) patchDesignData({ covers: { ...d.covers, [k]: mm / 1000 } }); };
  const setExposure = (k: DesignKind, e: Exposure) => patchDesignData({ exposure: { ...d.exposure, [k]: e } });
  const toggle = (key: 'longDiametersMm' | 'stirrupDiametersMm', dia: number) => {
    const list = d[key];
    const next = list.includes(dia) ? list.filter((x) => x !== dia) : [...list, dia].sort((a, b) => a - b);
    if (next.length > 0) patchDesignData({ [key]: next } as Partial<ProjectDesignData>);
  };
  function grade(name: string) {
    const g = REBAR_GRADES.find((x) => x.name === name);
    if (g) patchDesignData({ rebarGrade: g.name, rebarFy: g.fy });
  }

  // ── Concrete by kind and level ──
  const concretes = $derived([...modelStore.materials.values()].filter((m) => materialFamilyOf(m, catalogueGradeFamily).family === 'concrete'));
  const levels = $derived(modelStore.grid?.levels ?? []);
  let ckind = $state<DesignKind>('column'), cmat = $state(0), clevel = $state('');
  $effect(() => { if (!concretes.some((m) => m.id === cmat) && concretes[0]) cmat = concretes[0].id; });
  let assigned = $state<number | null>(null);
  function assign() { if (ckind !== 'footing') assigned = assignConcrete(ckind, cmat, clevel || undefined); }
</script>

<div class="pk dd" data-testid="design-data-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('designData.title')}</h4>
    <p class="pk-hint">{t('designData.explain')}</p>
    <div class="dd-row">
      <button class="pk-btn pk-btn-primary" onclick={() => setDesignData(withCirsocCovers({ ...d, rebarGrade: 'ADN 420', rebarFy: 420 }))} data-testid="design-data-cirsoc">{t('designData.cirsocPreset')}</button>
      {#if stated}<button class="pk-btn" onclick={() => setDesignData(null)} data-testid="design-data-reset">{t('designData.reset')}</button>{/if}
    </div>
  </section>

  <section class="pk-card">
    <h5 class="dd-h">{t('designData.steel')}</h5>
    <div class="dd-row">
      <label class="dd-inline">{t('designData.grade')}
        <select value={d.rebarGrade} onchange={(e) => grade(e.currentTarget.value)} data-testid="design-data-grade">
          {#each REBAR_GRADES as g}<option value={g.name}>{g.name}</option>{/each}
          {#if !REBAR_GRADES.some((g) => g.name === d.rebarGrade)}<option value={d.rebarGrade}>{d.rebarGrade}</option>{/if}
        </select>
      </label>
      <label class="dd-inline">fy <input type="number" min="200" step="10" value={d.rebarFy} onchange={(e) => patchDesignData({ rebarFy: Number(e.currentTarget.value) || d.rebarFy })} data-testid="design-data-fy" /> MPa</label>
      <label class="dd-inline">{t('designData.stirrup')}
        <select value={d.stirrupDiaMm} onchange={(e) => patchDesignData({ stirrupDiaMm: Number(e.currentTarget.value) })} data-testid="design-data-stirrup">
          {#each BAR_DIAMETERS_MM.filter((x) => x <= 16) as dia}<option value={dia}>Ø{dia}</option>{/each}
        </select>
      </label>
    </div>
  </section>

  <section class="pk-card" data-testid="design-data-covers">
    <h5 class="dd-h">{t('designData.covers')}</h5>
    <p class="pk-hint">{t('designData.coversHint')}</p>
    <table class="dd-table">
      <thead><tr><th></th><th>{t('designData.exposure')}</th><th>{t('designData.cover')}</th><th>{t('designData.minimum')}</th></tr></thead>
      <tbody>
        {#each DESIGN_KINDS as k (k)}
          {@const min = minimumCover(k, d.exposure[k], largestBar(d, k))}
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

  <section class="pk-card">
    <h5 class="dd-h">{t('designData.diameters')}</h5>
    <div class="dd-sub">{t('designData.longitudinal')}</div>
    <div class="dd-chips">
      {#each BAR_DIAMETERS_MM.filter((x) => x >= 8) as dia}
        <button class="dd-chip" class:on={d.longDiametersMm.includes(dia)} aria-pressed={d.longDiametersMm.includes(dia)} onclick={() => toggle('longDiametersMm', dia)} data-testid="design-data-long-{dia}">Ø{dia}</button>
      {/each}
    </div>
    <div class="dd-sub">{t('designData.stirrups')}</div>
    <div class="dd-chips">
      {#each BAR_DIAMETERS_MM.filter((x) => x <= 16) as dia}
        <button class="dd-chip" class:on={d.stirrupDiametersMm.includes(dia)} aria-pressed={d.stirrupDiametersMm.includes(dia)} onclick={() => toggle('stirrupDiametersMm', dia)}>Ø{dia}</button>
      {/each}
    </div>
    <label class="dd-inline dd-check"><input type="checkbox" checked={d.columnEndZones === true} onchange={(e) => patchDesignData({ columnEndZones: e.currentTarget.checked })} data-testid="design-data-end-zones" /> {t('designData.columnEndZones')}</label>
    <p class="pk-hint">{t('designData.columnEndZonesHint')}</p>
    <label class="dd-inline">{t('designData.wallBar')}
      <select value={d.wallBarDiaMm} onchange={(e) => patchDesignData({ wallBarDiaMm: Number(e.currentTarget.value) })} data-testid="design-data-wall">
        {#each BAR_DIAMETERS_MM.filter((x) => x >= 8 && x <= 20) as dia}<option value={dia}>Ø{dia}</option>{/each}
      </select>
    </label>
  </section>

  <section class="pk-card" data-testid="design-data-lateral">
    <h5 class="dd-h">{t('lateral.title')}</h5>
    <p class="pk-hint">{t('lateral.projectHint')}</p>
    <label class="dd-inline">{t('lateral.beams')}
      <select value={d.lateralSystem?.beams ?? ''} onchange={(e) => { const v = e.currentTarget.value; setBeamsLateral(v === 'lateral' || v === 'gravity' ? v : null); }} data-testid="design-data-lateral-beams">
        <option value="">{t('lateral.option.undeclared')}</option>
        <option value="lateral">{t('lateral.option.lateral')}</option>
        <option value="gravity">{t('lateral.option.gravity')}</option>
      </select>
    </label>
  </section>

  <section class="pk-card" data-testid="design-data-slab-base">
    <h5 class="dd-h">{t('designData.slabBase')}</h5>
    <p class="pk-hint">{t('designData.slabBaseHint')}</p>
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
  </section>

  <section class="pk-card" data-testid="design-data-concrete">
    <h5 class="dd-h">{t('designData.concrete')}</h5>
    <p class="pk-hint">{t('designData.concreteHint')}</p>
    {#if concretes.length === 0}<p class="pk-hint">{t('designData.noConcrete')}</p>{:else}
      <div class="dd-row">
        <select bind:value={ckind} aria-label={t('physical.kindCol')}>{#each DESIGN_KINDS.filter((k) => k !== 'footing') as k}<option value={k}>{t(`designData.kind.${k}`)}</option>{/each}</select>
        <select bind:value={clevel} aria-label={t('building.level')}>
          <option value="">{t('designData.allLevels')}</option>
          {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
        </select>
        <select bind:value={cmat} aria-label={t('building.material')}>{#each concretes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
        <button class="pk-btn" onclick={assign} data-testid="design-data-assign">{t('designData.assign')}</button>
      </div>
      {#if assigned !== null}<p class="pk-hint" role="status">{tp('designData.assigned', { n: assigned })}</p>{/if}
    {/if}
  </section>

  <section class="pk-card">
    <h5 class="dd-h">{t('designData.deflection')}</h5>
    <ProDeflectionLimits />
  </section>
</div>

<style>
  .dd-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .dd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; }
  .dd-inline { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text-2); }
  .dd-inline input { width: 4.5rem; font-size: 0.72rem; }
  .dd-table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  .dd-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 2px 4px; }
  .dd-table td { padding: 2px 4px; border-top: 1px solid var(--st-hair); }
  .dd-table input { width: 3.6rem; font-size: 0.7rem; }
  .dd-num { font-variant-numeric: tabular-nums; color: var(--st-text-2); }
  .dd-under td { color: var(--st-warn); }
  .dd-warn { color: var(--st-warn); }
  .dd-sub { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); margin-top: 4px; }
  .dd-chips { display: flex; flex-wrap: wrap; gap: 3px; margin: 3px 0 6px; }
  .dd-chip { font-size: 0.66rem; padding: 1px 7px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-3); border-radius: 10px; cursor: pointer; }
  .dd-chip.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-3); }
</style>
