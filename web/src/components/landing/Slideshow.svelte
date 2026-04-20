<script lang="ts">
  import { onDestroy } from 'svelte';

  type Props = {
    images: string[];
    alt?: string;
    interval?: number;
    prefersReducedMotion?: boolean;
    ariaPrefix?: string;
    class?: string;
    imgClass?: string;
    dotsClass?: string;
  };

  let {
    images,
    alt = '',
    interval = 4500,
    prefersReducedMotion = false,
    ariaPrefix = 'slide',
    class: rootClass = '',
    imgClass = '',
    dotsClass = 'slide-dots',
  }: Props = $props();

  let idx = $state(0);
  let paused = $state(false);
  let iv: ReturnType<typeof setInterval> | null = null;

  function start() {
    stop();
    if (prefersReducedMotion || images.length < 2) return;
    iv = setInterval(() => {
      if (!paused) idx = (idx + 1) % images.length;
    }, interval);
  }

  function stop() {
    if (iv) clearInterval(iv);
    iv = null;
  }

  function goTo(i: number) {
    idx = i;
    paused = true;
    stop();
    if (prefersReducedMotion || images.length < 2) return;
    iv = setInterval(() => {
      if (paused) {
        paused = false;
        return;
      }
      idx = (idx + 1) % images.length;
    }, interval + 300);
  }

  $effect(() => {
    // Restart when images array reference or prefersReducedMotion changes.
    void images;
    void prefersReducedMotion;
    start();
    return stop;
  });

  onDestroy(stop);
</script>

<div class={rootClass}>
  <img src={images[idx]} {alt} class={imgClass} loading="lazy" />
  {#if images.length > 1}
    <div class={dotsClass}>
      {#each images as _, i}
        <button
          class="dot"
          class:active={i === idx}
          onclick={() => goTo(i)}
          aria-label="{ariaPrefix} {i + 1}"
        ></button>
      {/each}
    </div>
  {/if}
</div>
