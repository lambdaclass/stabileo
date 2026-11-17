import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { build } from 'vite';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const hooks = {
  'ProNodesTab.svelte': `
    export function seed(scenario) { const values = scenario === 'zero' ? ['0','0','0'] : scenario === 'blankZ' ? ['2','3',''] : scenario === 'missingX' ? ['','3','4'] : scenario === 'invalidX' ? ['-','3','4'] : ['2','3','4']; rows = [...rows.filter(r => r.id !== null), { id: null, x: values[0], y: values[1], z: values[2], name: 'draft' }]; wX = 5; wY = 6; wZ = 7; }
    export function submit() { commitAll(); writeNode(); }
  `,
  'NodesTable.svelte': `export function submit() { addNode(); }`,
  'ProTransformPanel.svelte': `
    export function seed(m) { mode = m === 'custom' ? 'rotate' : m; d = [5, 0, 0]; point = [2, 3, 4]; axis = m === 'custom' ? 'custom' : 'Y'; axisCustom = [2, 3, 5]; showPreview = false; }
    export function physical() { return transforms(); }
  `,
  'ProConstraintsTab.svelte': `
    export function seed(scenario) { dMaster = '1'; dSlaves = '2'; dPlane = 'YZ'; rlMaster = '1'; rlSlave = '2'; rlDofs = [true,false,false,false,true,false]; eqMaster = '1'; eqSlave = '2'; eqDofs = [false,true,false,true,false,false]; ecMaster = '1'; ecSlave = '2'; ecOffsetX = 2; ecOffsetY = 3; ecOffsetZ = 5; ecReleases = [false,false,true,false,true,false]; mpcTerms = scenario === 'invalidMpc' ? '1:ux:2;2:rz:bad' : '1:ux:2;2:rz:-3'; }
    export function submit() { addDiaphragm(); addRigidLink(); addEqualDof(); addEccentricConnection(); addLinearMpc(); }
  `,
  'UnderlayRow.svelte': `
    export function seed() { pairs = [{fx:'0',fy:'0',tx:'2',ty:'3'}, {fx:'1',fy:'0',tx:'3',ty:'3'}]; }
    export function submit() { align(); }
  `,
  'ModalFigure.svelte': `export function timing(n) { loop.u = (n - 0.5) / SHOWN; return { freq, ratio: RATIO[mode - 1], mode }; }`,
};
const fixture = `
  import { mount, tick } from 'svelte';
  import Nodes from './src/components/pro/ProNodesTab.svelte';
  import Table from './src/components/tables/NodesTable.svelte';
  import Transform from './src/components/pro/ProTransformPanel.svelte';
  import Links from './src/components/pro/ProConstraintsTab.svelte';
  import Underlay from './src/components/pro/building/UnderlayRow.svelte';
  import Support from './src/components/pro/SupportDofFields.svelte';
  import Modal from './src/components/landing/hero/ModalFigure.svelte';
  import { modelStore, uiStore } from './src/lib/store';
  import { axesStore } from './src/lib/axes/axes.svelte';
  import { drawState } from './src/lib/store/draw-state.svelte';
  window.start = async (mode = 'move', space = true, scenario = 'complete') => {
    uiStore.analysisMode = space ? 'pro' : '2d'; uiStore.unitSystem = 'SI';
    modelStore.clear(); axesStore.reset();
    modelStore.addNode(0,0,...(space ? [0] : [])); modelStore.addNode(1,2,...(space ? [3] : []));
    const u = {id:'u',name:'u',z:0,segments:[0,0,1,0],dx:0,dy:0,rotationDeg:0,visible:true};
    modelStore.setUnderlays([u]);
    const host = id => { const el = document.createElement('div'); el.id = id; document.body.append(el); return el; };
    window.parts = {
      modal: mount(Modal,{target:host('modal'),props:{paused:true}}), nodes: mount(Nodes,{target:host('nodes')}), table: mount(Table,{target:host('table')}),
      transform: mount(Transform,{target:host('transform')}), links: mount(Links,{target:host('links')}),
      underlay: mount(Underlay,{target:host('underlay'),props:{u,levels:[]}}), support: mount(Support,{target:host('support')})
    };
    await tick();
    parts.nodes.seed(scenario); parts.transform.seed(mode); parts.links.seed(scenario); parts.underlay.seed();
    drawState.support.dofs = {tx:true,ty:false,tz:true,rx:false,ry:true,rz:false};
    drawState.support.elastic = true; drawState.support.springs = {kx:13,kz:17,kry:19};
    await tick();
  };
  window.change = async choice => { axesStore.choice = choice; await tick(); };
  window.physical = () => parts.transform.physical();
  window.submit = async () => {
    parts.table.submit(); parts.nodes.submit(); parts.links.submit(); parts.underlay.submit(); drawState.addSupportsAt([1]); await tick();
    return { nodes: [...modelStore.nodes.values()], links: modelStore.model.constraints, underlay: modelStore.underlays[0], supports: [...modelStore.supports.values()] };
  };
`;

