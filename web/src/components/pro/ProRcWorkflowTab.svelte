<script lang="ts">
  /**
   * RC Design Workflow — single entry point for RC design.
   *
   * Verification now appears inline within each expanded element row in the
   * Design tab. The separate RC Verification subtab has been removed.
   *
   * Verification state lives in verificationStore (single source of truth).
   * This component is a thin layout wrapper — no props needed.
   *
   * The regulation settings sit above the design table, collapsed by default, because
   * they are project facts that decide which rules the table below was produced under.
   * They are one disclosure away rather than in a dialog, so a reviewer can always see
   * which edition and which aggregate size a result belongs to.
   */
  import ProDesignTab from './ProDesignTab.svelte';
  import ProjectRegulationsPanel from './design/ProjectRegulationsPanel.svelte';
  import DetailingWorkflow from './design/DetailingWorkflow.svelte';
  import FloorFamiliesPanel from './design/FloorFamiliesPanel.svelte';
  import { detailingStore } from '../../lib/store/detailing.svelte';
  import { modelStore } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n/store.svelte';
  import { regulationsStore } from '../../lib/store/regulations.svelte';

  const footingCount = $derived(modelStore.model.footings.size);
  /**
   * Footings the last run could not verify, surfaced on the closed summary.
   *
   * A footing that silently failed to be checked is the failure mode this whole entity
   * exists to prevent, so the count is visible without opening the panel.
   */
  const notVerifiedCount = $derived(detailingStore.footingsNotVerified.length);

  /**
   * The header badge reflects anything the reviewer has to see without opening the panel:
   * a pending regulation change, an incomplete configuration, or a stack problem.
   */
  const needsAttention = $derived(
    regulationsStore.pending.length > 0 || regulationsStore.validation.problems.length > 0,
  );
</script>

<div class="rc-workflow">
  <details class="code-settings-disclosure" data-testid="code-settings-disclosure">
    <summary>
      {t('regulations.title')}
      {#if needsAttention}
        <span class="attention" data-testid="code-settings-attention" aria-label={t('codes.provenance.assumed')}>
          {t('codes.provenance.assumed')}
        </span>
      {/if}
    </summary>
    <ProjectRegulationsPanel />
  </details>
  <details class="detailing-disclosure" data-testid="detailing-disclosure">
    <summary>
      {t('detailing.title')}
      {#if detailingStore.assemblies.length > 0}
        <span class="count" data-testid="detailing-count">{detailingStore.assemblies.length}</span>
      {/if}
    </summary>
    <DetailingWorkflow />
  </details>
  <!--
    Slabs, walls and foundations. A sibling disclosure rather than a nested one, because they
    are element FAMILIES of the same workflow — the beams and columns above and these share
    one regulation, one detailing store and one document. It sits below detailing because
    `generateFloors()` adds to the assemblies that panel lists.
  -->
  <details class="floors-disclosure" data-testid="floor-families-disclosure">
    <summary>
      {t('detailing.floorRun.title')}
      {#if footingCount > 0}
        <span class="count" data-testid="floor-footing-count">{footingCount}</span>
      {/if}
      {#if notVerifiedCount > 0}
        <span class="attention" data-testid="floor-not-verified-count">{notVerifiedCount}</span>
      {/if}
    </summary>
    <FloorFamiliesPanel />
  </details>
  <ProDesignTab />
</div>

<style>
  /*
   * The column SCROLLS. It used to be `overflow: hidden`, and that was a real defect.
   *
   * Each open disclosure may claim up to 55vh or 70vh, so two of them open exceed the
   * viewport — and with the overflow hidden and no scroll path, everything past 100% became
   * unreachable. Not merely ugly: an ENABLED command could sit outside the viewport, where a
   * real pointer event lands on nothing at all. Measured with three disclosures open at a
   * 1280×720 viewport, the Generate detailing button reported a box at y = 874 and
   * `document.elementFromPoint` at its centre returned null, while a programmatic
   * `.click()` — which bypasses hit-testing — still worked. A user in that state clicks and
   * the app does nothing, with no error and no explanation.
   *
   * `min-height: 0` is what lets a flex child actually shrink so its own `overflow: auto`
   * engages instead of the child forcing the column taller.
   */
  .rc-workflow {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .rc-workflow > :global(*:last-child) { flex: 1 1 auto; min-height: 18rem; overflow: hidden; }
  .code-settings-disclosure,
  .detailing-disclosure,
  .floors-disclosure { flex: 0 0 auto; min-height: 0; border-bottom: 1px solid rgba(128, 128, 128, 0.3); }
  .code-settings-disclosure[open] { max-height: 55vh; overflow: auto; }
  .detailing-disclosure[open] { max-height: 70vh; overflow: auto; }
  .floors-disclosure[open] { max-height: 70vh; overflow: auto; }
  .count { font-size: 0.72rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 3px; background: rgba(128,128,128,0.3); }
  summary {
    cursor: pointer;
    padding: 0.45rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  summary:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
  /* Assumed state is never green. */
  .attention {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    background: #7a5b00;
    color: #fff6dd;
  }
</style>
