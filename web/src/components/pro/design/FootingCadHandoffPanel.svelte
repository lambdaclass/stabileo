<script lang="ts">
  /**
   * The CAD handoff for one footing: export the semantic handoff, and say what to do with it.
   *
   * Split out of `FoundationsPanel.svelte` when that file crossed the 600-line component ceiling
   * the suite enforces. The boundary is the same one that put the mat design in its own component:
   * the foundations panel owns footing geometry and the project's ground, and this owns what
   * follows from them.
   *
   * The prose here is load-bearing. A user who exports this gets a `.json`, and no CAD program
   * opens one — so the panel names the tool that converts it and links to that tool, rather than
   * leaving a downloaded file and no next step.
   */
  import { t, tp } from '../../../lib/i18n';
  import { identifyMessages } from '../../../lib/codes/message';
  import {
    exportFootingCadHandoff, footingCadPrerequisiteStamp,
  } from '../../../lib/store/rc-cad-export';

  const { footingId }: { footingId: number } = $props();

  /**
   * The last CAD handoff attempt, keyed by footing so a result never appears under a footing
   * it does not describe.
   */
  type CadOutcome =
    | { footingId: number; ok: true; filename: string; byteLength: number }
    | {
      footingId: number; ok: false;
      refusals: ReadonlyArray<{ code: string; messageKey: string; params?: Record<string, unknown> }>;
      /** Developer-facing validator output, shown when the manifest failed its own schema. */
      details: string[];
      /** The prerequisite state this refusal describes. See `visibleCadResult`. */
      stamp: string;
    };
  let cadResult = $state<CadOutcome | null>(null);

  /**
   * The refusal, for as long as it is still true.
   *
   * A refusal is a statement about one attempt against one state, so it must not outlive that
   * state. It used to: exporting before detailing refused correctly, the user then generated
   * the detailing, and "Generate foundation detailing first" stayed on screen — advice that had
   * already been followed — until a later successful export happened to replace it.
   *
   * Comparing the stamp is narrower than clearing on any store write and narrower than clearing
   * on navigation: a refusal whose cause is untouched stays visible and keeps saying the same
   * true thing, and a genuinely new refusal is stamped against the state it was computed
   * against, so it displays normally. A success replaces `cadResult` outright and needs no
   * stamp — there is nothing left to go stale.
   */
  const visibleCadResult = $derived.by(() => {
    const r = cadResult;
    if (!r || r.ok) return r;
    return footingCadPrerequisiteStamp(r.footingId) === r.stamp ? r : null;
  });

  /**
   * Where the RC CAD handoff tool listens, and how to start it.
   *
   * The tool is a separate local service — it owns the handoff schema and the CAD conversion — so
   * this panel only links to it and never assumes it is running. `probeTool` is what turns
   * "nothing happened when I clicked" into a sentence naming the command to run.
   */
  const HANDOFF_TOOL_URL = 'http://127.0.0.1:4179/';
  const HANDOFF_TOOL_COMMAND = './.venv/bin/python -m rc_cad_handoff.web';
  let toolReachable = $state<boolean | null>(null);

  async function probeTool() {
    try {
      // `no-cors` keeps this a liveness probe rather than a data read: an opaque response still
      // proves something answered, and a network error proves nothing did.
      await fetch(`${HANDOFF_TOOL_URL}api/health`, { mode: 'no-cors', cache: 'no-store' });
      toolReachable = true;
    } catch {
      toolReachable = false;
    }
  }

  function openTool() {
    // Probe and open together: the probe is what turns "nothing happened" into a sentence naming
    // the command to run, and it must not gate the click — a browser blocks a window opened after
    // an await.
    void probeTool();
    window.open(HANDOFF_TOOL_URL, '_blank', 'noopener');
  }


  function runCadExport(footingId: number) {
    // `tp` is passed straight through, so every sentence in the manifest is the app's own
    // translated text in the user's locale rather than a second set of strings written here.
    const r = exportFootingCadHandoff(footingId, (k, params) => tp(k, params ?? {}));
    cadResult = r.ok
      ? { footingId, ok: true, filename: r.filename, byteLength: r.byteLength }
      : {
        footingId, ok: false, refusals: r.refusals,
        details: [...(r.invalid?.schema ?? []), ...(r.invalid?.semantic ?? [])],
        // Stamped from the state the refusal was just computed against, not from a snapshot
        // taken earlier: the export itself is what read that state.
        stamp: footingCadPrerequisiteStamp(footingId),
      };
  }

