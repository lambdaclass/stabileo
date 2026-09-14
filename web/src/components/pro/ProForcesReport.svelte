<script lang="ts">
  /**
   * The raw forces report, configured and generated.
   *
   * ── Where it lives, and why not beside the design report ───────────
   *
   * On the Results tab, as one more answer to "which output am I reading" — which is what that
   * tab's strip already asks. §5 is explicit that raw solver results and reinforcement design
   * are two documents; putting this control in Documentos, next to the drawings and the bar
   * schedule, would be the mixing the scope forbids, in the one place a reader would most
   * reasonably assume they belong together.
   *
   * ── Why every choice is on screen ──────────────────────────────────
   *
   * "Configuración explícita" is the requirement, and the reason is the quarter grid: five evenly
   * spaced numbers look like a property of the analysis and are a reporting convention. So the
   * station mode names itself in a sentence, the sheet list is checkboxes rather than a preset,
   * and the report prints the same sentence at the top of whatever comes out.
   *
   * ── The export state is local, on purpose ──────────────────────────
   *
   * It does NOT write to `exportRecordStore`. That log is keyed by a detailing document's
   * `seriesId` and its records carry `retouched` — the hand-edited members of THAT document.
   * A raw forces report has no series and no retouches, and giving it a fabricated one would put
   * a row into the detailing emission list claiming a drawing revision it has nothing to do with.
   * What this panel does instead is say what it just produced, and say when it failed.
   */
  import { t, i18n } from '../../lib/i18n';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import {
    RC_FORCES_DEFAULT, RC_FORCES_MAGNITUDES, RC_FORCES_SECTIONS,
    rcForcesBlockers,
    type RcForcesFormat, type RcForcesMagnitude, type RcForcesReportConfig,
    type RcForcesSection, type RcStationMode,
  } from '../../lib/flow/rc-forces-report';
  import { buildForcesReport } from '../../lib/engine/forces-report';
  import { renderForcesReportHtml } from '../../lib/engine/forces-report-render';
  import { exportToExcel } from '../../lib/export/excel';

  let sections = $state<RcForcesSection[]>([...RC_FORCES_DEFAULT.sections]);
  let magnitudes = $state<RcForcesMagnitude[]>([...RC_FORCES_DEFAULT.magnitudes]);
  let stationMode = $state<RcStationMode>(RC_FORCES_DEFAULT.stationMode);
  let format = $state<RcForcesFormat>(RC_FORCES_DEFAULT.format);
  let scopeKind = $state<'model' | 'elements'>('model');
  let allCombos = $state(true);
  let comboPicks = $state<number[]>([]);
  let lastExport = $state<{ filename: string; at: string } | null>(null);
  let lastError = $state<string | null>(null);

  const combinations = $derived(modelStore.model.combinations);
  const selectedIds = $derived([...uiStore.selectedElements].sort((a, b) => a - b));

  /**
   * The configuration, as the contract's own type.
   *
   * Built from the controls rather than held as one object so that a control cannot write a
   * shape the contract does not describe. `comboIds` keeps the null/`[]` distinction the
   * contract draws: null is "all solved", `[]` is "none chosen" and must block rather than
   * quietly report everything.
   */
  const cfg = $derived<RcForcesReportConfig>({
    scope: scopeKind === 'model' ? { kind: 'model' } : { kind: 'elements', elementIds: selectedIds },
    sections,
    stationMode,
    magnitudes,
    format,
    comboIds: allCombos ? null : comboPicks,
  });

  const solved = $derived(!!resultsStore.results3D);
  // Stations exist wherever member end forces do: `extractForcesAtStation` evaluates the
  // engine's diagrams and needs nothing else. It is NOT a question about combinations.
  const hasStations = $derived((resultsStore.results3D?.elementForces.length ?? 0) > 0);
  const blockers = $derived(rcForcesBlockers(cfg, { solved, hasStations }));

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  /** Which nodes each member touches, for narrowing the displacement sheet. */
  function elementNodes(): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (const [id, e] of modelStore.elements) out.set(id, [e.nodeI, e.nodeJ]);
    return out;
  }

  function projectName(): string {
    return modelStore.model.name || t('design.forcesReport.title');
  }

  function downloadBlob(name: string, type: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generate() {
    lastError = null;
    const results = resultsStore.results3D;
    if (!results || blockers.length > 0) return;

    const at = new Date().toISOString();
    const doc = buildForcesReport(cfg, {
      results,
      perCombo: resultsStore.perCombo3D,
      comboNames: new Map(combinations.map((c) => [c.id, c.name])),
      elementNodes: elementNodes(),
    }, t);

    const stem = `forces-${(modelStore.model.name || 'model').replace(/[^\w.-]+/g, '-')}`;
    try {
      if (format === 'xlsx') {
        const filename = `${stem}.xlsx`;
        exportToExcel({
          filename,
          onlyExtras: true,
          extraSheets: doc.sheets.map((s) => ({ name: s.name, rows: s.aoa })),
        });
        lastExport = { filename, at };
        return;
      }

      const html = renderForcesReportHtml(doc, {
        projectName: projectName(),
        locale: i18n.locale,
        at,
        title: t('design.forcesReport.title'),
        labels: {
          scope: t('design.forcesReport.scope'),
          stations: t('design.forcesReport.stations'),
          isNot: t('design.forcesReport.isNot'),
          generated: t('design.forcesReport.generated'),
          empty: t('design.forcesReport.empty'),
        },
      });
      const filename = `${stem}.html`;
      if (format === 'html') {
        downloadBlob(filename, 'text/html', html);
      } else {
        // Printed through the browser rather than a bundled PDF writer — the audit in
        // `rc-forces-report.ts` found no PDF writer in this tree. A blocked popup falls back
        // to the same HTML as a file, which is a real deliverable and not a silent failure.
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
        else downloadBlob(filename, 'text/html', html);
      }
      lastExport = { filename, at };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<div class="fr" data-testid="forces-report">
  <p class="fr-lead" data-testid="forces-report-lead">{t('design.forcesReport.subtitle')}</p>

  <fieldset class="fr-group">
    <legend>{t('design.forcesReport.scope')}</legend>
    <label class="fr-opt">
      <input type="radio" name="fr-scope" value="model" data-testid="fr-scope-model"
             checked={scopeKind === 'model'} onchange={() => (scopeKind = 'model')} />
      {t('design.forcesReport.scope.model')}
    </label>
    <label class="fr-opt">
      <input type="radio" name="fr-scope" value="elements" data-testid="fr-scope-elements"
             checked={scopeKind === 'elements'} onchange={() => (scopeKind = 'elements')} />
      {t('design.forcesReport.scope.elements')} <span class="fr-n">{selectedIds.length}</span>
    </label>
  </fieldset>

  <fieldset class="fr-group">
    <legend>{t('design.forcesReport.sections')}</legend>
    {#each RC_FORCES_SECTIONS as s (s)}
      <label class="fr-opt">
        <input type="checkbox" data-testid={`fr-section-${s}`}
               checked={sections.includes(s)}
               onchange={() => (sections = toggle(sections, s))} />
        {t(`design.forcesReport.sheet.${s}`)}
      </label>
    {/each}
  </fieldset>

  <fieldset class="fr-group">
    <legend>{t('design.forcesReport.stations')}</legend>
    <label class="fr-opt">
      <input type="radio" name="fr-stations" value="quarters" data-testid="fr-stations-quarters"
             checked={stationMode === 'quarters'} onchange={() => (stationMode = 'quarters')} />
      0 · 25 · 50 · 75 · 100 %
    </label>
    <label class="fr-opt">
      <input type="radio" name="fr-stations" value="critical" data-testid="fr-stations-critical"
             checked={stationMode === 'critical'} onchange={() => (stationMode = 'critical')} />
      {t('design.forcesReport.sheet.rawStations')}
    </label>
    <!--
      The convention says what it is, beside the control that chooses it.

      Five evenly spaced numbers read as a result. They are a reporting choice, and the same
      sentence is printed at the top of whatever comes out, so the file cannot be read without it
      either.
    -->
    <p class="fr-note" data-testid="fr-stations-note">
      {stationMode === 'quarters'
        ? t('design.forcesReport.stations.quarters')
        : t('design.forcesReport.stations.critical')}
    </p>
  </fieldset>

  <fieldset class="fr-group">
    <legend>{t('design.forcesReport.magnitudes')}</legend>
    {#each RC_FORCES_MAGNITUDES as m (m)}
      <label class="fr-opt fr-opt-inline">
        <input type="checkbox" data-testid={`fr-magnitude-${m}`}
               checked={magnitudes.includes(m)}
               onchange={() => (magnitudes = toggle(magnitudes, m))} />
        {m === 'torsion' ? 'T' : m.toUpperCase()}
      </label>
    {/each}
  </fieldset>

  {#if combinations.length > 0}
    <fieldset class="fr-group">
      <legend>{t('design.forcesReport.combos')}</legend>
      <label class="fr-opt">
        <input type="checkbox" data-testid="fr-combos-all"
               checked={allCombos} onchange={() => (allCombos = !allCombos)} />
        {t('design.forcesReport.combos.all')}
      </label>
      {#if !allCombos}
        {#each combinations as c (c.id)}
          <label class="fr-opt">
            <input type="checkbox" data-testid={`fr-combo-${c.id}`}
                   checked={comboPicks.includes(c.id)}
                   onchange={() => (comboPicks = toggle(comboPicks, c.id))} />
            {c.name}
          </label>
        {/each}
      {/if}
    </fieldset>
  {/if}

  <fieldset class="fr-group">
    <legend>{t('design.forcesReport.format')}</legend>
    {#each ['xlsx', 'pdf', 'html'] as f (f)}
      <label class="fr-opt">
        <input type="radio" name="fr-format" value={f} data-testid={`fr-format-${f}`}
               checked={format === f} onchange={() => (format = f as RcForcesFormat)} />
        {t(`design.forcesReport.format.${f}`)}
      </label>
    {/each}
  </fieldset>

  <div class="fr-actions">
    <button data-testid="fr-generate" disabled={blockers.length > 0} onclick={generate}>
      {t('design.forcesReport.generate')}
    </button>
  </div>

  <!-- A disabled command that does not say why is a riddle. Same rule as `review-submit`. -->
  {#if blockers.length > 0}
    <p class="fr-need" data-testid="fr-blockers">{blockers.map((b) => t(b)).join(' ')}</p>
  {/if}

  {#if lastExport}
    <p class="fr-done" data-testid="fr-exported">
      {t('design.forcesReport.exported')}: {lastExport.filename}
    </p>
  {/if}
  {#if lastError}
    <p class="fr-err" role="alert" data-testid="fr-error">
      {t('design.forcesReport.failed')} — {lastError}
    </p>
  {/if}

  <!--
    What the document is not, on screen and not only in the file.

    A reader who is about to hand this to somebody has to see the qualification before they
    press the button, not after they open the PDF.
  -->
  <div class="fr-isnot" data-testid="fr-isnot">
    <strong>{t('design.forcesReport.isNot')}</strong>
    <ul>
      <li>{t('design.forcesReport.isNot.design')}</li>
      <li>{t('design.forcesReport.isNot.construction')}</li>
      <li>{t('design.forcesReport.isNot.verified')}</li>
    </ul>
  </div>
</div>

<style>
  .fr { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.4rem 0.2rem; }
  .fr-lead { margin: 0; font-size: 0.7rem; line-height: 1.35; color: var(--st-text-2); }

  .fr-group {
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    padding: 0.3rem 0.5rem 0.4rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .fr-group legend {
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--st-text-2);
    padding: 0 0.2rem;
  }

  .fr-opt {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.7rem;
    color: var(--st-text);
    cursor: pointer;
  }
  /* The six magnitudes are one row of short labels, not six lines. */
  .fr-group:has(.fr-opt-inline) { flex-direction: row; flex-wrap: wrap; gap: 0.1rem 0.6rem; }
  .fr-group:has(.fr-opt-inline) legend { width: 100%; }

  .fr-opt input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  .fr-n {
    font-family: var(--st-mono);
    font-variant-numeric: tabular-nums;
    color: var(--st-text-2);
  }

  .fr-note { margin: 0.2rem 0 0; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }

  .fr-actions { display: flex; gap: 0.3rem; }
  .fr-actions button {
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .fr-actions button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .fr-actions button:disabled { opacity: 0.6; cursor: not-allowed; }
  .fr-actions button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  .fr-need { margin: 0; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }
  .fr-done { margin: 0; font-size: 0.68rem; color: var(--st-ok); }
  .fr-err { margin: 0; font-size: 0.68rem; color: var(--st-danger); }

  .fr-isnot {
    border-left: 2px solid var(--st-warn);
    background: var(--st-surface-3);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.66rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }
  .fr-isnot strong { display: block; color: var(--st-text); margin-bottom: 0.15rem; }
  .fr-isnot ul { margin: 0; padding-left: 1rem; }
</style>
