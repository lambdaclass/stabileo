export type Fmt = (v: number, digits?: number) => string;

export function makeFmt(decimal: ',' | '.'): Fmt {
  return (v, digits = 2) => {
    if (!Number.isFinite(v)) return '∞';
    const s = v.toFixed(digits);
    return decimal === ',' ? s.replace('.', ',') : s;
  };
}

export const decimalFor = (locale: string): ',' | '.' => (['en', 'zh', 'ja', 'ko', 'hi'].includes(locale) ? '.' : ',');
