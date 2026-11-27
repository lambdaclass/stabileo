export const numbers = (s: string, _locale: string) => s.replace(/(\d),(\d)/g, '$1.$2').match(/\d+(?:\.\d+)*(?:e[+-]?\d+)?/g) ?? [];
