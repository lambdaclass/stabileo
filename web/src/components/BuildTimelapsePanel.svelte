<script lang="ts">
  /**
   * The build timelapse's controls: play, scrub, order and length up front; the look, the
   * format, the camera and the texts folded under a summary; and a video of the picture. The
   * video is the picture the stage shows (the render plus its texts), so the panel and the rest
   * of the page stay out of it.
   */
  import { buildTimelapse, type TimelapseCamera, type TimelapseEntry, type TimelapseFormat, type TimelapseStyle } from '../lib/store/build-timelapse.svelte';
  import { modelStore, uiStore } from '../lib/store';
  import { t, tp } from '../lib/i18n';
  import type { BuildOrder } from '../lib/viewport3d/build-timelapse';
  import { timelapseSound, type TimelapseSound } from '../lib/viewport3d/timelapse-sound';
  import { startRecording } from '../lib/viewport3d/timelapse-recording';

  let { picture, stage }: { picture: HTMLCanvasElement | null; stage: HTMLElement | null } = $props();

  const ORDERS: Array<{ id: BuildOrder; key: string }> = [
    { id: 'construction', key: 'timelapse.orderConstruction' },
    { id: 'bottomUp', key: 'timelapse.orderBottomUp' },
    { id: 'along', key: 'timelapse.orderAlong' },
    { id: 'byType', key: 'timelapse.orderByType' },
    { id: 'radial', key: 'timelapse.orderRadial' },
    { id: 'list', key: 'timelapse.orderList' },
  ];
  const DURATIONS = [6, 10, 12, 15, 20, 30, 45];
  const STYLES: Array<{ id: TimelapseStyle; key: string }> = [
    { id: 'night', key: 'timelapse.styleNight' },
    { id: 'studio', key: 'timelapse.styleStudio' },
    { id: 'model', key: 'timelapse.styleModel' },
  ];
  const FORMATS: Array<{ id: TimelapseFormat; label: string }> = [
    { id: 'screen', label: '' },
    { id: '16:9', label: '16:9 · 1920×1080' },
    { id: '1:1', label: '1:1 · 1080×1080' },
    { id: '9:16', label: '9:16 · 1080×1920' },
  ];
  const ENTRIES: Array<{ id: TimelapseEntry; key: string }> = [
    { id: 'grow', key: 'timelapse.entryGrow' },
    { id: 'drop', key: 'timelapse.entryDrop' },
  ];
  const SOUNDS: Array<{ id: TimelapseSound; key: string }> = [
    { id: 'off', key: 'timelapse.soundOff' },
    { id: 'blocks', key: 'timelapse.soundBlocks' },
    { id: 'metal', key: 'timelapse.soundMetal' },
    { id: 'soft', key: 'timelapse.soundSoft' },
  ];
  const CAMERAS: Array<{ id: TimelapseCamera; key: string }> = [
    { id: 'orbit', key: 'timelapse.cameraOrbit' },
    { id: 'rise', key: 'timelapse.cameraRise' },
    { id: 'fixed', key: 'timelapse.cameraFixed' },
  ];

  const orders = ORDERS;
  // A phased order remembered from elsewhere is not offered here: it builds as it would go up.
  const order = $derived(ORDERS.some((o) => o.id === buildTimelapse.order) ? buildTimelapse.order : 'construction');
  const empty = $derived(modelStore.elements.size + modelStore.plates.size + modelStore.quads.size === 0);
  const formatLabel = (f: TimelapseFormat) => (f === 'screen' ? t('timelapse.formatScreen') : FORMATS.find((x) => x.id === f)!.label);
  const summary = $derived([
    t(STYLES.find((s) => s.id === buildTimelapse.style)!.key),
    buildTimelapse.format === 'screen' ? t('timelapse.formatScreen') : buildTimelapse.format,
    t(CAMERAS.find((c) => c.id === buildTimelapse.camera)!.key),
    buildTimelapse.sound !== 'off' ? t(SOUNDS.find((x) => x.id === buildTimelapse.sound)!.key) : null,
    buildTimelapse.texts ? t('timelapse.texts') : null,
    buildTimelapse.envelope ? t('timelapse.envelopeShort') : null,
  ].filter(Boolean).join(' · '));

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let keep = true;
  let fullscreen = $state(false);

  function pickType(): { mime: string; ext: string } | null {
    if (typeof MediaRecorder === 'undefined') return null;
    // With sound the container has to take an audio track too.
    const audio = buildTimelapse.sound !== 'off';
    for (const [mime, ext] of (audio ? [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
    ] : [
      ['video/mp4;codecs=avc1.640028', 'mp4'], ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9', 'webm'], ['video/webm', 'webm'],
    ]) as Array<readonly [string, string]>) {
      if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
    }
    return null;
  }

  /** "stabileo-industrial-building-9x16.mp4": the model and the format in the name. */
  function fileName(ext: string): string {
    const slug = (buildTimelapse.title.trim() || modelStore.model.name || 'armado')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'armado';
    const fmt = buildTimelapse.format === 'screen' ? '' : `-${buildTimelapse.format.replace(':', 'x')}`;
    return `stabileo-${slug}${fmt}.${ext}`;
  }

  function record() {
    const type = pickType();
    if (!picture || !type || typeof picture.captureStream !== 'function') {
      uiStore.toast(t('timelapse.noRecorder'), 'error');
      return;
    }
    chunks = [];
    keep = true;
    if (buildTimelapse.sound !== 'off') timelapseSound.unlock();
    // The picture's track is stopped with the recording, and a recorder the browser refuses is
    // told rather than left with "recording" on (`timelapse-recording.ts`).
    const rec = startRecording({
      picture, mime: type.mime,
      audio: buildTimelapse.sound !== 'off' ? timelapseSound.track() : null,
      onData: (chunk) => chunks.push(chunk),
      onStart: () => { buildTimelapse.recording = true; buildTimelapse.restart(); },
      onStop: () => {
        recorder = null;
        buildTimelapse.recording = false;
        if (!keep || chunks.length === 0) return;
        const file = fileName(type.ext);
        const url = URL.createObjectURL(new Blob(chunks, { type: type.mime }));
        const a = document.createElement('a');
        a.href = url; a.download = file; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        uiStore.toast(tp('timelapse.saved', { file }), 'success');
      },
    });
    if (!rec) {
      buildTimelapse.recording = false;
      uiStore.toast(t('timelapse.noRecorder'), 'error');
      return;
    }
    recorder = rec;
  }

  function stopRecording(save: boolean) {
    keep = save;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else buildTimelapse.recording = false;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage?.requestFullscreen?.();
  }

  // The recording ends with the build (and the closing card after it).
  $effect(() => {
    if (buildTimelapse.recording && !buildTimelapse.playing) stopRecording(true);
  });
  // Closing the panel drops a recording in progress.
  $effect(() => () => { if (recorder) stopRecording(false); });

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.key === ' ' && !buildTimelapse.recording) {
      e.preventDefault();
      timelapseSound.unlock();
      if (buildTimelapse.playing) buildTimelapse.pause(); else buildTimelapse.play();
    } else if (e.key === 'Escape' && !document.fullscreenElement) {
      if (buildTimelapse.recording) stopRecording(false);
      buildTimelapse.close();
    } else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !buildTimelapse.recording) {
      buildTimelapse.restart();
    }
  }

  const fmt = (s: number) => `${s.toFixed(1)} s`;
