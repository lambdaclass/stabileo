const signLabels = {
  compression: 'landing.heroFigCompression',
  tension: 'landing.heroFigTension',
  zero: 'landing.heroFigZero',
} as const;

export function normalValueFormatter(locale: string, fractionDigits: number) {
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: 'exceptZero',
  });

  return (value: number) => {
    const parts = format.formatToParts(value);
    const mark = parts.find(({ type }) => type === 'minusSign' || type === 'plusSign');
    const sign = mark?.type === 'minusSign' ? 'compression' : mark ? 'tension' : 'zero';
    return { text: parts.map(({ value }) => value).join(''), sign, label: signLabels[sign] };
  };
}
