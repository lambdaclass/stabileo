import fs from 'node:fs';
import path from 'node:path';

const lock = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const audit = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (audit.error || !audit.vulnerabilities) throw new Error('npm audit did not return a valid advisory report');
const shipped = new Set();
function visit(name, parent = '') {
  let base = parent;
  let key;
  for (;;) {
    key = path.posix.join(base, 'node_modules', name);
    if (lock.packages[key]) break;
    if (!base) return;
    base = base.includes('/node_modules/') ? base.slice(0, base.lastIndexOf('/node_modules/')) : '';
  }
  if (shipped.has(key)) return;
  shipped.add(key);
  const pkg = lock.packages[key];
  for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) visit(dependency, key);
}
const root = lock.packages[''];
for (const name of Object.keys({ ...root.dependencies, ...root.devDependencies })) {
  if (root.dependencies?.[name] || name.startsWith('@tauri-apps/')) visit(name);
}
const failures = Object.entries(audit.vulnerabilities).filter(([, advisory]) =>
  ['high', 'critical'].includes(advisory.severity) && advisory.nodes.some((node) => shipped.has(node)));
if (failures.length) {
  console.error(JSON.stringify(Object.fromEntries(failures), null, 2));
  process.exit(1);
}
console.log('No high/critical advisories in shipped web and Tauri dependencies');
