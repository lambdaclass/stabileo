<script lang="ts">
  /**
   * Column reinforcement editor — 4 corner bars plus per-face bars, plus ties.
   *
   * The steel ratio is shown against the 1–8 % Ag code envelope on the arrangement
   * that will actually be assigned. The old flow rounded the bar count up to a
   * symmetric total AFTER the maximum-steel check had already run on the
   * pre-rounding count, so an accepted design could exceed 8 % with no flag.
   */
  import { t } from '../../../lib/i18n';
  import { REBAR_DB } from '../../../lib/engine/codes/argentina/cirsoc201';
  import { resolveColumnReinf, computeColumnLayout } from '../../../lib/engine/station-design-forces';
  import { maxTieSpacing, COLUMN_LIMITS } from '../../../lib/engine/design/candidate-enumerate-column';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import { getReinforcement, setColumnBars, setTies } from '../../../lib/store/rebar-edit';

  interface Props { elementId: number; ctx: MemberContext; version: number }
  let { elementId, ctx, version }: Props = $props();

  const LONG_DIAS = REBAR_DB.filter(r => r.diameter >= 10).map(r => r.diameter);
  const STIRRUP_DIAS = REBAR_DB.filter(r => r.diameter <= 12).map(r => r.diameter);

  const state = $derived.by(() => {
    void version;
    const p = getReinforcement(elementId);
    const col = resolveColumnReinf(p?.column, p?.longitudinal);
    const cornerDia = p?.column?.cornerDia ?? p?.longitudinal?.diameter ?? 16;
    const faceDia = p?.column?.faceDia ?? cornerDia;
    const layout = col
      ? computeColumnLayout(col.totalCount, col.cornerDia, ctx.section.b, ctx.section.h,
          ctx.material.cover, p?.stirrups?.diameter ?? ctx.material.stirrupDia, p?.column)
      : null;
    const area = layout?.totalArea ?? 0;
    const rho = area / (ctx.section.b * ctx.section.h * 1e4);
    const sMax = maxTieSpacing(cornerDia, p?.stirrups?.diameter ?? 8, ctx.section.b, ctx.section.h);
    return {
      p, col, cornerDia, faceDia, layout, area, rho, sMax,
      nBottom: p?.column?.nBottom ?? 0, nTop: p?.column?.nTop ?? 0,
      nLeft: p?.column?.nLeft ?? 0, nRight: p?.column?.nRight ?? 0,
      ties: p?.stirrups,
    };
  });

  const FACES = [
    { key: 'nBottom', label: 'Bottom' }, { key: 'nTop', label: 'Top' },
    { key: 'nLeft', label: 'Left' }, { key: 'nRight', label: 'Right' },
  ] as const;
</script>

<div class="editor" data-testid={`rebar-editor-column-${elementId}`}>
  <div class="region">
    <div class="region-head"><span class="region-title">{t('design.batch.fieldColumnBars')}</span></div>
    <div class="line">
      <span class="sub">corner Ø</span>
      <select class="sel" value={state.cornerDia} data-testid={`col-corner-dia-${elementId}`}
              aria-label="corner diameter"
              onchange={(e) => setColumnBars(elementId, { cornerDia: +e.currentTarget.value })}>
        {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
      </select>
      <span class="sub">face Ø</span>
      <select class="sel" value={state.faceDia} data-testid={`col-face-dia-${elementId}`}
              aria-label="face diameter"
              onchange={(e) => setColumnBars(elementId, { faceDia: +e.currentTarget.value })}>
        {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
      </select>
    </div>
    <div class="faces">
      {#each FACES as f (f.key)}
        <label class="face">
          <span class="sub">{f.label}</span>
          <input type="number" class="num" min="0" max={COLUMN_LIMITS.maxPerFace}
                 value={state[f.key]}
                 data-testid={`col-${f.key}-${elementId}`}
                 onchange={(e) => setColumnBars(elementId, { [f.key]: +e.currentTarget.value })} />
        </label>
      {/each}
    </div>
    {#if state.col}
      <div class="line total-line">
        <span class="total">{state.col.totalCount} bars = 4 + {state.nBottom + state.nTop + state.nLeft + state.nRight}</span>
        <span class="total" data-testid={`col-rho-${elementId}`}
              class:bad={state.rho < COLUMN_LIMITS.rhoMin || state.rho > COLUMN_LIMITS.rhoMax}>
          ρ = {(state.rho * 100).toFixed(2)} % (1–8 %)
        </span>
        <span class="total">{state.area.toFixed(1)} cm²</span>
      </div>
      {#if state.layout && state.layout.issues.length > 0}
        <div class="issues" data-testid={`col-issues-${elementId}`}>
          {#each state.layout.issues as iss}
            <div class="issue">⚠ {iss.description}</div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="region">
    <div class="region-head"><span class="region-title">{t('design.batch.fieldTies')}</span></div>
    <div class="line">
      <span class="sub">eØ</span>
      <select class="sel sel-sm" value={state.ties?.diameter ?? 8}
              data-testid={`tie-dia-${elementId}`} aria-label={t('design.batch.diameter')}
              onchange={(e) => setTies(elementId, { diameter: +e.currentTarget.value })}>
        {#each STIRRUP_DIAS as d (d)}<option value={d}>{d}</option>{/each}
      </select>
      <input type="number" class="num num-sm" min="2" max="6" value={state.ties?.legs ?? 2}
             data-testid={`tie-legs-${elementId}`} aria-label={t('design.batch.legs')}
             onchange={(e) => setTies(elementId, { legs: +e.currentTarget.value })} />
      <span class="sub">L c/</span>
      <input type="number" class="num num-sp" min="0.05" max="0.5" step="0.025"
             value={state.ties?.spacing ?? 0.15}
             data-testid={`tie-spacing-${elementId}`} aria-label={t('design.batch.spacing')}
             onchange={(e) => setTies(elementId, { spacing: +e.currentTarget.value })} />
      <span class="sub">m</span>
      <span class="total" class:bad={(state.ties?.spacing ?? 0) > state.sMax + 1e-9}>
        s,max = {(state.sMax * 100).toFixed(0)} cm
      </span>
    </div>
  </div>
</div>

<style>
  .editor { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
  .region { background: #0d1f36; border: 1px solid #16304f; border-radius: 4px; padding: 5px 7px; }
  .region-head { display: flex; gap: 5px; margin-bottom: 3px; }
  .region-title { font-size: 0.7rem; font-weight: 600; color: #8ab; }
  .line { display: flex; align-items: center; gap: 4px; margin: 2px 0; flex-wrap: wrap; }
  .total-line { border-top: 1px dashed #16304f; padding-top: 3px; margin-top: 4px; }
  .faces { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 3px 0; }
  .face { display: flex; flex-direction: column; gap: 1px; }
  .num { width: 100%; padding: 1px 4px; background: #0b1c30; border: 1px solid #1d3a5c;
    border-radius: 3px; color: #dde; font-size: 0.7rem; }
  .num-sm { width: 34px; } .num-sp { width: 56px; }
  .sel { padding: 1px 3px; background: #0b1c30; border: 1px solid #1d3a5c;
    border-radius: 3px; color: #dde; font-size: 0.7rem; }
  .sel-sm { width: 46px; }
  .sub { font-size: 0.64rem; color: #778; }
  .total { font-family: monospace; font-size: 0.66rem; color: #8a9; }
  .total.bad { color: #ff8a8a; font-weight: 700; }
  .issues { margin-top: 3px; }
  .issue { font-size: 0.64rem; color: #ffb37a; }
  input:focus-visible, select:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
</style>
