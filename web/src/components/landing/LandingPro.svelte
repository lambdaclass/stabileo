<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import Eyebrow from './Eyebrow.svelte';

  /**
   * PRO mode: in development, and genuinely calculating already.
   *
   * ── What the second evidence audit changed ────────────────────────
   *
   * The first pass put drawings and schedules wholly in the future column on
   * the strength of `cirsoc201-capabilities.ts`, which declares slabs, walls,
   * foundations and diaphragms untouched and bar schedules approximate. That
   * registry is STALE: it was last written by the PR16-era commits b796ecae and
   * d0486af3, and the merge brought in a working pipeline behind it.
   *
   * What the code actually supports, traced end to end:
   *
   *   FloorFamiliesPanel.svelte:91  → detailingStore.generateFloors()
   *     → runFootingDesign + runFloorDesign → designSlabPanel / designWall
   *     → DetailingAssembly → document, DXF, XLSX
   *   ProRcWorkflowTab → DetailingWorkflow.svelte:72/81
   *     → renderDrawings / renderSchedule, with a `doc-dxf` download button
   *
   * So slabs, walls and pad footings are reachable from a real control, and
   * five element families produce drawings. Their maturity is still
   * IMPLEMENTED_PROVISIONAL, though — `deriveMaturity` promotes to VALIDATED
   * only on an `external` benchmark, and slab/wall declare only handFixture,
   * property and crossCheck evidence while `run-footing-design.ts:348` hardcodes
   * provisional. Diaphragms have no design implementation at all.
   *
   * Hence: acknowledged in the `now` column, explicitly provisional, with the
   * structure-wide end state kept in `next`. The stale registry itself is NOT
   * edited here — that is the owning workstream's call.
   */
  const now = ['proNow1', 'proNow2', 'proNow3', 'proNow4', 'proNow5', 'proNow6', 'proNow7', 'proNow8'];
  const next = ['proNext1', 'proNext2', 'proNext3', 'proNext4', 'proNext5', 'proNext6', 'proNext7'];
</script>

<section class="sec sec--paper pro reveal" data-section="pro" id="pro" aria-labelledby="pro-title">
  <div class="wrap">
    <Eyebrow n="10" label={t('landing.ebPro')} />

    <div class="mode-head">
      <h2 id="pro-title" class="display">{t('landing.proH')}</h2>
      <span class="badge badge-dev">{t('landing.badgeDev')}</span>
    </div>
    <p class="lead">{t('landing.proP')}</p>

    <div class="split">
      <section class="split-col" aria-labelledby="pro-now-title">
        <p class="kicker">{t('landing.proNowKicker')}</p>
        <h3 id="pro-now-title">{t('landing.proNowTitle')}</h3>
        <ul class="tick-list">
          {#each now as key}<li>{t('landing.' + key)}</li>{/each}
        </ul>
      </section>

      <section class="split-col split-col-quiet" aria-labelledby="pro-next-title">
        <p class="kicker">{t('landing.proNextKicker')}</p>
        <h3 id="pro-next-title">{t('landing.proNextTitle')}</h3>
        <ul class="status-list">
          {#each next as key}<li>{t('landing.' + key)}</li>{/each}
        </ul>
      </section>
    </div>

    <p class="mode-note">{t('landing.proHonest')}</p>
    <p class="mode-commit">{t('landing.proSourceNote')}</p>
  </div>
</section>
