<script lang="ts">
  /**
   * The editor, running inside a post, on the model the post is about.
   *
   * ── Why it does not start on its own ──
   *
   * The landing carried an embed like this once and it taught two lessons the
   * hard way. It booted a second application on every visit whether or not
   * anyone wanted it — a 2 MB download and a WASM engine, to decorate a page
   * most readers scroll past. And an iframe under the pointer swallowed the
   * wheel, so scrolling the article zoomed a model instead.
   *
   * So: nothing loads until someone asks. Before that this is a framed
   * placeholder with a button. After it, the iframe fills the frame and the
   * reader is in the real editor — not a video, not a screenshot.
   *
   * ── Why the chrome depends on the room, not on the device ──
   *
   * `?embed` strips the header, the footer and the sidebar, leaving the
   * viewport and the floating tools. That is right on a phone and wasteful on
   * a laptop, where there is room for the editor as it actually looks and
   * exploring is the point.
   *
   * So the frame measures itself when the reader opens it and asks for the
   * full interface when it has the space for one. The decision comes from the
   * width that exists rather than from a guess about the device — a narrow
   * window on a desktop gets the compact chrome too, which is correct.
   */
  import { tPublic as t } from '../../lib/i18n/store.svelte';

  type Props = {
    /** Query string for the editor, without the leading '?'. */
    query: string;
    /** Which mode to open. Section analysis is Basic's; verification is PRO's. */
    mode?: 'basic' | 'pro';
    /** What the reader is about to open, in their language. */
    label: string;
  };
  let { query, mode = 'basic', label }: Props = $props();

  /** Below this the editor's full chrome has nowhere to go. */
  const FULL_UI_WIDTH = 900;

  let live = $state(false);
  let frame: HTMLDivElement | undefined = $state();
  let src = $state('');

  function open() {
    const wide = (frame?.clientWidth ?? 0) >= FULL_UI_WIDTH;
    src = wide ? `/app/${mode}?${query}` : `/app/${mode}?embed&${query}`;
    live = true;
    /*
     * Bring the frame fully into view, and keep bringing it.
     *
     * The article's nav is sticky, so an embed opened where it happened to sit
     * leaves the editor's own ribbon — the row with the buttons this post
     * tells people to press — underneath it. `scroll-margin-top` reserves the
     * nav's height and this is what makes the browser honour it.
     *
     * Asserted repeatedly rather than once because the application inside the
     * frame moves the page while it boots: measured, a single call left the
     * frame 198 px above the top of the window. Each pass stops as soon as the
     * frame is where it belongs.
     */
    let tries = 0;
    const settle = () => {
      if (!frame || tries++ > 12) return;
      const top = frame.getBoundingClientRect().top;
      if (Math.abs(top - 76) > 12) frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(settle, 300);
    };
    requestAnimationFrame(settle);
  }

  /** For the "open full size" link, which always lands in the real editor. */
  const fullHref = $derived(`/app/${mode}?${query}`);
</script>

<figure class="post-embed">
  <div class="post-embed-frame" class:live bind:this={frame}>
    {#if live}
      <iframe {src} title={label} loading="lazy"></iframe>
    {:else}
      <button class="post-embed-start" onclick={open}>
        <span class="post-embed-play" aria-hidden="true">▶</span>
        <span class="post-embed-start-label">{t('blog.embedStart')}</span>
        <span class="post-embed-start-note">{t('blog.embedNote')}</span>
      </button>
    {/if}
  </div>
  <figcaption>
    {label}
    <a href={fullHref} target="_blank" rel="noreferrer">{t('blog.embedOpenFull')}</a>
  </figcaption>
</figure>
