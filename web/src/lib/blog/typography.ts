/**
 * Typographer's quotes for the blog's prose (Practical Typography: straight
 * quotes are a typewriter habit; set curly ones).
 *
 * The posts are written with plain `"` and `'` so they stay easy to edit and
 * diff; this turns them into “ ” and ’ when a block is rendered. A quote is
 * an opening one at the start of the text or after whitespace or an opening
 * bracket, a closing one otherwise; an apostrophe inside a word is ’. Text
 * that already has curly quotes is left as it is.
 */
export function smartQuotes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = i > 0 ? text[i - 1]! : '';
    const opens = prev === '' || /[\s([{—–¿¡]/.test(prev);
    if (ch === '"') out += opens ? '“' : '”';
    else if (ch === "'") out += opens ? '‘' : '’';
    else out += ch;
  }
  return out;
}
