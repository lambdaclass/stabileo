import { expect, it } from 'vitest';
import { createResponsiveFixtureRenderer } from '../responsive-fixture';

it('known wrong result: #2595 — selection turns in the direction of the clicked arrow', async () => {
  const renderer = await createResponsiveFixtureRenderer();
  try {
    const html = await renderer.render('selection-rotation', 900);
    const turns = JSON.parse(html.match(/<pre id="checks">(.*?)<\/pre>/s)![1]);
    expect(turns).toHaveLength(24);
    for (const turn of turns) {
      expect.soft([turn.y, turn.z], JSON.stringify(turn)).toEqual([turn.arrow === '↻' ? -1 : 1, 0]);
    }
  } finally {
    await renderer.close();
  }
}, 60_000);
