const crypto = require('node:crypto');

const FUZZ_ARTIFACT = /^(crash|timeout|oom|leak|slow-unit)-[0-9a-f]{12,64}(?:\.min)?$/i;
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
function canonical(x, numberSources) {
  const value = key => numberSources?.get(x)?.get(String(key)) ?? canonical(x[key], numberSources);
  if (Array.isArray(x)) return `[${x.map((_, index) => value(index)).join(',')}]`;
  if (x !== null && typeof x === 'object') {
    return `{${Object.keys(x).sort().map(key => `${JSON.stringify(key)}:${value(key)}`).join(',')}}`;
  }
  return JSON.stringify(x);
}
function stripWrappers(message) {
  return String(message)
    .replace(/^.*?original solved but transformed model failed:\s*/i, '')
    .replace(/failed to solve case\s+['"][^'"]+['"]:\s*/gi, '');
}
function normalize(message) {
  return stripWrappers(message)
    .replace(/\b((?:crash|timeout|oom|leak|slow-unit)-)[0-9a-f]{12,64}(?:\.min)?\b/gi, '$1#')
    .replace(/\b[0-9a-f]{32,128}\b/gi, '#')
    .replace(/\b(hash|sha(?:-?256)?|commit)([\s:=]+)[0-9a-f]{7,31}\b/gi, '$1$2#')
    .replace(/^(xz|xy|yz):\s*/i, 'plane: ')
    .replace(/\b(node|element|member|support|case)\s+(?:['"][^'"]+['"]|[a-zA-Z_]*\d[\w.-]*)/gi, '$1 #')
    .replace(/\b([ne])\d+\b/gi, '$1#')
    .replace(/\b([a-z]+_t)\d+\b/gi, '$1#')
    .replace(/\b(f|lambda|meff|h_re|h_im|mode|omega)\d+\b/gi, '$1#')
    .replace(/\b(d(?:r?[xyz])|r(?:r?[xyz]|w)|k(?:r?[xyz]|w))\b/gi, 'dof#')
    .replace(/\b(pinned|fixed|roller[xyz]|guided[xyz]|inclinedroller|spring)\b/gi, 'support#')
    .replace(/\b(?:anti|c2-)?symmetric\b/gi, 'symmetric')
    .replace(/[+-]?\b(?:nan|inf(?:inity)?)\b/gi, '#nonfinite')
    .replace(/(?<![\w.+-])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?\b/gi, '#')
    .replace(/#(?:\s*,\s*#)+/g, '#')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function legacyNormalize(message, ids = true) {
  let result = stripWrappers(message)
    .replace(/\b(node|element|member|support|case)\s+(?:['"][^'"]+['"]|[a-zA-Z_]*\d[\w.-]*)/gi, '$1 #');
  if (ids) result = result.replace(/\b([ne])\d+\b/g, '$1#');
  return result
    .replace(/[-+]?\b\d+(?:\.\d*)?(?:e[-+]?\d+)?\b/gi, '#')
    .replace(/#(?:\s*,\s*#)+/g, '#')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function fuzzInputHash(model) {
  const bytes = model.raw_hex;
  if (typeof bytes !== 'string') return null;
  const chunks = bytes.split(/[ \t\r\n\v\f]+/);
  if (chunks.some(chunk => chunk.length % 2 || /[^0-9a-f]/i.test(chunk))) return null;
  return hash(Buffer.from(chunks.join(''), 'hex'));
}

function isBareFuzzCrash(check, code, message) {
  return check === 'fuzz' && code === 'unspecified' && message === 'crash-#';
}

function signature(cause) {
  const check = [cause.check, cause.analysis || 'unspecified'];
  const message = [cause.code || 'unspecified', normalize(cause.message)];
  const identity = [check, cause.kind, message];
  if (isBareFuzzCrash(cause.check, ...message)) {
    if (!cause.replayInput) return null;
    identity.push(cause.replayInput);
  }
  return hash(canonical(identity));
}

function previousSignature(cause) {
  return hash(canonical([cause.check, cause.kind, cause.analysis, cause.code, cause.message]));
}

function legacySignatures(cause) {
  return cause.legacyInputs.flatMap(message => [message, String(message).slice(0, 200)].flatMap(input =>
    [hash(canonical([cause.check, cause.kind, String(input)])),
      ...[true, false].map(ids => hash(canonical([cause.check, cause.kind, legacyNormalize(input, ids)])))]));
}
function causes(f) {
  const [check, analysis, relation] = f.test.split('/');
  const d = f.details;
  const code = String(d?.code || d?.diagnostic?.code || d?.diagnostic_code || 'unspecified');
  if (d?.worst?.length) {
    const worstAnalysis = d.analysis || f.model.analysis || 'static';
    const kind = d.status === 'mismatch' ? 'wrong-result-candidate' : d.status;
    return [...new Set(d.worst.map(w => String(w[0])))].sort().map(quantity => ({
      check, kind, code, analysis: worstAnalysis, relation: 'unspecified', message: `${worstAnalysis}: ${quantity}`,
      legacyInputs: d.worst.filter(w => String(w[0]) === quantity).map(w =>
        `${worstAnalysis}: ${quantity}/${String(w[2]).replace(/step\d+/g, 'step#')}`)
    }));
  }
  const messages = Array.isArray(d) ? d : typeof d === 'string' ? [d] :
    Array.isArray(d?.why) ? d.why.filter(message => !/^(?:(?:opensees|reference) kappa=\S+|code_aster solves it \(NPREC=\d+ singularity check passed\))$/.test(message)) :
      d?.why ? [d.why] : [d?.message || d?.diagnostic?.message || d?.status || analysis || 'failure'];
  const fuzz = check === 'fuzz';
  const replayInput = fuzz ? fuzzInputHash(f.model) : null;
  return messages.map(raw => {
    const refusal = check === 'metamorphic' && /original solved but transformed model failed:/i.test(raw);
    const kind = refusal ? 'invariance-refusal' : check === 'metamorphic' || analysis === 'mismatch' ? 'wrong-result-candidate' : d?.status || analysis || 'failure';
    const input = check === 'metamorphic' && !/^original solved but transformed model failed:/i.test(raw) ? String(raw).replace(/^[^:]+:\s*/, '') : raw;
    const artifact = fuzz ? FUZZ_ARTIFACT.exec(String(input).trim()) : null;
    const message = normalize(input);
    const scopedFuzz = fuzz && (!artifact || isBareFuzzCrash(check, code, message) || code !== 'unspecified');
    return {check, kind, code, message, legacyInputs: scopedFuzz ? [] : [input], replayInput,
      analysis: scopedFuzz || relation ? analysis : d?.analysis || f.model.analysis || 'unspecified',
      relation: relation || d?.relation || 'unspecified'};
  });
}

function readDefect(issue) {
  const body = issue.body || '';
  const marker = /^<!-- nightly-defect:([0-9a-f]{64}) -->$/m.exec(body);
  if (marker) return marker[1];

  const title = issue.title || '';
  const titleParts = /^Nightly finding: ([^/]+)\/([^:]+): (.+?)(?: \[[0-9a-f]{12}\])?$/u.exec(title);
  const check = /^Check: \*\*([^*]+)\*\* · kind: \*\*([^*]+)\*\*(?: · diagnostic: \*\*([^*]+)\*\*)?/m.exec(body);
  const test = body.match(/^Test: \*\*([^*]+)\*\*$/m)?.[1];
  const model = body.match(/^Save as model\.json:\s+```json\n([\s\S]+?)\n```$/m)?.[1];
  const details = /^Details:\s+```text\n([\s\S]+?)\n```$/m.exec(body)?.[1];
  const root = body.match(/^Root cause: (.*)$/m)?.[1];
  if (check && test && details) {
    try {
      const analysis = body.match(/^Analyses \(hits\): ([^,\n]+): \d+/m)?.[1];
      const candidates = causes({test, model: model ? JSON.parse(model) : {analysis}, details: JSON.parse(details)});
      const matches = new Set(candidates.filter(cause => cause.check === check[1] && cause.kind === check[2] &&
        (cause.message.slice(0, 200) === normalize(root).slice(0, 200))).map(signature).filter(Boolean));
      if (matches.size === 1) return [...matches][0];
    } catch (error) {
      if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    }
  }
  if (check && root && root.length < 200) {
    const analysis = body.match(/^Analyses \(hits\): ([^,\n]+): \d+$/m)?.[1];
    if (analysis || check[1] === 'fuzz') {
      return signature({check: check[1], kind: check[2], code: check[3], analysis, message: root});
    }
  }
  const titleArtifact = titleParts?.[1] === 'fuzz' && FUZZ_ARTIFACT.exec(titleParts[3]);
  if (titleArtifact && ['timeout', 'oom', 'leak'].includes(titleArtifact[1].toLowerCase())) {
    return signature({check: titleParts[1], kind: titleParts[2], message: titleParts[3]});
  }
  return null;
}

module.exports = {canonical, causes, hash, legacySignatures, normalize, previousSignature, readDefect, signature};
