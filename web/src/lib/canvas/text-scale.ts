/**
 * The reader's label size for the 2D canvas.
 *
 * Every piece of text on the drawing (ids, load values, diagram values,
 * reactions, dimensions) sets its own font, in some thirty places, each with
 * a size in pixels. Rather than thread a factor through all of them, the
 * viewport's context scales whatever size a font names as it is set: the
 * text grows or shrinks everywhere at once, and measureText, which reads the
 * same font, keeps the label layout consistent with what is drawn.
 */

const PX = /(\d+(?:\.\d+)?)px/;

/** `font` with its pixel size multiplied by `scale`. */
export function scaleFont(font: string, scale: number): string {
  if (scale === 1) return font;
  return font.replace(PX, (_, n: string) => `${+(parseFloat(n) * scale).toFixed(2)}px`);
}

/**
 * Make `ctx` scale every font it is given by `scale()`. Done once per context;
 * reading `font` back returns what the canvas uses.
 */
export function scaleCanvasText(ctx: CanvasRenderingContext2D, scale: () => number): void {
  const proto = Object.getPrototypeOf(ctx) as object;
  const desc = Object.getOwnPropertyDescriptor(proto, 'font');
  if (!desc?.set || !desc.get) return;
  const { get, set } = desc;
  Object.defineProperty(ctx, 'font', {
    configurable: true,
    get() { return get.call(this); },
    set(v: string) { set.call(this, scaleFont(v, scale())); },
  });
}
