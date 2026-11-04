<script lang="ts">
  interface Props { label: string; title?: string; testid?: string; onclick: () => void }

  let { label, title, testid, onclick }: Props = $props();
</script>

<button class="al-link" {title} data-testid={testid} {onclick}>{label} →</button>

<style>
  .al-link {
    background: none;
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-value);
    font-size: 0.65rem;
    padding: 2px 7px;
    cursor: pointer;
    white-space: nowrap;
  }
  .al-link:hover { border-color: var(--st-value); }
</style>
