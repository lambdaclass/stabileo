/**
 * Which load step an experiment shows, and the autoplay rules every experiment follows:
 * on load a replay plays through, holds about two seconds and loops; any interaction hands
 * control to the visitor for good; it pauses while off screen; under reduced motion it shows the
 * last step instead; on narrow screens it plays once.
 */
export type Source = 'replay' | 'live' | 'cached';

export const SOURCE_LABEL: Record<Source, string> = {
  replay: 'Replay of a run precomputed with this solver',
  live: 'Live computation in your browser',
  cached: 'Cached result (computed in this browser)',
};

export class Playback {
  shown = $state(0);
  playing = $state(false);
  /** True until the visitor touches anything. */
  auto = $state(true);
  /** Follow the newest step while a live run streams in. */
  follow = $state(true);
  visible = $state(true);
  private count = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loop = true;
  constructor(private stepMs = 110, private holdMs = 2000) {}

  /** Tell the playback how many steps there are now. */
  setCount(n: number) {
    this.count = n;
    if (this.follow && n > 0) this.shown = n - 1;
    if (this.shown > n - 1) this.shown = Math.max(0, n - 1);
  }

  startAutoplay(opts: { reducedMotion: boolean; narrow: boolean }) {
    if (!this.auto || this.count === 0) return;
    this.follow = false;
    if (opts.reducedMotion) {
      this.shown = this.count - 1;
      this.auto = false;
      return;
    }
    this.loop = !opts.narrow;
    this.shown = 0;
    this.playing = true;
    this.tick();
  }

  /** Any control, the slider, Play/Pause or Run: autoplay ends and does not come back. */
  interact() {
    this.auto = false;
    this.loop = false;
    this.playing = false;
    this.clear();
  }

  play() {
    this.interact();
    this.follow = false;
    if (this.shown >= this.count - 1) this.shown = 0;
    this.playing = true;
    this.tick();
  }

  pause() {
    this.interact();
    this.playing = false;
    this.clear();
  }

  seek(i: number) {
    this.interact();
    this.follow = false;
    this.playing = false;
    this.clear();
    this.shown = Math.max(0, Math.min(this.count - 1, i));
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) this.clear();
    else if (this.playing) this.tick();
  }

  private clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick() {
    this.clear();
    if (!this.playing) return;
    if (!this.visible) return;
    const atEnd = this.shown >= this.count - 1;
    this.timer = setTimeout(
      () => {
        if (!this.playing) return;
        if (this.shown < this.count - 1) this.shown += 1;
        else if (this.loop && this.auto) this.shown = 0;
        else {
          this.playing = false;
          return;
        }
        this.tick();
      },
      atEnd ? this.holdMs : this.stepMs,
    );
  }

  dispose() {
    this.playing = false;
    this.clear();
  }
}
