import { gravityLabel, makeFrame, plane2D, planeSigns, signedLabel, upLabel, type AxesChoice } from './frame';

export function axesStatement(tr: (key: string) => string, choice: AxesChoice): string {
  const f = makeFrame(choice);
  const p = plane2D(f);
  const summary = tr('axes.summary')
    .replace('{gravity}', gravityLabel(f))
    .replace('{h}', signedLabel(p.horizontal).replace('+', ''))
    .replace('{v}', signedLabel(p.vertical).replace('+', ''));
  return `${tr('axes.title')}: ${upLabel(f)} ↑, ${tr(choice.hand === 'right' ? 'axes.handRight' : 'axes.handLeft')} (frame up=${choice.up} right=${choice.right} hand=${choice.hand}). ${summary}`;
}

export function planeStatement(tr: (key: string) => string, choice: AxesChoice): string {
  const p = planeSigns(makeFrame(choice));
  return tr('steps.common.userFrame')
    .replace('{h}', p.h).replace('{v}', p.v).replace('{n}', p.n)
    .replace('{hdir}', tr(p.sx > 0 ? 'steps.common.dirRight' : 'steps.common.dirLeft'))
    .replace('{vdir}', tr(p.sz > 0 ? 'steps.common.dirUp' : 'steps.common.dirDown'))
    .replace('{rdir}', tr(p.sr > 0 ? 'steps.common.dirCcw' : 'steps.common.dirCw'))
    + (p.sx < 0 || p.sz < 0 ? ` ${tr('steps.common.userFrameMirror').replace(/\{h\}/g, p.h).replace(/\{v\}/g, p.v)}` : '');
}
