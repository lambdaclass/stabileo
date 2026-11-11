const SOUND_KEY = 'stabileo.diagramGame.sound';

export type Cue = 'right' | 'wrong' | 'level' | 'over' | 'tick';

export function readSound(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeSound(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    return;
  }
}

let ctx: AudioContext | null | undefined;

function audio(): AudioContext | null {
  if (ctx !== undefined) return ctx;
  try {
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Synthesised, so the page loads no audio file; call it from the click or key that answered, where browsers allow sound. */
export function cue(kind: Cue, streak = 0): void {
  const a = audio();
  if (!a) return;
  try {
    if (a.state === 'suspended') void a.resume();
    const t = a.currentTime + 0.01;
    const lift = 2 ** (Math.min(streak, 8) / 12);
    if (kind === 'right') {
      tone(a, 523 * lift, t, 0.12, 'triangle', 0.12);
      tone(a, 784 * lift, t + 0.08, 0.2, 'triangle', 0.12);
    } else if (kind === 'wrong') {
      tone(a, 180, t, 0.28, 'sawtooth', 0.06, 90);
    } else if (kind === 'level') {
      [523, 659, 784, 1047].forEach((f, k) => tone(a, f, t + k * 0.09, 0.22, 'square', 0.05));
    } else if (kind === 'over') {
      [392, 330, 262].forEach((f, k) => tone(a, f, t + k * 0.16, 0.3, 'triangle', 0.09));
    } else {
      tone(a, 1200, t, 0.04, 'sine', 0.03);
    }
  } catch {
    return;
  }
}
