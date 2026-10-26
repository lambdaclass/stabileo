<script lang="ts">
  /**
   * Stairs in the building: the same stair editor the design desk opens (its flight, its landings,
   * its supports and its check), so a stair is modelled with the rest of the building and there is
   * still one stair in the program.
   */
  import { t } from '../../../lib/i18n';
  import StairsEditor from '../desk/stairs/StairsEditor.svelte';
</script>

<section class="pk-card" data-testid="building-stairs">
  <p class="pk-hint">{t('building.stairs.hint')}</p>
  <StairsEditor />
</section>