</script>

        <!--
          The CAD handoff.

          Deliberately inside the SELECTED footing's editor rather than a global toolbar
          button: one manifest describes one footing's connection, and a control that did not
          say which footing it meant would produce a file whose subject the user had to infer.

          The scope sentence sits above the button, not in a tooltip. A reader who exports this
          and opens it in CAD must already know it is the transfer cage and not the mats.
        -->
        <div class="cad-export" data-testid="footing-cad-export">
          <h5>{t('footing.cad.ui.title')}</h5>
          <p class="note">{t('footing.cad.ui.scope')}</p>
          <!--
            The JSON is not a drawing, and the panel used to leave the user holding one with no idea
            what to do next. Both sentences are here rather than in a tooltip: this is the moment the
            user is about to download the file.
          -->
          <p class="note" data-testid="footing-cad-not-a-drawing">
            {t('footing.cad.ui.notADrawing')}
          </p>
          <p class="note" data-testid="footing-cad-next-step">{t('footing.cad.ui.nextStep')}</p>
          <button data-testid="footing-cad-export-run" onclick={() => runCadExport(footingId)}>
            {t('footing.cad.ui.export')}
          </button>
          <button data-testid="footing-cad-open-tool" onclick={openTool}>
            {t('footing.cad.ui.openTool')}
          </button>
          <p class="note" data-testid="footing-cad-tool-at">
            {tp('footing.cad.ui.toolAt', { url: HANDOFF_TOOL_URL })}
          </p>
          {#if toolReachable === false}
            <!-- Never a silent no-op: if nothing answered, say what to start. -->
            <p class="failed" data-testid="footing-cad-tool-unavailable">
              {tp('footing.cad.ui.toolUnavailable', {
                url: HANDOFF_TOOL_URL, command: HANDOFF_TOOL_COMMAND,
              })}
            </p>
          {/if}
          {#if visibleCadResult?.footingId === footingId}
            {#if visibleCadResult.ok}
              <p class="ok" data-testid="footing-cad-export-ok">
                {tp('footing.cad.ui.exported', {
                  filename: visibleCadResult.filename, bytes: visibleCadResult.byteLength,
                })}
              </p>
            {:else}
              <!--
                Every refusal is shown verbatim. A disabled button with no explanation is the
                thing this panel's own header comment refuses to do, and an export that cannot
                honestly be produced has a specific reason the user can act on.
              -->
              <div class="failed" data-testid="footing-cad-export-failed">
                <p>{t('footing.cad.ui.failed')}</p>
                <ul>
                  {#each identifyMessages(
                    visibleCadResult.refusals.map(
                      (r) => ({ key: r.messageKey, params: r.params }),
                    ),
                  ) as r (r.id)}
                    <li>{tp(r.message.key, r.message.params ?? {})}</li>
                  {/each}
                </ul>
                {#if visibleCadResult.details.length > 0}
                  <ul class="details" data-testid="footing-cad-export-details">
                    {#each visibleCadResult.details as line (line)}<li><code>{line}</code></li>{/each}
                  </ul>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

<style>
  .cad-export {
    margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--st-hair-strong);
  }
  .cad-export h5 { margin: 0; font-size: 0.8rem; }
  .cad-export .ok { margin: 0.4rem 0 0; font-size: 0.74rem; }
  /* `#5c1a1a`/`#ffe4e4` again — the same hand-mixed pair `FootingMatPhysicalPanel` carried,
     in the same panel family. `--st-danger-bg` is the tinted band it always was, and the
     words go to full contrast (12.82 at worst) with the rule carrying the severity, which is
     the form its sibling measured its way into. */
  .cad-export .failed { margin-top: 0.4rem; font-size: 0.74rem; color: var(--st-text); }
  .cad-export .failed p { margin: 0 0 0.2rem; font-weight: 600; }
  .cad-export .failed li {
    padding: 0.15rem 0.4rem; border-radius: 3px;
    background: var(--st-danger-bg); border-left: 3px solid var(--st-danger);
  }
  .cad-export .details li { background: none; opacity: 0.85; }
  .cad-export .details code { font-size: 0.7rem; word-break: break-all; }
  .note { margin: 0.3rem 0 0; font-size: 0.72rem; opacity: 0.75; line-height: 1.35; }
</style>
