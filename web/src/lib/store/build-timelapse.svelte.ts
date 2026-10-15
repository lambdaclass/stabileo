/**
 * The build timelapse's state: whether it is on, its options and its clock.
 *
 * The 3D viewport reads it every frame (`tick`) and draws the structure as far as `time` has
 * got; the panel sets the options and plays, pauses, scrubs and records. The options are
 * remembered between sessions; the clock and the texts are not.
 */
import type { BuildOrder } from '../viewport3d/build-timelapse';
import { timelapseSound, type TimelapseSound } from '../viewport3d/timelapse-sound';

/** Seconds the finished structure is held before a loop starts again. */
export const HOLD_S = 3;
/** Seconds the supports take to appear, before the first piece. */
export const LEAD_S = 0.8;

/** How it looks: a dark stage, a light studio, or the model's own colours and grid. */
export type TimelapseStyle = 'night' | 'studio' | 'model';
/** The frame drawn and recorded: the viewport's own, or a fixed video size. */
export type TimelapseFormat = 'screen' | '16:9' | '1:1' | '9:16';
/** How a piece comes in: growing from its end, or lowered into place from above. */
export type TimelapseEntry = 'grow' | 'drop';
/** What the camera does while it plays. */
export type TimelapseCamera = 'orbit' | 'rise' | 'fixed';

/** Pixel size of each fixed format; `screen` follows the viewport. */
export const FORMAT_SIZE: Record<Exclude<TimelapseFormat, 'screen'>, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
};

interface Prefs {
  order: BuildOrder; duration: number; camera: TimelapseCamera; loop: boolean; clean: boolean;
  style: TimelapseStyle; format: TimelapseFormat; entry: TimelapseEntry; texts: boolean; highlight: boolean;
  sound: TimelapseSound; envelope: boolean;
}
const DEFAULTS: Prefs = {
  order: 'construction', duration: 12, camera: 'orbit', loop: true, clean: false,
  style: 'night', format: 'screen', entry: 'grow', texts: true, highlight: true, sound: 'off', envelope: false,
};
const KEY = 'stabileo-build-timelapse';

function loadPrefs(): Prefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function createBuildTimelapse() {
  const p = loadPrefs();
  let active = $state(false);
  let playing = $state(false);
  let order = $state<BuildOrder>(p.order);
  let duration = $state(p.duration);
  let camera = $state<TimelapseCamera>(p.camera);
  let loop = $state(p.loop);
  let cleanBackground = $state(p.clean);
  let style = $state<TimelapseStyle>(p.style);
  let format = $state<TimelapseFormat>(p.format);
  let entry = $state<TimelapseEntry>(p.entry);
  let texts = $state(p.texts);
  let highlight = $state(p.highlight);
  let sound = $state<TimelapseSound>(p.sound);
  /** Cladding and glass on the façades once the structure stands (`build-envelope.ts`). */
  let envelope = $state(p.envelope);
  /** The heading drawn on the video; empty takes the model's name. */
  let title = $state('');
  /** An optional line under the title. */
  let subtitle = $state('');
  let recording = $state(false);
  /** Shown on the scrubber; written a few times a second, not every frame. */
  let shownTime = $state(0);
  /** Seconds the build lasts once scheduled (lead + pieces), set by the viewport. */
  let total = $state(0);

  let time = 0;
  let lastNow = -1;
  let lastShown = 0;

  function save() {
    try {
      const prefs: Prefs = { order, duration, camera, loop, clean: cleanBackground, style, format, entry, texts, highlight, sound, envelope };
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch { /* private window or blocked storage: the options last this session */ }
  }

  return {
    get active() { return active; },
    get playing() { return playing; },
    get order() { return order; }, set order(v: BuildOrder) { order = v; save(); },
    get duration() { return duration; }, set duration(v: number) { duration = v; save(); },
    get camera() { return camera; }, set camera(v: TimelapseCamera) { camera = v; save(); },
    get loop() { return loop; }, set loop(v: boolean) { loop = v; save(); },
    get cleanBackground() { return cleanBackground; }, set cleanBackground(v: boolean) { cleanBackground = v; save(); },
    get style() { return style; }, set style(v: TimelapseStyle) { style = v; save(); },
    get format() { return format; }, set format(v: TimelapseFormat) { format = v; save(); },
    get entry() { return entry; }, set entry(v: TimelapseEntry) { entry = v; save(); },
    get texts() { return texts; }, set texts(v: boolean) { texts = v; save(); },
    get highlight() { return highlight; }, set highlight(v: boolean) { highlight = v; save(); },
    get sound() { return sound; }, set sound(v: TimelapseSound) { sound = v; save(); },
    get envelope() { return envelope; }, set envelope(v: boolean) { envelope = v; save(); },
    get title() { return title; }, set title(v: string) { title = v; },
    get subtitle() { return subtitle; }, set subtitle(v: string) { subtitle = v; },
    get recording() { return recording; }, set recording(v: boolean) { recording = v; },
    get shownTime() { return shownTime; },
    get total() { return total; }, set total(v: number) { total = v; },
    /** Seconds into the build, lead included. */
    get time() { return time; },

    open() { active = true; time = 0; shownTime = 0; lastNow = -1; playing = true; },
    /** Off, and its sound with it (`timelapseSound.release`). */
    close() { active = false; playing = false; recording = false; timelapseSound.release(); },
    play() { if (time >= total + HOLD_S) time = 0; lastNow = -1; playing = true; },
    pause() { playing = false; },
    restart() { time = 0; shownTime = 0; lastNow = -1; playing = true; },
    seek(t: number) { time = Math.max(0, Math.min(total + HOLD_S, t)); shownTime = Math.min(time, total); lastNow = -1; },

    /**
     * Advance the clock to `now` (ms) and say whether a cycle just ended. Called once a frame
     * by the viewport while the timelapse is on.
     */
    tick(now: number): { ended: boolean } {
      let ended = false;
      if (playing) {
        if (lastNow >= 0) time += Math.min(0.1, (now - lastNow) / 1000);
        lastNow = now;
        if (time >= total + HOLD_S) {
          ended = true;
          if (loop && !recording) time = 0;
          else { time = total + HOLD_S; playing = false; }
        }
      }
      if (Math.abs(time - lastShown) > 0.05 || ended) { lastShown = time; shownTime = Math.min(time, total); }
      return { ended };
    },
  };
}

export const buildTimelapse = createBuildTimelapse();
