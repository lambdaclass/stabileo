import assert from 'node:assert/strict';

export async function startWithSwitchesOff(page) {
  await page.addInitScript(() => {
    for (const name of ['research', 'tools', 'diagram-game', 'accounts']) {
      const key = `stabileo-feature-${name}`;
      if (localStorage.getItem(key) === null) localStorage.setItem(key, '0');
    }
  });
}

export async function assertNoGameLinks(page) {
  const links = await page.locator('a[href]').evaluateAll(anchors =>
    anchors.map(anchor => anchor.getAttribute('href')).filter(href => /(?:^|\/)(?:games|diagram-game)(?:[/?#]|$)/.test(href)),
  );
  assert.deepEqual(links, [], 'disabled games must have no landing links');
}
