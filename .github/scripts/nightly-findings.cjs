// Artifact data is never executed. This is the only nightly job with issue access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const canonical = x => Array.isArray(x) ? `[${x.map(canonical).join(',')}]` :
  x !== null && typeof x === 'object' ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}` : JSON.stringify(x);
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.isFile() && e.name.endsWith('.finding.json') ? [path.join(dir, e.name)] : []);
}
// Keep semantic qualifiers (e.g. tangent/effective stiffness) while removing
// instance identity, numeric values and solver/case wrappers.
function normalize(message) {
  return String(message)
    .replace(/^.*?original solved but transformed model failed:\s*/i, '')
    .replace(/failed to solve case\s+['"][^'"]+['"]:\s*/gi, '')
    .replace(/\b(node|element|member|support|case)\s+(?:['"][^'"]+['"]|[a-zA-Z_]*\d[\w.-]*)/gi, '$1 #')
    .replace(/[-+]?\b\d+(?:\.\d*)?(?:e[-+]?\d+)?\b/gi, '#')
    .replace(/#(?:\s*,\s*#)+/g, '#')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function causes(f) {
  const [check, analysis, relation] = f.test.split('/');
  const d = f.details;
  if (d?.worst?.length) {
    const analysis = d.analysis || f.model.analysis || 'static';
    return [...new Set(d.worst.map(w => `${w[0]}/${String(w[2]).replace(/step\d+/g, 'step#')}`))].sort().map(quantity => ({
      check, kind: d.status === 'mismatch' ? 'wrong-result-candidate' : d.status, message: `${analysis}: ${quantity}`,
      analysis, relation: 'unspecified'
    }));
  }
  const messages = Array.isArray(d) ? d : typeof d === 'string' ? [d] :
    d?.why || [d?.message || d?.status || analysis || 'failure'];
  return messages.map(raw => {
    const refusal = check === 'metamorphic' && /original solved but transformed model failed:/i.test(raw);
    const kind = refusal ? 'invariance-refusal' : check === 'metamorphic' || analysis === 'mismatch' ? 'wrong-result-candidate' : d?.status || analysis || 'failure';
    // Metamorphic tally prefixes every message with the model's case name.
    const message = normalize(check === 'metamorphic' && !/^original solved but transformed model failed:/i.test(raw) ? String(raw).replace(/^[^:]+:\s*/, '') : raw);
    return {check, kind, message, analysis: relation ? analysis : d?.analysis || 'unspecified', relation: relation || d?.relation || 'unspecified'};
  });
}
function size(f) {
  const m = f.model.solver || f.model;
  return ['nodes', 'elements', 'loads', 'supports'].reduce((n, field) => n + Object.keys(m[field] || {}).length, 0);
}
module.exports = async ({github, context, core}) => {
  const {owner, repo} = context.repo;
  const dry = process.env.FINDINGS_DRY_RUN !== 'false';
  const findings = new Map();
  for (const file of files('nightly-findings')) {
    const f = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof f.test !== 'string' || typeof f.command !== 'string' || f.seed === undefined || !f.model) throw Error(`Invalid finding: ${file}`);
    const modelHash = hash(canonical(f.model));
    for (const cause of causes(f)) {
      const key = hash(canonical([cause.check, cause.kind, cause.message]));
      if (!findings.has(key)) findings.set(key, {cause, hits: 0, analyses: new Map(), relations: new Map(), models: new Set()});
      const group = findings.get(key);
      group.hits++;
      for (const field of ['analysis', 'relation']) {
        const counts = group[field === 'analysis' ? 'analyses' : 'relations'];
        counts.set(cause[field], (counts.get(cause[field]) || 0) + 1);
      }
      group.models.add(f.original_model_hash || modelHash);
      if (!group.example || size(f) < size(group.example) ||
          (size(f) === size(group.example) && canonical(f.model).length < canonical(group.example.model).length)) {
        group.example = {...f, modelHash};
      }
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
  const issues = await github.paginate(github.rest.issues.listForRepo, {owner, repo, labels: 'nightly-finding', state: 'all', per_page: 100});
  const run = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  for (const [key, group] of findings) {
    const f = group.example;
    const {cause} = group;
    const labels = ['safety', 'nightly-finding', ...(['invariance-refusal', 'wrong-result-candidate'].includes(cause.kind) ? [cause.kind] : [])];
    const counts = values => [...values].sort().map(([name, count]) => `${name}: ${count}`).join(', ');
    const summary = `Check: **${cause.check}** · kind: **${cause.kind}**\n\nRoot cause: ${cause.message}\n\nThis run: **${group.hits} findings**, **${group.analyses.size} analyses**, **${group.relations.size} relations**, **${group.models.size} models**.\n\nAnalyses (hits): ${counts(group.analyses)}\n\nRelations (hits): ${counts(group.relations)}\n\nOne smallest available reproducer (reduction status below):`;
    const marker = `<!-- nightly-finding:${key} -->`;
    const occurrence = `<!-- nightly-run:${context.runId}:${process.env.GITHUB_RUN_ATTEMPT || '1'} -->`;
    const model = JSON.stringify(f.model, null, 2);
    // Large JSON remains complete in the artifact: never silently truncate it.
    const inline = model.length < 40000 ? `Save as model.json:\n\n\`\`\`json\n${model}\n\`\`\`` : `Model JSON exceeds the issue body limit; download the finding JSON from the [run artifacts](${run}) and save its model field as model.json.`;
    const body = `${marker}\n${occurrence}\n${summary}\n\nTest: **${f.test}**\n\nSeed: \`${f.seed}\` · model SHA-256: \`${f.modelHash}\`\n\n[Run and artifacts](${run}) · commit \`${context.sha}\`\n\nReduction: ${f.reduction}\n\nBuild/replay setup: [NIGHTLY.md](${context.serverUrl}/${owner}/${repo}/blob/${context.sha}/docs/verification/NIGHTLY.md).\n\n\`\`\`sh\n${f.command}\n\`\`\`\n\n${inline}\n\nDetails:\n\n\`\`\`text\n${JSON.stringify(f.details).slice(0, 4000)}\n\`\`\``;
    const existing = issues.find(i => !i.pull_request && i.body?.includes(marker));
    if (dry) { core.info(`[dry run] ${existing ? `update #${existing.number}` : 'create'} ${f.test}\n${body}`); continue; }
    if (existing) {
      const comments = await github.paginate(github.rest.issues.listComments, {owner, repo, issue_number: existing.number, per_page: 100});
      if (!existing.body.includes(occurrence) && !comments.some(c => c.body?.includes(occurrence))) {
        await github.rest.issues.createComment({owner, repo, issue_number: existing.number, body});
      }
      if (existing.state === 'closed') await github.rest.issues.update({owner, repo, issue_number: existing.number, state: 'open'});
    } else {
      const result = await github.rest.issues.create({owner, repo, title: `Nightly finding: ${cause.check}/${cause.kind}: ${cause.message} [${key.slice(0, 12)}]`.slice(0, 250), body, labels});
      issues.push(result.data);
    }
  }
};
