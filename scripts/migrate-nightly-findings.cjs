const fs = require('node:fs');
const {readDefect} = require('../.github/scripts/nightly-defects.cjs');

function planMigration(issues) {
  const groups = new Map();
  const unresolved = [];
  const open = issues.filter(i => !i.pull_request && (i.state || 'open').toLowerCase() === 'open' &&
    (!i.labels || i.labels.some(label => (label.name || label) === 'nightly-finding')));
  open.sort((a, b) => {
    const first = a.created_at || a.createdAt;
    const second = b.created_at || b.createdAt;
    return first && second ? first.localeCompare(second) || a.number - b.number : a.number - b.number;
  });
  for (const issue of open) {
    const signature = readDefect(issue);
    if (!signature) {
      unresolved.push(issue.number);
      continue;
    }
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(issue.number);
  }
  const duplicates = [...groups].filter(([, numbers]) => numbers.length > 1)
    .map(([signature, [keep, ...close]]) => ({signature, keep, close}));
  return {dryRun: true, duplicates, unresolved};
}

if (require.main === module) {
  const [file = '-', ...extra] = process.argv.slice(2);
  if (extra.length || (file.startsWith('-') && file !== '-')) {
    throw Error('Usage: node scripts/migrate-nightly-findings.cjs [open-issues.json|-]');
  }
  const input = JSON.parse(fs.readFileSync(file === '-' ? 0 : file, 'utf8'));
  const plan = planMigration(input.flat());
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
}

module.exports = {planMigration};
