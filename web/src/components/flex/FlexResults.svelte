<script lang="ts">
  /**
   * The calculator's answer, laid out as the sheet lays it out: the headline
   * and the ratio, the rows the sheet prints (see sheet-rows.ts), the figure
   * it draws under them, and — kept apart — what this tool adds.
   *
   * Read-only: everything arrives computed from the panel.
   */
  import { t } from '../../lib/i18n';
  import InteractionDiagram from './InteractionDiagram.svelte';
  import SurfaceCut from './SurfaceCut.svelte';
  import BarTable from './BarTable.svelte';
  import { sectionNumber, fmt, type Row, type SheetRows, type Sec } from './sheet-rows';
  import type { FlexCase, FlexMode, FlexOutput } from '../../lib/engine/codes/argentina/cirsoc-flex';

  type Pt = { m: number; n: number };
  type CharPt = { key: string; phiMn: number; phiPn: number; phi: number };
  let {
    r, rows, kase, mode, isBeam, barTable, cut, diagram, characteristic, positioning, Pu, Mu, Muy,
  }: {
    r: FlexOutput | null | undefined;
    rows: SheetRows;
    kase: FlexCase;
    mode: FlexMode;
    isBeam: boolean;
    barTable: Array<{ n: number; area: number; x: number; y: number }>;
    cut: {
      curves: Array<{ label: string; points: Array<{ mx: number; my: number }>; emphasis?: boolean }>;
      demand: { mx: number; my: number } | null;
      resistance: { mx: number; my: number } | null;
    } | null;
    diagram: {
      capped: Pt[]; uncapped: Pt[]; demand: Pt | null; resistance: Pt | null;
    } | null;
    characteristic: { bottomCompressed: CharPt[]; topCompressed: CharPt[] } | null;
    positioning: Array<[string, number, number]>;
    Pu: number; Mu: number; Muy: number;
  } = $props();

  const num = (k: Sec) => sectionNumber(kase, mode, k);