async function bundle() {
  const built = await build({
    root, logLevel: 'silent',
    plugins: [{ name: 'bautista-round7-fixture', enforce: 'pre',
      resolveId(id) { if (id === 'bautista-round7-fixture') return '\0bautista-round7-fixture'; },
      load(id) {
        if (id === '\0bautista-round7-fixture') return fixture.replaceAll("from './src/", `from '${root}/src/`);
        const hook = hooks[id.split('/').at(-1)];
        if (hook) return readFileSync(id, 'utf8').replace('</script>', hook + '</script>');
      },
    }],
    build: {write:false, rollupOptions:{input:'bautista-round7-fixture'}},
  });
  const files = new Map(built.output.map(x => [x.fileName, x.type === 'chunk' ? x.code : x.source]));
  const entry = built.output.find(x => x.type === 'chunk' && x.isEntry).fileName;
  return {files,entry};
}

test('known wrong result: #2259 every pending draft retains its physical meaning after changing axes', async t => {
  const {files,entry} = await bundle();
  const browser = await chromium.launch({headless:true});
  try {
    async function open(mode, space, scenario) {
      const page = await browser.newPage();
      await page.route('http://draft.test/**', route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        return route.fulfill({contentType:path ? 'text/javascript' : 'text/html',body:path ? files.get(path) ?? '' : `<script type="module" src="/${entry}"></script>`});
      });
      await page.goto('http://draft.test/');
      await page.waitForFunction(() => !!window.start);
      await page.evaluate(([mode,space,scenario]) => window.start(mode,space,scenario),[mode,space,scenario]);
      const fields = page.locator('#table .add-row input');
      for (const [i,v] of (space ? [2,3,4] : [2,3]).entries()) {
        await fields.nth(i).fill(String(v));
        await fields.nth(i).dispatchEvent('change');
      }
      return page;
    }
    for (const space of [false,true]) for (const [mode,scenario] of [...['move','rotate','mirror','custom','repeat','polar'].map(m => [m,'complete']), ...['zero','blankZ','missingX','invalidX','invalidMpc'].map(s => ['move',s])]) {
      const baseline = await open(mode,space,scenario);
      const transform = await baseline.evaluate(() => window.physical());
      for (const n of [1,2,3]) await t.test(`mode ${n} timing`, async () => { const got = await baseline.evaluate(n => window.parts.modal.timing(n),n); assert.equal(got.mode,n); assert.equal(got.freq,0.75 * got.ratio); });
      const expected = await baseline.evaluate(() => window.submit());
      await baseline.close();
      for (const choice of [
        {up:'+Z',right:'+X',hand:'right'},
        {up:'+Y',right:'+X',hand:'right'},
        {up:'-Y',right:'-Z',hand:'left'},
        {up:'+Z',right:'-X',hand:'right'},
      ]) {
        const page = await open(mode,space,scenario);
        await page.evaluate(c => window.change(c),choice);
        const actualTransform = await page.evaluate(() => window.physical());
        const actual = await page.evaluate(() => window.submit());
        for (const key of ['nodes','links','underlay','supports']) await t.test(`${space ? '3D' : '2D'} ${mode} ${scenario} ${JSON.stringify(choice)} ${key}`, () => assert.deepEqual(actual[key],expected[key]));
        await t.test(`${space ? '3D' : '2D'} ${mode} ${scenario} ${JSON.stringify(choice)} transform`, () => assert.deepEqual(actualTransform,transform));
        await page.close();
      }
    }
  } finally { await browser.close(); }
});
