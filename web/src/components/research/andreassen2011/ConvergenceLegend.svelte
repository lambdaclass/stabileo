<script lang="ts">
  let { reference, hasReference }: { reference: string; hasReference: boolean } = $props();
</script>

<p>{hasReference ? `${reference} · Stabileo` : 'Stabileo'}</p>