</script>

  <div class="fp-result" class:fp-fail={!(r?.ok ?? false)} data-testid="flex-result">
    <div class="fp-headline">{rows.headline}</div>
    {#if r && Number.isFinite(r.ratio)}
      <div class="fp-ratio">
        <!-- Four decimals, the sheets' own: at three a ratio of 1,0003 printed
             "1.000" beside "fails", which reads as a contradiction. -->
        {t('flex.out.ratio')} = <strong>{r.ratio.toFixed(4)}</strong>
        <span class="fp-verdict">{r.ok ? t('flex.out.ok') : t('flex.out.notOk')}</span>
      </div>
    {/if}

    {#if isBeam}
      {@render rowsTable(`${num('results')}${t('flex.section.results')}`, rows.beam, 'flex-sheet-rows')}
    {:else if mode === 'design'}
      {@render rowsTable(`${num('needed')}${t('flex.section.steelNeeded')}`, rows.needed, 'flex-sheet-rows')}
      {#if kase === 'FCO' && barTable.length > 0}
        <BarTable bars={barTable} />
      {/if}
      {@render rowsTable(`${num('minmax')}${t('flex.section.minMax')}`, rows.minMax, 'flex-minmax')}
    {:else if kase === 'FCR'}
      {@render rowsTable(`${num('results')}${t('flex.section.results')}`, rows.verifyResult, 'flex-sheet-rows')}
    {:else if kase === 'FCO' && r?.phiMn !== undefined}
      {@render rowsTable(`${num('modulus')}${t('flex.section.modulusRatio')}`, [
        ['φMn / Mu', (r.phiMn / Math.max(Math.hypot(Mu, Muy), 1e-9)).toFixed(4)],
      ], 'flex-sheet-rows')}
      {@render rowsTable(`${num('minmax')}${t('flex.section.minMax')}`, rows.minMax, 'flex-minmax')}
    {/if}

    {#if rows.bars.length > 0}
      <!-- Beyond the sheet, and said so: the sheet stops at the area. -->
      <h4 class="fp-heading">{t('flex.section.proposedBars')}</h4>
      <table class="fp-table" data-testid="flex-proposed-bars">
        <tbody>
          {#each rows.bars as [label, value]}
            <tr><th>{label}</th><td>{value}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="fp-extras-note">{t('flex.bars.note')}</p>
    {/if}

    {#if cut}
      <!-- FCO's section 5, the failure surface cut at the demand's own axial load. -->
      <h4 class="fp-heading">{num('cut')}{t('flex.section.surfaceCut')}</h4>
      <SurfaceCut
        curves={cut.curves}
        demand={cut.demand}
        resistance={cut.resistance}
        showRay={mode === 'verify'}
      />
      <p class="fp-legend">
        {#if mode === 'design'}<span class="fp-line fp-line-grid"></span>{t('flex.cut.grid')}{/if}
        <span class="fp-line fp-line-main"></span>{mode === 'design' ? t('flex.cut.adopted') : t('flex.cut.given')}
        {#if cut.demand}<span class="fp-dot fp-dot-dem"></span>{t('flex.diagram.demand')}{/if}
        {#if cut.resistance}<span class="fp-dot fp-dot-res"></span>{t('flex.diagram.resistanceAtAxial')}{/if}
      </p>
    {/if}

    {#if diagram && mode === 'design'}
      <h4 class="fp-heading">{num('diagram')}{t('flex.section.diagramForNeeded')}</h4>
      {@render diagramBlock(false)}
    {/if}

    {#if diagram && mode === 'verify'}
      <!--
        The safety condition, stated the way the sheet states it: the
        eccentricity, the figure with the ray through demand and resistance,
        then the two resistant components and the two vector moduli.
      -->
      <h4 class="fp-heading">{num('safety')}{t('flex.section.safety')}</h4>
      {#if Math.abs(Pu) > 1e-9}
        <table class="fp-table"><tbody><tr><th>Mu / Pu</th><td data-testid="flex-eccentricity">{fmt(Mu / Pu, 3, 'm')}</td></tr></tbody></table>
      {/if}
      {@render diagramBlock(true)}
      {#if rows.safety.length > 0}
        <table class="fp-table" data-testid="flex-safety">
          <tbody>
            {#each rows.safety as [label, value]}
              <tr><th>{label}</th><td>{value}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}

    {#if characteristic && diagram}
      <!--
        The whole shape of the diagram as six named states, twice — once for
        each face in compression, each computed on its own. The sheet plots
        them on a second copy of the diagram, and so does this.
      -->
      <h4 class="fp-heading">{num('points')}{t('flex.section.characteristic')}</h4>
      <InteractionDiagram
        curve={diagram.capped}
        uncapped={diagram.uncapped}
        points={[...characteristic.bottomCompressed, ...characteristic.topCompressed]
          .map((p) => ({ m: p.phiMn, n: p.phiPn }))}
        testId="flex-points-diagram"
      />
      {#each [
        { rows: characteristic.bottomCompressed, capKey: 'flex.out.edgeBottom' },
        { rows: characteristic.topCompressed, capKey: 'flex.out.edgeTop' },
      ] as table (table.capKey)}
        <p class="fp-edge-note">{t(table.capKey)}</p>
        <table class="fp-table fp-pointtable" data-testid="flex-characteristic">
          <thead>
            <tr><th></th><th>φMn<br />[kN·m]</th><th>φPn<br />[kN]</th><th>φ</th></tr>
          </thead>
          <tbody>
            {#each table.rows as p (p.key)}
              <tr>
                <th>{t(`flex.pt.${p.key}`)}</th>
                <td>{p.phiMn.toFixed(2)}</td>
                <td>{p.phiPn.toFixed(2)}</td>
                <td>{p.phi.toFixed(2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/each}
    {/if}

    {#if positioning.length > 0}
      <!-- FCO-VERIF's own summary, which it numbers 9. -->
      <h4 class="fp-heading">{num('positioning')}{t('flex.section.positioning')}</h4>
      <table class="fp-table fp-pointtable" data-testid="flex-positioning">
        <thead>
          <tr><th></th><th>As [cm²]</th><th>{t('flex.out.barsCount')}</th><th>Asi [cm²]</th></tr>
        </thead>
        <tbody>
          {#each positioning as [name, area, count] (name)}
            <tr>
              <th>{name}</th>
              <td>{area.toFixed(3)}</td>
              <td>{count}</td>
              <td>{area > 0 && count > 0 ? (area / count).toFixed(3) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if rows.extra.length > 0}
      <details class="fp-extras" data-testid="flex-extras">
        <summary>{t('flex.extras.title')}</summary>
        <p class="fp-extras-note">{t('flex.extras.note')}</p>
        <table class="fp-table">
          <tbody>
            {#each rows.extra as [label, value]}
              <tr><th>{label}</th><td>{value}</td></tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>

  {#snippet rowsTable(title: string, rows: Row[], testid: string)}
    {#if rows.length > 0}
      <h4 class="fp-heading">{title}</h4>
      <table class="fp-table" data-testid={testid}>
        <tbody>
          {#each rows as [label, value]}
            <tr><th>{label}</th><td>{value}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/snippet}



  {#snippet diagramBlock(verify: boolean)}
    {#if diagram}
      <InteractionDiagram
        curve={diagram.capped}
        uncapped={diagram.uncapped}
        demand={diagram.demand}
        resistance={verify ? diagram.resistance : null}
        showEccentricity={verify}
      />
      <p class="fp-legend">
        <span class="fp-line fp-line-main"></span>{t('flex.diagram.capped')}
        <span class="fp-line fp-line-dash"></span>{t('flex.diagram.uncapped')}
        {#if diagram.demand}<span class="fp-dot fp-dot-dem"></span>{t('flex.diagram.demand')}{/if}
        {#if verify && diagram.resistance}<span class="fp-dot fp-dot-res"></span>{t('flex.diagram.resistance')}{/if}
      </p>
    {/if}
  {/snippet}

<style>

  /* ── The answer ──────────────────────────────────────────────────
     Bordered rather than filled, and the accent is spent on the number
     itself. A failing check turns the border and the verdict, not the
     whole box — the numbers beside it are still correct and still worth
     reading.
     ─────────────────────────────────────────────────────────────── */
  .fp-result {
    margin-top: 0.3rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
  }
  .fp-result.fp-fail { border-color: var(--st-danger); }

  .fp-headline {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--st-accent);
    font-variant-numeric: tabular-nums;
  }
  .fp-ratio { margin-top: 0.15rem; color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  .fp-ratio strong { color: var(--st-text); }
  .fp-verdict { margin-left: 0.4rem; color: var(--st-ok); }
  .fp-result.fp-fail .fp-verdict { color: var(--st-danger); }

  /*
   * Narrow tables of numbers: the label column wraps, the number columns do
   * not, and each carries its own left padding — without it three right-
   * aligned figures ran into one another ("-39.431409.200.65").
   */
  .fp-pointtable { font-size: 0.66rem; table-layout: auto; }
  .fp-pointtable th { line-height: 1.25; padding-right: 0.3rem; }
  .fp-pointtable td { text-align: right; white-space: nowrap; padding-left: 0.45rem; }
  .fp-pointtable thead th { color: var(--st-text-3); font-weight: 500; font-size: 0.62rem; text-align: right; }
  .fp-line { display: inline-block; width: 14px; height: 0; border-top: 1.6px solid var(--st-accent); margin-left: 6px; vertical-align: middle; }
  .fp-line-dash { border-top: 1.2px dashed var(--st-text-3); }
  .fp-line-grid { border-top: 1px solid var(--st-text-3); }
  /* A key to the figure, not a note: styled like one, but not an `.fp-note`, which the notes
     about where a demand came from are. */
  .fp-legend { display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
    margin: -0.15rem 0 0.1rem; font-size: 0.6rem; line-height: 1.4; color: var(--st-text-3); }
  .fp-dot { width: 8px; height: 8px; transform: rotate(45deg); display: inline-block; margin-left: 6px; }
  .fp-dot-dem { background: #e5484d; }
  .fp-dot-res { background: #d6409f; }
  .fp-edge-note {
    font-size: 0.66rem; color: var(--st-text-3);
    margin: 8px 0 2px; line-height: 1.4;
  }
  .fp-extras { margin-top: 8px; }
  .fp-extras summary {
    cursor: pointer; font-size: 0.7rem; color: var(--st-text-3);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .fp-extras-note { font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45; margin: 4px 0; }
</style>