</script>

<svelte:window onkeydown={onKey} />
<svelte:document onfullscreenchange={() => { fullscreen = !!document.fullscreenElement; }} />

<div class="tl-panel" data-testid="build-timelapse-panel">
  <div class="tl-row">
    <span class="tl-title">{t('timelapse.title')}</span>
    <button class="tl-x" title={t('timelapse.fullscreen')} aria-label={t('timelapse.fullscreen')} onclick={toggleFullscreen}>{fullscreen ? '⤡' : '⤢'}</button>
    <button class="tl-x" title={t('timelapse.close')} aria-label={t('timelapse.close')} onclick={() => buildTimelapse.close()}>✕</button>
  </div>

  {#if empty}
    <p class="tl-empty">{t('timelapse.empty')}</p>
  {:else}
    <div class="tl-row">
      <button
        class="tl-btn tl-play"
        data-testid="timelapse-play"
        disabled={buildTimelapse.recording}
        title={buildTimelapse.playing ? t('timelapse.pause') : t('timelapse.play')}
        onclick={() => { timelapseSound.unlock(); if (buildTimelapse.playing) buildTimelapse.pause(); else buildTimelapse.play(); }}
      >{buildTimelapse.playing ? '❚❚' : '▶'}</button>
      <button class="tl-btn" title={t('timelapse.restart')} disabled={buildTimelapse.recording} onclick={() => { timelapseSound.unlock(); buildTimelapse.restart(); }}>⟲</button>
      <input
        class="tl-scrub"
        type="range"
        min="0"
        max={buildTimelapse.total || 1}
        step="0.01"
        value={buildTimelapse.shownTime}
        disabled={buildTimelapse.recording}
        aria-label={t('timelapse.title')}
        oninput={(e) => { buildTimelapse.pause(); buildTimelapse.seek(+e.currentTarget.value); }}
      />
      <span class="tl-time">{fmt(buildTimelapse.shownTime)} / {fmt(buildTimelapse.total)}</span>
    </div>

    <div class="tl-row tl-opts">
      <label class="tl-field">
        <span>{t('timelapse.order')}</span>
        <select value={order} data-testid="timelapse-order" disabled={buildTimelapse.recording} onchange={(e) => { buildTimelapse.order = e.currentTarget.value as BuildOrder; buildTimelapse.restart(); }}>
          {#each orders as o (o.id)}<option value={o.id}>{t(o.key)}</option>{/each}
        </select>
      </label>
      <label class="tl-field">
        <span>{t('timelapse.duration')}</span>
        <select value={buildTimelapse.duration} disabled={buildTimelapse.recording} onchange={(e) => { buildTimelapse.duration = +e.currentTarget.value; buildTimelapse.restart(); }}>
          {#each DURATIONS as d (d)}<option value={d}>{d} s</option>{/each}
        </select>
      </label>
      <label class="tl-check"><input type="checkbox" bind:checked={buildTimelapse.loop} />{t('timelapse.loop')}</label>
    </div>

    <details class="tl-more">
      <summary><span class="tl-more-h">{t('timelapse.lookAndVideo')}</span><span class="tl-more-s">{summary}</span></summary>
      <div class="tl-grid">
        <label class="tl-field">
          <span>{t('timelapse.style')}</span>
          <select value={buildTimelapse.style} onchange={(e) => { buildTimelapse.style = e.currentTarget.value as TimelapseStyle; }}>
            {#each STYLES as s (s.id)}<option value={s.id}>{t(s.key)}</option>{/each}
          </select>
        </label>
        <label class="tl-field">
          <span>{t('timelapse.format')}</span>
          <select value={buildTimelapse.format} disabled={buildTimelapse.recording} onchange={(e) => { buildTimelapse.format = e.currentTarget.value as TimelapseFormat; }}>
            {#each FORMATS as f (f.id)}<option value={f.id}>{formatLabel(f.id)}</option>{/each}
          </select>
        </label>
        <label class="tl-field">
          <span>{t('timelapse.entry')}</span>
          <select value={buildTimelapse.entry} onchange={(e) => { buildTimelapse.entry = e.currentTarget.value as TimelapseEntry; }}>
            {#each ENTRIES as en (en.id)}<option value={en.id}>{t(en.key)}</option>{/each}
          </select>
        </label>
        <label class="tl-field">
          <span>{t('timelapse.camera')}</span>
          <select value={buildTimelapse.camera} onchange={(e) => { buildTimelapse.camera = e.currentTarget.value as TimelapseCamera; }}>
            {#each CAMERAS as c (c.id)}<option value={c.id}>{t(c.key)}</option>{/each}
          </select>
        </label>
        <label class="tl-field">
          <span>{t('timelapse.sound')}</span>
          <select value={buildTimelapse.sound} data-testid="timelapse-sound" onchange={(e) => { timelapseSound.unlock(); buildTimelapse.sound = e.currentTarget.value as TimelapseSound; }}>
            {#each SOUNDS as x (x.id)}<option value={x.id}>{t(x.key)}</option>{/each}
          </select>
        </label>
      </div>
      <div class="tl-row tl-opts">
        <label class="tl-check"><input type="checkbox" bind:checked={buildTimelapse.highlight} />{t('timelapse.highlight')}</label>
        <label class="tl-check"><input type="checkbox" bind:checked={buildTimelapse.cleanBackground} disabled={buildTimelapse.style === 'studio'} />{t('timelapse.clean')}</label>
        <label class="tl-check"><input type="checkbox" bind:checked={buildTimelapse.texts} />{t('timelapse.texts')}</label>
        <!-- A picture only: the façades of a building, clad and glazed once the structure stands. -->
        <label class="tl-check" title={t('timelapse.envelopeTip')}><input type="checkbox" bind:checked={buildTimelapse.envelope} data-testid="timelapse-envelope" />{t('timelapse.envelope')}</label>
      </div>
      {#if buildTimelapse.texts}
        <label class="tl-field tl-title-field">
          <span>{t('timelapse.videoTitle')}</span>
          <input type="text" value={buildTimelapse.title} placeholder={modelStore.model.name || t('timelapse.title')} oninput={(e) => { buildTimelapse.title = e.currentTarget.value; }} />
        </label>
        <label class="tl-field tl-title-field">
          <span>{t('timelapse.videoSubtitle')}</span>
          <input type="text" data-testid="timelapse-subtitle" value={buildTimelapse.subtitle} placeholder={t('timelapse.optional')} oninput={(e) => { buildTimelapse.subtitle = e.currentTarget.value; }} />
        </label>
      {/if}
    </details>

    <div class="tl-row">
      {#if buildTimelapse.recording}
        <span class="tl-rec-dot"></span><span class="tl-rec">{t('timelapse.recording')}</span>
        <button class="tl-btn tl-wide" onclick={() => stopRecording(true)}>{t('timelapse.stopRecording')}</button>
      {:else}
        <button class="tl-btn tl-wide tl-record" data-testid="timelapse-record" onclick={record}>● {t('timelapse.record')}</button>
      {/if}
    </div>
    <p class="tl-keys">{t('timelapse.keys')}</p>
  {/if}
</div>

<style>
  .tl-panel {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 22;
    width: min(400px, calc(100% - 32px));
    max-height: calc(100% - 32px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface);
    box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.55);
    color: var(--st-text);
    font-size: 0.78rem;
  }
  .tl-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tl-opts { flex-wrap: wrap; gap: 6px 12px; }
  .tl-title { flex: 1; font-weight: 600; letter-spacing: 0.02em; }
  .tl-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.9rem; padding: 2px 4px; }
  .tl-x:hover { color: var(--st-text); }
  .tl-btn {
    flex: none;
    min-width: 32px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text);
    cursor: pointer;
  }
  .tl-btn:hover:not(:disabled) { border-color: var(--st-accent); }
  .tl-btn:disabled { opacity: 0.5; cursor: default; }
  .tl-play { color: var(--st-accent); }
  .tl-wide { flex: 1; }
  .tl-record { color: var(--st-danger); }
  .tl-scrub { flex: 1; min-width: 0; accent-color: var(--st-accent); }
  .tl-time { flex: none; font-variant-numeric: tabular-nums; color: var(--st-text-2); font-size: 0.72rem; }
  .tl-field { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); min-width: 0; }
  .tl-field select, .tl-field input[type='text'] {
    min-width: 0;
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    padding: 2px 4px;
    font-size: 0.74rem;
  }
  .tl-check { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); cursor: pointer; }
  .tl-more { border-top: 1px solid var(--st-hair-strong); padding-top: 6px; }
  .tl-more summary { display: flex; align-items: baseline; gap: 8px; cursor: pointer; list-style: none; }
  .tl-more summary::-webkit-details-marker { display: none; }
  .tl-more summary::before { content: '▸'; color: var(--st-text-3); font-size: 0.7rem; }
  .tl-more[open] summary::before { content: '▾'; }
  .tl-more-h { color: var(--st-text); font-weight: 500; flex: none; }
  .tl-more-s { color: var(--st-text-3); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin: 8px 0 6px; }
  .tl-grid .tl-field { justify-content: space-between; }
  .tl-grid select { flex: 1; max-width: 62%; }
  .tl-title-field { margin-top: 6px; }
  .tl-title-field span { flex: none; width: 4.6em; }
  .tl-title-field input { flex: 1; }
  .tl-empty { margin: 0; color: var(--st-text-2); }
  .tl-keys { margin: 0; color: var(--st-text-3); font-size: 0.68rem; }
  .tl-rec { color: var(--st-danger); }
  .tl-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--st-danger); animation: tl-blink 1s infinite; }
  @keyframes tl-blink { 50% { opacity: 0.25; } }
</style>
