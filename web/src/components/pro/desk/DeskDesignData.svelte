<script lang="ts">
  /**
   * Preparing › Design data: the project's regulations and its design data (the bar steel, the
   * covers by exposure, the bar diameters, the beams' part in the lateral system, the concrete by
   * level, the deflection limits). The two panels that were screens of their own beside the
   * viewer, in the desk now, as they were: nothing about what they do changed.
   */
  import ProDesignDataPanel from '../ProDesignDataPanel.svelte';
  import ProjectRegulationsPanel from '../design/ProjectRegulationsPanel.svelte';
  import { t } from '../../../lib/i18n';
</script>

<div class="dx" data-testid="desk-design-data">
  <section class="dx-sec" data-testid="desk-regulations">
    <h4>{t('regulations.title')}</h4>
    <ProjectRegulationsPanel />
  </section>
  <section class="dx-sec">
    <ProDesignDataPanel />
  </section>
</div>

<style>
  .dx { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px; align-items: flex-start; }
  .dx-sec { flex: 1 1 22rem; min-width: 0; max-width: 40rem; }
  .dx-sec h4 { margin: 4px 6px 6px; font-size: 0.9rem; }
</style>
