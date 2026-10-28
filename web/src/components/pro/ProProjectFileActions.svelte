<script lang="ts">
  /**
   * Open and Save for a PRO project.
   *
   * PRO had no project-file controls at all: `ToolbarProject` owns them and `Toolbar` renders
   * only under `appMode === 'basico'`, so the only way to open or save was to leave PRO, use
   * the Básico toolbar, and let the restored project put the app back. Production QA had to do
   * exactly that to reach the PR19 CAD journey, which is not a path a user should need.
   *
   * This is a SURFACE, not a second implementation. `saveProject` and `loadFile` are the same
   * functions the Básico toolbar calls; the `.ded` format, the filename rule, `analysisMode`
   * restoration and the session-vs-single-tab detection all stay in `lib/store/file.ts`. A
   * PRO-only loader would be a second way for a project to mean something, which is the one
   * thing this must not become.
   *
   * Kept deliberately small so the later PRO command-ribbon redesign can move it without
   * touching persistence: it renders two buttons and the input they drive, and knows nothing
   * about where it sits.
   */
  import { saveProject, loadFile } from '../../lib/store/file';
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  let {
    variant = 'bar',
    shortcuts = false,
  }: {
    /** `bar` for the desktop PRO top bar, `mobile` for the PRO mobile action row. */
    variant?: 'bar' | 'mobile';
    /**
     * Bind Ctrl/Cmd+S and Ctrl/Cmd+O. Only the instance that is actually on screen may set
     * this: `Toolbar` already binds them for Básico, and the desktop and mobile PRO bars are
     * mutually exclusive, so exactly one handler is ever live.
     */
    shortcuts?: boolean;
  } = $props();

  let fileInput = $state<HTMLInputElement | undefined>();

  /** Open the picker. Exported so a host can drive it from its own control. */
  export function open() { fileInput?.click(); }

  /**
   * The same handler the Básico toolbar uses, including its session toast and its input reset
   * so the same file can be chosen twice running.
   */
  async function handleLoadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await loadFile(file);
      if (result.type === 'session') {
        uiStore.toast(t('project.sessionRestored').replace('{n}', String(result.count)), 'success');
      }
    } catch (err: unknown) {
      alert((err as Error)?.message || t('project.loadError'));
    }
    input.value = '';
  }

  /**
   * Ctrl+S / Ctrl+O, the pair the existing tooltips already advertise.
   *
   * The guard is here rather than around `<svelte:window>` because Svelte does not allow that
   * tag inside a block. A non-shortcut instance therefore listens and immediately returns.
   */
  function handleKeydown(e: KeyboardEvent) {
    if (!shortcuts) return;
    const key = e.key.toUpperCase();
    if ((e.ctrlKey || e.metaKey) && key === 'S' && !e.shiftKey) {
      e.preventDefault();
      saveProject();
    } else if ((e.ctrlKey || e.metaKey) && key === 'O') {
      e.preventDefault();
      fileInput?.click();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  class="pfa {variant}"
  data-testid="pro-project-open"
  onclick={() => fileInput?.click()}
  title={t('project.openTooltip')}
>{t('project.open')}</button>

<button
  class="pfa {variant}"
  data-testid="pro-project-save"
  onclick={saveProject}
  title={t('project.saveTabTooltip')}
>{t('project.saveTab')}</button>

<!--
  The production Open path, driven by the visible button above. It carries the same test id as
  the Básico input on purpose: the two are never mounted at once, and a browser journey that
  opens a real committed project should not have to know which mode surfaced the picker.
-->
<input
  bind:this={fileInput}
  data-testid="project-open-file"
  type="file"
  accept=".ded,.json"
  style="display:none"
  onchange={handleLoadFile}
/>

<style>
  /*
    Styled here rather than by the host: Svelte scopes styles to the component that declares
    the markup, so `.pn-action` in App.svelte cannot reach these buttons. The values match the
    neighbouring PRO controls so the group reads as one row.
  */
  .pfa {
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    color: #cfd6e4;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid #3a4256;
  }
  .pfa:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
  .pfa:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }

  .bar {
    padding: 3px 10px;
    font-size: 0.7rem;
    border-radius: 3px;
  }

  .mobile {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.72rem;
    border-radius: 4px;
  }
</style>
