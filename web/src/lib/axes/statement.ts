import { gravityLabel, makeFrame, plane2D, signedLabel, upLabel, type AxesChoice } from './frame';

export function axesStatement(tr: (key: string) => string, choice: AxesChoice): string {
  const f = makeFrame(choice);
  const p = plane2D(f);
  const summary = tr('axes.summary')
    .replace('{gravity}', gravityLabel(f))
    .replace('{h}', signedLabel(p.horizontal).replace('+', ''))
    .replace('{v}', signedLabel(p.vertical).replace('+', ''));
  return `${tr('axes.title')}: ${upLabel(f)} ↑, ${tr(choice.hand === 'right' ? 'axes.handRight' : 'axes.handLeft')} (frame up=${choice.up} right=${choice.right} hand=${choice.hand}). ${summary}`;
}
