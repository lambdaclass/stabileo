import { globalAxes } from '../features';
import { DEFAULT_AXES, makeFrame, validChoice, type AxesChoice, type AxesFrame } from './frame';

const STORAGE_KEY = 'stabileo-axes';

function readStored(): AxesChoice {
  if (!globalAxes()) return DEFAULT_AXES;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AXES;
    const parsed = JSON.parse(raw);
    return validChoice(parsed) ? parsed : DEFAULT_AXES;
  } catch {
    return DEFAULT_AXES;
  }
}

function writeStored(c: AxesChoice): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    return;
  }
}

let choice = $state<AxesChoice>(readStored());
const canonicalFrame = makeFrame(DEFAULT_AXES);
const frame = $derived<AxesFrame>(makeFrame(choice));
let pickerOpen = $state(false);

export const axesStore = {
  get choice(): AxesChoice { return globalAxes() ? choice : DEFAULT_AXES; },
  set choice(c: AxesChoice) {
    if (!globalAxes() || !validChoice(c)) return;
    choice = { ...c };
    writeStored(choice);
  },
  get frame(): AxesFrame { return globalAxes() ? frame : canonicalFrame; },
  get pickerOpen(): boolean { return globalAxes() && pickerOpen; },
  set pickerOpen(v: boolean) { pickerOpen = globalAxes() && v; },
  reset(): void { this.choice = DEFAULT_AXES; },
};
