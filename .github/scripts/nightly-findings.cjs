const fs = require('node:fs');
const ASSIGNEES = require('./issue-assignees.cjs');
const path = require('node:path');
const {gzipSync} = require('node:zlib');
const {canonical, causes, hash, legacySignatures, previousSignature, readDefect, signature} = require('./nightly-defects.cjs');

const ADOPTED = '<!-- nightly-finding-adopted -->';
const MAX_SIGHTING_COMMENTS = 5;
const OVERFLOW = /^<!-- nightly-sightings:(\d+):(\d+):(\d+) -->\n[^\n]*\n(?:<!-- nightly-reproducer:v1 [A-Za-z0-9+/=]+ -->\n)?/m;
const REPLAY_STATE = /^<!-- nightly-replay:v1 \{[^\n]*\} -->\n?/m;
const DUPLICATE = /^<!-- nightly-duplicate:\d+ -->$/m;
const LEGACY_KEY = /^<!-- nightly-finding:([0-9a-f]{64}) -->$/m;
const CURRENT_KEY = /^<!-- nightly-defect:([0-9a-f]{64}) -->$/m;
const OCCURRENCE = /^<!-- nightly-run:\d+:\d+ -->$/m;

function encodeReproducers(examples, cause, runId, referencesOnly = false) {
  const entries = [...examples.values()].map(f => {
    const {test, artifact, reduction, modelHash, file, artifactHash} = f;
    const entry = {test, seed: String(f.seed), kind: cause.kind, message: cause.message, reduction,
      modelHash, path: file, runId: String(runId), artifactHash};
    return !referencesOnly && artifact.length <= 2_000_000 ? {...entry, artifact} : entry;
  });
  const encode = data => gzipSync(JSON.stringify(data)).toString('base64');
  let payload = encode(entries);
  if (payload.length > 16_000 || entries.reduce((size, entry) => size + JSON.stringify(entry).length, 0) > 3_000_000) {
    payload = encode(entries.map(({artifact, ...ref}) => ref));
  }
  return "<!-- nightly-reproducer:v1 " + payload + " -->";
}

function matchingIssue(issues, key, group, reserved) {
  for (const state of ['open', 'closed']) {
    const matching = issues.filter(i => i.state === state);
    const exact = matching.find(i => i.currentKey === key || (!i.currentKey && group.previousKeys.has(i.oldKey)));
    const inferred = matching.find(i => i.defect === key);
    const legacy = matching.find(i => i.defect === null && !i.adopted && !reserved.has(i.number) && group.legacyKeys.has(i.oldKey));
    if (exact || inferred || legacy) return exact || inferred || legacy;
  }
}

