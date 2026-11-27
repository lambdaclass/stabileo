import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { featuresForMode } from '../../config/public-features.mjs';
import { withProductionFeatures } from '../public-features-test-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = '/scripts/tests/fixtures/pro-mesher-inputs.html';

test('the unified PRO mesher validates all drawn boundaries', async (t) => {
  const features = { ...featuresForMode('production'), proPlatesUnified: true };
  await withProductionFeatures(features, async configFile => {
    const server = await createServer({ root, configFile, mode: 'production', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    t.after(() => server.close());
    await server.listen();
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const url = new URL(fixture, server.resolvedUrls.local[0]);

    async function open() {
      const page = await browser.newPage();
      await page.goto(url.href);
      const mesher = page.getByTestId('mesher');
      await expect(mesher).toBeVisible();
      assert.equal(await page.evaluate(() => window.mesherFixture.unified), true);
      return { page, mesher, outline: page.getByTestId('ms-outline'), apply: page.getByTestId('ms-apply') };
    }

    for (const bad of ['1, 2, 999', '1, 2, 3, 4, typo', '1, 2, 3, 2']) {
      await t.test(`refuses outline ${bad}`, async () => {
        const { page, mesher, outline, apply } = await open();
        try {
          await outline.fill(bad);
          await expect(apply).toBeDisabled();
          await expect(mesher.getByTestId('ms-input-error')).toContainText('Plate outline');
          assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
          await outline.fill('1, 2, 3, 4');
          await apply.click();
          assert.equal(await page.evaluate(() => window.mesherFixture.area()), 16);
        } finally {
          await page.close();
        }
      });
    }

    for (const bad of ['5, 6, 999', '5, 6, 7, typo', '5, 6, 7, 6', '']) {
      await t.test(`refuses polygon hole ${JSON.stringify(bad)}`, async () => {
        const { page, mesher, outline, apply } = await open();
        try {
          await outline.fill('1; 2, 3 4');
          await page.getByTestId('ms-add-hole').click();
          await mesher.locator('.ms-hole select').selectOption('polygon');
          const hole = mesher.locator('.ms-hole input');
          await hole.fill(bad);
          await expect(apply).toBeDisabled();
          await expect(mesher.getByTestId('ms-input-error')).toContainText('Plate hole 1');
          assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
          const triangular = bad === '5, 6, 999';
          await hole.fill(triangular ? '5, 6, 7' : '5, 6, 7, 8');
          await apply.click();
          expect(await page.evaluate(() => window.mesherFixture.area())).toBeCloseTo(triangular ? 15.5 : 15, 9);
        } finally {
          await page.close();
        }
      });
    }

    await t.test('refuses a circle with a missing coordinate even after a valid polygon hole', async () => {
      const { page, mesher, outline, apply } = await open();
      try {
        await outline.fill('1, 2, 3, 4');
        await page.getByTestId('ms-add-hole').click();
        await mesher.locator('.ms-hole select').selectOption('polygon');
        await mesher.locator('.ms-hole input').fill('5, 6, 7, 8');
        await page.getByTestId('ms-add-hole').click();
        const center = page.getByTestId('ms-hole-center-1');
        await center.fill('3; 3;');
        await expect(apply).toBeDisabled();
        await expect(mesher.getByTestId('ms-input-error')).toContainText('Plate hole 2');
        assert.equal(await page.evaluate(() => window.mesherFixture.area()), 0);
        await center.fill('3; 3; 0');
        await expect(apply).toBeEnabled();
        await apply.click();
        const area = await page.evaluate(() => window.mesherFixture.area());
        assert.ok(area > 0 && area < 15);
      } finally {
        await page.close();
      }
    });
  });
});

test('production imports the IFC wall with its original mesh and fixed base', async (t) => {
  const server = await createServer({ root, mode: 'production', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  t.after(() => server.close());
  await server.listen();
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(new URL(fixture, server.resolvedUrls.local[0]).href);
  await expect(page.getByTestId('mesher')).toBeVisible();

  const wall = await page.evaluate(async () => {
    const { parseIfc } = await import('/src/lib/ifc/ifc-parser.ts');
    const { IFC_IMPORT_DEFAULTS, replaceWithIfcBuilding } = await import('/src/lib/ifc/ifc-import.ts');
    const { BUILDING_IFC } = await import('/src/lib/ifc/__tests__/building-ifc.ts');
    const { modelStore } = await import('/src/lib/store/index.ts');

    const read = await parseIfc(new TextEncoder().encode(BUILDING_IFC).buffer);
    const building = replaceWithIfcBuilding(read, IFC_IMPORT_DEFAULTS, 'Edificio');
    const group = [...modelStore.model.groups.values()].find(group => group.name === 'M1');
    const quads = group.members.quads ?? [];
    const plates = group.members.plates ?? [];
    const nodes = new Set([
      ...quads.flatMap(id => modelStore.quads.get(id).nodes),
      ...plates.flatMap(id => modelStore.plates.get(id).nodes),
    ]);
    const zOf = id => modelStore.nodes.get(id).z ?? 0;
    const zMin = Math.min(...[...nodes].map(zOf));
    const base = [...nodes].filter(id => Math.abs(zOf(id) - zMin) < 1e-6);
    const held = new Set([...modelStore.supports.values()].filter(support => support.type === 'fixed3d').map(support => support.nodeId));
    return {
      unified: window.mesherFixture.unified,
      skipped: building.skipped,
      quads: quads.length,
      triangles: plates.length,
      base: base.length,
      unsupported: base.filter(id => !held.has(id)),
    };
  });

  assert.deepEqual(wall, { unified: false, skipped: 0, quads: 18, triangles: 0, base: 7, unsupported: [] });
});

for (const unified of [false, true]) {
  test(`PRO mesher places circular outlines and holes in the user frame with unified plates ${unified}`, async (t) => {
    const production = { ...featuresForMode('production'), globalAxes: true, proPlatesUnified: unified };
    await withProductionFeatures(production, async configFile => {
      const server = await createServer({ root, configFile, mode: 'production', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
      await server.listen();
      try {
        const browser = await chromium.launch();
        try {
          const url = new URL(fixture, server.resolvedUrls.local[0]);
          async function openMesher(page, framed) {
            if (framed) {
              await page.addInitScript(() => localStorage.setItem('stabileo-axes', JSON.stringify({ up: '+Y', right: '+X', hand: 'right' })));
            }
            await page.goto(url.href);
            await expect(page.getByTestId('mesher')).toBeVisible();
            assert.equal(await page.evaluate(() => window.mesherFixture.unified), unified);
          }

          async function mesh({ framed, hole }) {
            const page = await browser.newPage();
            try {
              await openMesher(page, framed);
              if (hole) {
                await page.getByTestId('ms-outline').fill('1, 2, 3, 4');
                await page.getByTestId('ms-add-hole').click();
                await page.getByTestId('ms-hole-center-0').fill(framed ? '3; 0; -3' : '3; 3; 0');
              } else {
                await page.getByTestId('ms-circle').check();
                await page.getByTestId('ms-center').fill(framed ? '7; 2; -8' : '7; 8; 2');
              }
              const apply = page.getByTestId('ms-apply');
              await expect(apply).toBeEnabled();
              await apply.click();
              return await page.evaluate(async () => {
                const { modelStore } = await import('/src/lib/store/index.ts');
                return [...modelStore.quads.values(), ...modelStore.plates.values()].map(shell =>
                  shell.nodes.map(id => {
                    const { x, y, z } = modelStore.nodes.get(id);
                    return [x, y, z];
                  })
                );
              });
            } finally {
              await page.close();
            }
          }

          for (const hole of [false, true]) {
            await t.test(hole ? 'circular hole' : 'circular outline', async () => {
              const canonical = await mesh({ framed: false, hole });
              assert.ok(canonical.length > 0);
              if (!hole) assert.ok(canonical.flat().every(([, , z]) => z === 2));
              const transformed = await mesh({ framed: true, hole });
              assert.equal(JSON.stringify(transformed) === JSON.stringify(canonical), true, 'applied cell coordinates differ');
            });
          }

          if (unified) {
            await t.test('stores a user-frame offset on the whole plate and its replacement mesh', async () => {
              const page = await browser.newPage();
              try {
                await openMesher(page, true);
                await page.evaluate(() => window.mesherFixture.showPlateSpecifications());
                const spec = page.getByTestId('spec-surfaces');
                await spec.locator('select').first().selectOption('global');
                await spec.getByRole('textbox', { name: 'X', exact: true }).fill('0.1');
                await spec.getByRole('textbox', { name: 'Y', exact: true }).fill('0.2');
                await spec.getByRole('textbox', { name: 'Z', exact: true }).fill('-0.3');
                await spec.getByTestId('shell-offset-apply').click();
                const offsets = await page.evaluate(() => window.mesherFixture.remeshPlate(0.5));
                const canonical = { frame: 'global', x: 0.1, y: 0.3, z: 0.2 };
                assert.deepEqual(offsets.plate, canonical);
                assert.ok(offsets.shells.length > 0);
                for (const offset of offsets.shells) assert.deepEqual(offset, canonical);
              } finally {
                await page.close();
              }
            });
          }
        } finally {
          await browser.close();
        }
      } finally {
        await server.close();
      }
    });
  });
}

test('known wrong result: #1928 the released PRO panel keeps the unmeshed plate refusal after its toast closes', async t => {
  const server = await createServer({ root, mode: 'production', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  t.after(() => server.close());
  await server.listen();
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(new URL('/scripts/tests/fixtures/pro-solve-panel.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => typeof window.runPanelSolve === 'function');
  await page.evaluate(() => window.runPanelSolve());
  const toast = await page.waitForFunction(() => window.clearSolveToasts());
  const message = await toast.jsonValue();
  assert.match(message, /mesh/i);
  const banner = page.locator('.pro-solve-error');
  await expect(banner).toHaveText(message);
  await expect(banner.getByRole('button')).toHaveCount(0);
});
