export interface Space {
  /** The board, in CSS pixels. */
  width: number;
  height: number;
  options: number;
  /** Width over height of the drawing every option and the structure share. */
  aspect: number;
  gap: number;
  /** What a card spends around its drawing: border, padding and label. */
  cardChromeX: number;
  cardChromeY: number;
  problemChrome: number;
  /** Height an explanation takes inside a card, and the narrowest card that still holds one readably. */
  textHeight: number;
  textMinWidth: number;
  /** Whether the cards already show the structure and its loads, so the structure on its own may give way. */
  structureInCards: boolean;
}

export interface Arrangement {
  problem: 'top' | 'left' | 'none';
  /** Share of the board's height (top) or width (left) the structure takes. */
  split: number;
  columns: number;
  /** Pixels per unit of drawing in the cards and in the structure. */
  optionScale: number;
  problemScale: number;
  cardWidth: number;
  /** Whether cards are wide enough to carry their own explanation; otherwise it goes to the bar under the board. */
  text: boolean;
}

const SPLITS = [0.22, 0.3, 0.38, 0.46];
/** How much larger the cards must get before the structure on its own is left out, and below which drawing height a board counts as cramped. */
const WITHOUT_STRUCTURE = 1.35;
const CRAMPED = 100;

function fit(w: number, h: number, aspect: number): number {
  return w <= 0 || h <= 0 ? 0 : Math.min(w / aspect, h);
}

/**
 * The arrangement whose smallest drawing, card or structure, is largest. A tall frame on a phone held
 * upright then sits beside the options, in a row, instead of shrinking into wide, flat cards.
 */
export function arrange(s: Space): Arrangement {
  let best: Arrangement | null = null;
  let bestScore = -1;
  for (const problem of ['top', 'left'] as const) {
    for (const split of SPLITS) {
      const pw = problem === 'top' ? s.width : s.width * split - s.gap / 2;
      const ph = problem === 'top' ? s.height * split - s.gap / 2 : s.height;
      const ow = problem === 'top' ? s.width : s.width - pw - s.gap;
      const oh = problem === 'top' ? s.height - ph - s.gap : s.height;
      const problemScale = fit(pw - s.problemChrome, ph - s.problemChrome, s.aspect);
      for (let columns = 1; columns <= s.options; columns++) {
        const rows = Math.ceil(s.options / columns);
        const cw = (ow - (columns - 1) * s.gap) / columns, ch = (oh - (rows - 1) * s.gap) / rows;
        const text = cw >= s.textMinWidth;
        const optionScale = fit(cw - s.cardChromeX, ch - s.cardChromeY - (text ? s.textHeight : 0), s.aspect);
        const score = Math.min(optionScale, problemScale) + 1e-3 * optionScale;
        if (score > bestScore) {
          bestScore = score;
          best = { problem, split, columns, optionScale, problemScale, cardWidth: cw, text };
        }
      }
    }
  }
  if (s.structureInCards && bestScore < CRAMPED) {
    for (let columns = 1; columns <= s.options; columns++) {
      const rows = Math.ceil(s.options / columns);
      const cw = (s.width - (columns - 1) * s.gap) / columns, ch = (s.height - (rows - 1) * s.gap) / rows;
      const text = cw >= s.textMinWidth;
      const optionScale = fit(cw - s.cardChromeX, ch - s.cardChromeY - (text ? s.textHeight : 0), s.aspect);
      if (optionScale > WITHOUT_STRUCTURE * bestScore) {
        bestScore = optionScale / WITHOUT_STRUCTURE;
        best = { problem: 'none', split: 0, columns, optionScale, problemScale: 0, cardWidth: cw, text };
      }
    }
  }
  return best!;
}
