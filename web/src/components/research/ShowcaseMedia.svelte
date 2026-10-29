<script lang="ts">
  import { onMount } from 'svelte';
  import FieldIcon from './FieldIcon.svelte';
  import { previewSource, playPreview } from './showcase';

  let { thumbnail, preview, alt, field }: { thumbnail: string; preview?: string; alt: string; field: string } = $props();
  let container: HTMLDivElement;
  let visible = $state(false);
  let reducedMotion = $state(true);
  let videoFailed = $state(false);
  let imageFailed = $state(false);
  const base = import.meta.env.BASE_URL;
  const source = $derived(previewSource(preview, reducedMotion, visible, videoFailed));

  onMount(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => { reducedMotion = motion.matches; };
    updateMotion();
    motion.addEventListener('change', updateMotion);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
    });
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      motion.removeEventListener('change', updateMotion);
    };
  });

  function play(video: HTMLVideoElement) {
    // Autoplay restrictions or decoding failures must never block the gallery.
    return playPreview(video, () => { videoFailed = true; });
  }
</script>

<div class="media" bind:this={container}>
  {#if source}
    <video use:play src="{base}{source}" poster="{base}{thumbnail}" muted autoplay loop playsinline preload="none" aria-label={alt} onerror={() => { videoFailed = true; }}></video>
  {:else if !imageFailed}
    <img src="{base}{thumbnail}" width="640" height="400" loading="lazy" decoding="async" {alt} onerror={() => { imageFailed = true; }} />
  {:else}
    <span class="rs-g-thumb-icon"><FieldIcon {field} size={96} /></span>
  {/if}
</div>

<style>
  .media { width: 100%; height: 100%; }
  img, video { display: block; width: 100%; height: 100%; object-fit: cover; }
  .rs-g-thumb-icon { display: grid; place-items: center; height: 100%; }
</style>
