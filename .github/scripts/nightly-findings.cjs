const fs = require('node:fs');
const ASSIGNEES = require('./issue-assignees.cjs');
const path = require('node:path');
const {gzipSync} = require('node:zlib');
const {canonical, causes, hash, legacySignatures, previousSignature, readDefect, signature} = require('./nightly-defects.cjs');

const ADOPTED = '<!-- nightly-finding-adopted -->';
const MAX_SIGHTING_COMMENTS = 5;
const MAX_BODY_BYTES = 64_000;
const MAX_PAYLOAD_LENGTH = 16_000;
const MAX_INLINE_BYTES = 3_000_000;
const MAX_MANIFEST_BYTES = 4_000_000;
const MANIFEST_DIRECTORY = 'nightly-replay-manifests';
const OVERFLOW_COMPLETE = '<!-- nightly-overflow-complete -->';
const OVERFLOW = /^<!-- nightly-sightings:(\d+):(\d+):(\d+) -->\n[^\n]*\n(?:<!-- nightly-overflow-complete -->\n)?(?:<!-- nightly-reproducer:(?:v1 [A-Za-z0-9+/=]+|v[23] \d+ \d+ [0-9a-f]{64}) -->\n)?/m;
const REPLAY_STATE = /^<!-- nightly-replay:v1 \{[^\n]*\} -->\n?/m;
const DUPLICATE = /^<!-- nightly-duplicate:\d+ -->$/m;
const LEGACY_KEY = /^<!-- nightly-finding:([0-9a-f]{64}) -->$/m;
const CURRENT_KEY = /^<!-- nightly-defect:([0-9a-f]{64}) -->$/m;
const OCCURRENCE = /^<!-- nightly-run:\d+:\d+ -->$/m;

function encodeReproducers(group, runId, attempt) {
  const examples = [...group.examples.values()];
  const references = examples.map(f => ({
    test: f.test, seed: String(f.seed), kind: group.cause.kind, message: group.cause.message, reduction: f.reduction,
    modelHash: f.modelHash, path: f.file, runId, artifactHash: f.artifactHash
  }));
  const compact = JSON.stringify(references);
  const artifacts = examples.map(({artifact}) => Buffer.byteLength(artifact) <= 2_000_000 ? artifact : null);
  const compactBytes = Buffer.byteLength(compact);
  const embeddedBytes = artifacts.reduce((size, artifact) => size + (artifact ? Buffer.byteLength(artifact) : 0), compactBytes);
  const contents = embeddedBytes <= MAX_INLINE_BYTES ?
    [JSON.stringify(references.map((reference, index) => artifacts[index] ? {...reference, artifact: artifacts[index]} : reference)), compact] :
    [compact];
  for (const content of contents) {
    if (Buffer.byteLength(content) > MAX_INLINE_BYTES) continue;
    const payload = gzipSync(content).toString('base64');
    if (payload.length <= MAX_PAYLOAD_LENGTH) return {marker: '<!-- nightly-reproducer:v1 ' + payload + ' -->'};
  }
  const files = new Map();
  const write = content => {
    if (Buffer.byteLength(content) > MAX_MANIFEST_BYTES) throw Error('Nightly replay manifest file exceeds the replay limit');
    const digest = hash(content);
    files.set(path.join(MANIFEST_DIRECTORY, digest + '.json'), content);
    return digest;
  };
  let version = 'v2';
  let digest;
  if (compactBytes <= MAX_MANIFEST_BYTES) {
    digest = write(compact);
  } else {
    version = 'v3';
    const chunks = [];
    let records = [];
    let bytes = 2;
    for (const reference of references) {
      const record = JSON.stringify(reference);
      const length = Buffer.byteLength(record);
      if (records.length && bytes + 1 + length > MAX_MANIFEST_BYTES) {
        chunks.push(write('[' + records.join(',') + ']'));
        records = [];
        bytes = 2;
      }
      bytes += length + (records.length ? 1 : 0);
      records.push(record);
    }
    chunks.push(write('[' + records.join(',') + ']'));
    digest = write(JSON.stringify({chunks}));
  }
  return {marker: '<!-- nightly-reproducer:' + [version, runId, attempt, digest].join(' ') + ' -->', files};
}

