<script lang="ts">
  /**
   * One compact line saying what of an analysis result is certified, with the tooltip that says
   * what that means (docs/verification/CERTIFY.md). The look of `CertificateStatus`: quiet when
   * certified, a warning border when not, and `alarm` for a computed value the certificate
   * contradicts.
   */
  let { kind, text, tooltip, testid }: {
    kind: 'pending' | 'ok' | 'no' | 'alarm';
    text: string;
    tooltip?: string;
    testid?: string;
  } = $props();
</script>

<div class="cert {kind}" title={tooltip} data-testid={testid} role={kind === 'alarm' ? 'alert' : undefined}>{text}</div>

<style>
  .cert { margin: 3px 0; padding: 2px 6px; border: 1px solid var(--st-hair); border-radius: 4px; font-size: 12px; line-height: 1.35; color: var(--st-text-2); cursor: help; }
  .cert.ok { border-color: var(--st-ok); }
  .cert.no { border-color: var(--st-warn); }
  .cert.pending { opacity: 0.7; cursor: default; }
  .cert.alarm { border-color: var(--st-danger); color: var(--st-danger); font-weight: 600; font-size: 12px; }
</style>
