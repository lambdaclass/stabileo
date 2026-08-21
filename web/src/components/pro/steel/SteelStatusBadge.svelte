<script lang="ts">
  /**
   * A metallic member's state, shown the way `OutcomeBadge` shows a concrete one.
   *
   * GLYPH and TEXT, never colour alone — the same a11y rule, and here it carries extra
   * weight: the whole point of these states is that none of them is a pass, and a reader
   * who can only see hue has to guess which of the tones means what.
   *
   * There is deliberately no green variant. `steelDisplayTone` cannot return one, and this
   * component has no class for one, so a future status cannot acquire a passing look by
   * accident.
   */
  import { t } from '../../../lib/i18n';
  import {
    steelDisplayTone, steelStatusGlyph, steelStatusLabelKey, type SteelMemberStatus,
  } from '../../../lib/engine/steel/steel-status';

  interface Props {
    status: SteelMemberStatus;
    compact?: boolean;
  }
  const { status, compact = false }: Props = $props();

  const tone = $derived(steelDisplayTone(status));
  const label = $derived(t(steelStatusLabelKey(status)));
  const description = $derived(t(`${steelStatusLabelKey(status)}.desc`));
</script>

<span
  class="badge tone-{tone}"
  data-testid="steel-status-badge"
  data-status={status}
  title={description}
>
  <span aria-hidden="true">{steelStatusGlyph(status)}</span>
  {#if !compact}<span class="badge-text">{label}</span>{/if}
  <span class="sr-only">{label}. {description}</span>
</span>

<style>
  .badge {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 1px 5px; border-radius: 3px;
    font-size: 0.68rem; font-weight: 600; line-height: 1.4;
    white-space: nowrap; border: 1px solid transparent;
  }
  .badge-text { font-weight: 500; }
  /*
   * Experimental is hatched as well as coloured. A flat amber reads as "warning, carry on";
   * the hatch reads as "this is not finished", which is the accurate impression, and it
   * survives a monochrome screenshot in a report.
   */
  .tone-warn {
    color: var(--st-warn); border-color: var(--st-warn);
    background: repeating-linear-gradient(45deg,
      rgba(221, 170, 0, 0.22) 0 4px, rgba(120, 92, 0, 0.22) 4px 8px);
  }
  .tone-info { background: rgba(70, 120, 180, 0.16); color: var(--st-text-2); border-color: var(--st-hair-strong); }
  .tone-neutral { background: rgba(136, 136, 136, 0.16); color: var(--st-text-3); border-color: var(--st-hair); }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
</style>