function readIssue(issue) {
  const body = issue.body || '';
  return {...issue, defect: readDefect(issue), oldKey: LEGACY_KEY.exec(body)?.[1],
    currentKey: CURRENT_KEY.exec(body)?.[1], adopted: new Set(body.split('\n')).has(ADOPTED)};
}

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.isFile() && e.name.endsWith('.finding.json') ? [path.join(dir, e.name)] : []);
}
function size(f) {
  const m = f.model.solver || f.model;
  return ['nodes', 'elements', 'loads', 'supports'].reduce((n, field) => n + Object.keys(m[field] || {}).length, 0);
}
module.exports = async ({github, context, core}) => {
  const {owner, repo} = context.repo;
  const dry = process.env.FINDINGS_DRY_RUN !== 'false';
  const findings = new Map();
  for (const file of files('nightly-findings').sort()) {
    const artifact = fs.readFileSync(file, 'utf8');
    const exactSeeds = new WeakMap();
    let hasLargeInteger = false;
    const data = JSON.parse(artifact, function (key, value, context) {
      if (typeof value === 'number' && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source)) {
        hasLargeInteger = true;
        if (key === 'seed') exactSeeds.set(this, context.source);
      }
      return value;
    });
    const f = {...data, seed: exactSeeds.get(data) ?? data?.seed, file, artifact, artifactHash: hash(artifact), hasLargeInteger};
    if (typeof f.test !== 'string' || typeof f.command !== 'string' || f.seed === undefined || !f.model) throw Error(`Invalid finding: ${file}`);
    if (f.test.endsWith('/dumped_failure')) continue;
    const modelHash = hash(canonical(f.model));
    const fileSignatures = new Set();
    for (const cause of causes(f)) {
      const key = signature(cause);
      if (!findings.has(key)) findings.set(key, {cause, hits: 0, analyses: new Map(), relations: new Map(), models: new Set(), legacyKeys: new Set(), previousKeys: new Set(), examples: new Map()});
      const group = findings.get(key);
      group.previousKeys.add(previousSignature(cause));
      for (const legacyKey of legacySignatures(cause)) group.legacyKeys.add(legacyKey);
      if (fileSignatures.has(key)) continue;
      fileSignatures.add(key);
      group.hits++;
      for (const field of ['analysis', 'relation']) {
        const counts = group[field === 'analysis' ? 'analyses' : 'relations'];
        counts.set(cause[field], (counts.get(cause[field]) || 0) + 1);
      }
      group.models.add(f.original_model_hash || modelHash);
      const smallerThan = example => !example || size(f) < size(example) ||
        (size(f) === size(example) && canonical(f.model).length < canonical(example.model).length);
      const example = {...f, modelHash};
      if (smallerThan(group.example)) group.example = example;
      if (smallerThan(group.examples.get(f.test))) group.examples.set(f.test, example);
    }
  }
  if (!findings.size) { core.info('No structured numerical findings; see job logs for infrastructure failures.'); return; }
  if (!dry) for (const name of new Set(['safety', 'nightly-finding', ...[...findings.values()].map(g => g.cause.kind).filter(k => ['invariance-refusal', 'wrong-result-candidate'].includes(k))])) {
    try { await github.rest.issues.getLabel({owner, repo, name}); }
    catch (e) {
      if (e.status !== 404) throw e;
      await github.rest.issues.createLabel({owner, repo, name, color: 'b60205'});
    }
  }
  const issues = (await github.paginate(github.rest.issues.listForRepo, {owner, repo, labels: 'nightly-finding', state: 'all', per_page: 100}))
    .filter(i => !i.pull_request && !DUPLICATE.exec(i.body || ''))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.number - b.number)
    .map(readIssue);
  const claimedIssues = new Set();
  const exactKeys = new Set([...findings.values()].flatMap(group => [...group.previousKeys]));
  for (const i of issues) {
    if (findings.has(i.defect) || (!i.currentKey && exactKeys.has(i.oldKey))) claimedIssues.add(i.number);
  }
  const runId = String(context.runId);
  const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
  const run = `${context.serverUrl}/${owner}/${repo}/actions/runs/${runId}`;
  for (const [key, group] of findings) {
    const f = group.example;
    const {cause} = group;
    const labels = ['safety', 'nightly-finding', ...(['invariance-refusal', 'wrong-result-candidate'].includes(cause.kind) ? [cause.kind] : [])];
    const counts = values => [...values].sort().map(([name, count]) => `${name}: ${count}`).join(', ');
    const diagnostic = cause.code === 'unspecified' ? '' : ` · diagnostic: **${cause.code}**`;
    const summary = `Check: **${cause.check}** · kind: **${cause.kind}**${diagnostic}\n\nRoot cause: ${cause.message.slice(0, 200)}\n\nThis run: **${group.hits} findings**, **${group.analyses.size} analyses**, **${group.relations.size} relations**, **${group.models.size} models**.\n\nAnalyses (hits): ${counts(group.analyses)}\n\nRelations (hits): ${counts(group.relations)}\n\nOne smallest available reproducer (reduction status below):`;
    const marker = `<!-- nightly-defect:${key} -->`;
    const records = encodeReproducers(group.examples, cause, context.runId);
    const occurrence = `<!-- nightly-run:${runId}:${attempt} -->`;
    const model = JSON.stringify(f.model, null, 2);
    const inline = !f.hasLargeInteger && Buffer.byteLength(model) < 23000 ? `Save as model.json:\n\n\`\`\`json\n${model}\n\`\`\`` : `Download the exact finding JSON from the [run artifacts](${run}) and save its model field as model.json.`;
    const body = `${marker}\n<!-- nightly-finding:${key} -->\n${records}\n${occurrence}\n${summary}\n\nTest: **${f.test}**\n\nSeed: \`${f.seed}\` · model SHA-256: \`${f.modelHash}\`\n\nReproducer path: \`${f.file}\`\n\n[Run and artifacts](${run}) · commit \`${context.sha}\`\n\nReduction: ${f.reduction}\n\nBuild/replay setup: [NIGHTLY.md](${context.serverUrl}/${owner}/${repo}/blob/${context.sha}/testing/docs/NIGHTLY.md).\n\n\`\`\`sh\n${f.command}\n\`\`\`\n\n${inline}\n\nDetails:\n\n\`\`\`text\n${JSON.stringify(f.details).slice(0, 4000)}\n\`\`\``;
    const existing = matchingIssue(issues, key, group, claimedIssues);
    if (existing) claimedIssues.add(existing.number);
    if (dry) { core.info("[dry run] " + (existing ? "update #" + existing.number : "create") + " " + f.test + "\n" + body); continue; }
    if (existing) {
      const issue_number = existing.number;
      const comments = await github.paginate(github.rest.issues.listComments, {owner, repo, issue_number, per_page: 100});
      const oldBody = existing.body || '';
      const overflow = OVERFLOW.exec(oldBody);
      const alreadyCounted = overflow?.[2] === runId && overflow[3] === attempt;
      const reporterComments = comments.filter(c => c.user?.login === 'github-actions[bot]');
      let nextBody = oldBody;
      const priorSightings = [oldBody, ...reporterComments.map(c => c.body || '')].map(body => OCCURRENCE.exec(body)?.[0]);
      if (!alreadyCounted && !new Set(priorSightings).has(occurrence)) {
        const sightings = priorSightings.slice(1).filter(Boolean);
        if (sightings.length < MAX_SIGHTING_COMMENTS) {
          await github.rest.issues.createComment({owner, repo, issue_number, body});
        } else {
          const total = Number(overflow?.[1] || 0) + group.hits;
          const header = `<!-- nightly-sightings:${total}:${runId}:${attempt} -->\n` +
            `${total} additional sighting${total === 1 ? '' : 's'} after the detailed comment limit. [Latest run](${run}). ` +
            'Automatic closure is blocked because overflow reproducers are outstanding.\n';
          const replaceSummary = records => overflow ? oldBody.replace(OVERFLOW, () => header + records + '\n') :
            header + records + '\n\n' + oldBody;
          nextBody = replaceSummary(records);
          if (Buffer.byteLength(nextBody) > 64_000) {
            nextBody = replaceSummary(encodeReproducers(group.examples, cause, context.runId, true));
          }
        }
      }
      if (existing.state === 'closed') nextBody = nextBody.replace(REPLAY_STATE, '');
      if (!existing.currentKey) nextBody = marker + "\n" + ADOPTED + "\n" + nextBody;
      if (nextBody !== oldBody) {
        await github.rest.issues.update({owner, repo, issue_number, body: nextBody});
        Object.assign(existing, readIssue({...existing, body: nextBody}));
      }
      if (existing.state === 'closed') await github.rest.issues.update({owner, repo, issue_number, state: 'open'});
    } else {
      const result = await github.rest.issues.create({owner, repo, title: `Nightly finding: ${cause.check}/${cause.kind}: ${cause.message} [${key.slice(0, 12)}]`.slice(0, 250), body, labels, assignees: [...ASSIGNEES]});
      issues.push(readIssue(result.data));
    }
  }
};
