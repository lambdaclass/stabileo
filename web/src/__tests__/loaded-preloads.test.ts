import { expect, it } from 'vitest';
import { loadedPreloads } from '../../scripts/loaded-preloads';

it('omits only the importing module and its already-loaded static JS closure', () => {
  const { plugin, resolveDependencies } = loadedPreloads();
  const collect = plugin.generateBundle;
  if (typeof collect !== 'function') throw new Error('missing graph collector');
  // Rollup supplies other fields; the collector only reads type, fileName and imports.
  Reflect.apply(collect, {}, [{}, {
    host: { type: 'chunk', fileName: 'host.js', imports: ['shared.js'] },
    shared: { type: 'chunk', fileName: 'shared.js', imports: ['cycle.js'] },
    cycle: { type: 'chunk', fileName: 'cycle.js', imports: ['shared.js'] },
    next: { type: 'chunk', fileName: 'next.js', imports: ['new.js'] },
  }]);
  const deps = ['next.js', 'new.js', 'host.js', 'shared.js', 'cycle.js', 'shared.css', 'next.css'];
  expect(resolveDependencies('next.js', deps, { hostId: 'host.js', hostType: 'js' }))
    .toEqual(['next.js', 'new.js', 'shared.css', 'next.css']);
  expect(resolveDependencies('next.js', deps, { hostId: 'index.html', hostType: 'html' })).toEqual(deps);
  expect(resolveDependencies('next.js', deps, { hostId: 'unknown.js', hostType: 'js' })).toEqual(deps);
});