function persistManifests(batches, {prepareManifests, manifestArtifactId, dry}) {
  const files = new Map([...batches.values()].flatMap(batch => [...(batch.files || [])]));
  if (prepareManifests && files.size) {
    fs.mkdirSync(MANIFEST_DIRECTORY, {recursive: true});
    for (const [file, content] of files) fs.writeFileSync(file, content);
  } else if (!prepareManifests && !dry) {
    for (const [file, content] of files) {
      if (!/^\d+$/.test(manifestArtifactId || '') || !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
        throw Error('Nightly replay manifest upload is required for ' + file);
      }
    }
  }
  return files.size > 0;
}

function display(value, limit) {
  const text = String(value);
  return text.length <= limit ? text : text.slice(0, limit) + '…';
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
module.exports = async ({github, context, core, prepareManifests = false, manifestArtifactId}) => {
  const {owner, repo} = context.repo;
  const dry = process.env.FINDINGS_DRY_RUN !== 'false';
  const findings = new Map();
  for (const file of files('nightly-findings').sort()) {
    const artifact = fs.readFileSync(file, 'utf8');
    const exactSeeds = new WeakMap();
    const numberSources = new WeakMap();
    let hasLargeInteger = false;
    const data = JSON.parse(artifact, function (key, value, context) {
      if (typeof value === 'number') {
        if (context.source !== JSON.stringify(value)) {
          if (!numberSources.has(this)) numberSources.set(this, new Map());
          numberSources.get(this).set(key, context.source);
        }
        if (!Number.isSafeInteger(value) && /^-?\d+$/.test(context.source)) {
          hasLargeInteger = true;
          if (key === 'seed') exactSeeds.set(this, context.source);
        }
      }
      return value;
    });
    const f = {...data, seed: exactSeeds.get(data) ?? data?.seed, file, artifact, artifactHash: hash(artifact), hasLargeInteger};
    if (typeof f.test !== 'string' || typeof f.command !== 'string' || f.seed === undefined || !f.model) throw Error(`Invalid finding: ${file}`);
    if (f.test.endsWith('/dumped_failure')) continue;
    const modelHash = hash(canonical(f.model, numberSources));
    const fileSignatures = new Set();
    for (const cause of causes(f)) {
      const key = signature(cause);
      if (key === null) throw Error(`Invalid crash input: ${file}`);
      if (!findings.has(key)) findings.set(key, {cause, hits: 0, analyses: new Map(), relations: new Map(), models: new Set(), legacyKeys: new Set(), previousKeys: new Set(), examples: new Map()});
      const group = findings.get(key);
      if (cause.legacyInputs.length) group.previousKeys.add(previousSignature(cause));
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
      const selector = cause.replayInput ? canonical([f.test, cause.replayInput]) :
        canonical([f.test, modelHash, String(f.seed)]);
      if (smallerThan(group.examples.get(selector))) group.examples.set(selector, example);
    }
  }
  const runId = String(context.runId);
  const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
  const batches = new Map([...findings].map(([key, group]) => [key, encodeReproducers(group, runId, attempt)]));
  const manifestNeeded = persistManifests(batches, {prepareManifests, manifestArtifactId, dry});
  if (prepareManifests) return manifestNeeded;
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
  const run = `${context.serverUrl}/${owner}/${repo}/actions/runs/${runId}`;
  for (const [key, group] of findings) {
    const f = group.example;
    const {cause} = group;
    const labels = ['safety', 'nightly-finding', ...(['invariance-refusal', 'wrong-result-candidate'].includes(cause.kind) ? [cause.kind] : [])];
    const counts = values => display([...values].sort().map(([name, count]) => `${name}: ${count}`).join(', '), 1_000);
    const diagnostic = cause.code === 'unspecified' ? '' : ` · diagnostic: **${display(cause.code, 200)}**`;
    const summary = `Check: **${display(cause.check, 200)}** · kind: **${display(cause.kind, 200)}**${diagnostic}\n\nRoot cause: ${cause.message.slice(0, 200)}\n\nThis run: **${group.hits} findings**, **${group.analyses.size} analyses**, **${group.relations.size} relations**, **${group.models.size} models**.\n\nAnalyses (hits): ${counts(group.analyses)}\n\nRelations (hits): ${counts(group.relations)}\n\nOne smallest available reproducer (reduction status below):`;
    const marker = `<!-- nightly-defect:${key} -->`;
    const records = batches.get(key).marker;
    const occurrence = `<!-- nightly-run:${runId}:${attempt} -->`;
    const model = JSON.stringify(f.model, null, 2);
    const inline = !f.hasLargeInteger && Buffer.byteLength(model) < 23000 ? `Save as model.json:\n\n\`\`\`json\n${model}\n\`\`\`` : `Download the exact finding JSON from the [run artifacts](${run}) and save its model field as model.json.`;
    const recordHeader = `${marker}\n<!-- nightly-finding:${key} -->\n${records}\n${occurrence}\n`;
    const detailedBody = `${recordHeader}${summary}\n\nTest: **${display(f.test, 500)}**\n\nSeed: \`${f.seed}\` · model SHA-256: \`${f.modelHash}\`\n\nReproducer path: \`${f.file}\`\n\n[Run and artifacts](${run}) · commit \`${context.sha}\`\n\nReduction: ${display(f.reduction, 1_000)}\n\nBuild/replay setup: [NIGHTLY.md](${context.serverUrl}/${owner}/${repo}/blob/${context.sha}/testing/docs/NIGHTLY.md).\n\n\`\`\`sh\n${display(f.command, 1_000)}\n\`\`\`\n\n${inline}\n\nDetails:\n\n\`\`\`text\n${display(JSON.stringify(f.details), 4_000)}\n\`\`\``;
    const body = Buffer.byteLength(detailedBody) <= MAX_BODY_BYTES ? detailedBody :
      recordHeader + `${summary}\n\n[Exact findings and reproducer commands](${run})`;
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
        if (!overflow && sightings.length < MAX_SIGHTING_COMMENTS) {
          await github.rest.issues.createComment({owner, repo, issue_number, body});
        } else {
          const total = Number(overflow?.[1] || 0) + group.hits;
          const header = `<!-- nightly-sightings:${total}:${runId}:${attempt} -->\n` +
            `${total} additional sighting${total === 1 ? '' : 's'} after the detailed comment limit. [Latest run](${run}). ` +
            (overflow ? 'Automatic closure is blocked because overflow reproducers are outstanding.\n' :
              'The first overflow batch is retained for replay.\n' + OVERFLOW_COMPLETE + '\n');
          const saved = header + records + '\n';
          const candidate = overflow ? oldBody.replace(OVERFLOW, () => saved) : saved + '\n' + oldBody;
          if (Buffer.byteLength(candidate) <= MAX_BODY_BYTES) {
            nextBody = candidate;
          } else {
            const evidence = recordHeader + `[Overflow replay inputs](${run})`;
            await github.rest.issues.createComment({owner, repo, issue_number, body: evidence});
          }
        }
      }
      if (existing.state === 'closed') nextBody = nextBody.replace(REPLAY_STATE, '');
      if (!existing.currentKey) {
        const adopted = marker + "\n" + ADOPTED + "\n" + nextBody;
        if (Buffer.byteLength(adopted) <= MAX_BODY_BYTES) nextBody = adopted;
      }
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
