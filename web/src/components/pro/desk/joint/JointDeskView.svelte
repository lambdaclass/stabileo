<script lang="ts">
  /**
   * The steel joints in the design desk: the same panel as Design › Steel connections, not a
   * second one. It used to mount only the overview and the typology, so the bolts, welds and gaps
   * of a joint could be edited in one place and not in the other; one component in both places
   * keeps them the same.
   */
  import ProConnectionsTab from '../../ProConnectionsTab.svelte';
</script>

<div class="jdv" data-testid="desk-joints">
  <ProConnectionsTab />
</div>

<style>
  .jdv { padding: 2px; max-width: 760px; }
</style>
