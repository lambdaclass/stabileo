import { parseAst } from 'rollup/parseAst';

export const measuredLocales = ['it', 'nl'];

function dictionaryLocale(id) {
  return id.match(/(?:\/i18n\/locales\/(?:[^/]+\/)*|virtual:(?:app|public)-i18n\/)(it|nl)(?:\.ts)?$/)?.[1];
}

function isData(node) {
  switch (node.type) {
    case 'Literal': return true;
    case 'TemplateLiteral': return !node.expressions.length;
    case 'ArrayExpression': return node.elements.every(item => item && isData(item));
    case 'ObjectExpression': return node.properties.every(p => p.type === 'Property' && !p.computed && isData(p.value));
    default: return false;
  }
}

export function localeBytes(code, moduleIds) {
  const owners = new Set(moduleIds.map(dictionaryLocale));
  const dictionary = owners.size === 1 ? [...owners][0] : undefined;
  const bytes = { it: 0, nl: 0 };
  if (!dictionary && !/\b(?:it|nl)["']?\s*:/.test(code)) return bytes;
  function visit(node, locale) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && !node.computed) {
      const key = node.key.name ?? node.key.value;
      const owner = locale ?? (measuredLocales.includes(key) ? key : undefined);
      if (owner && isData(node.value)) {
        bytes[owner] += Buffer.byteLength(code.slice(node.start, node.end));
        return;
      }
      visit(node.value, owner);
      return;
    }
    if (dictionary && node.type === 'VariableDeclarator' && node.init?.type === 'ObjectExpression') {
      visit(node.init, dictionary);
      return;
    }
    const nested = node.type === 'ObjectExpression' || node.type === 'ArrayExpression' ? locale : undefined;
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => visit(item, nested));
      else if (child && typeof child === 'object') visit(child, nested);
    }
  }
  visit(parseAst(code));
  return bytes;
}

export function publicDictionaryFootprint(chunks) {
  const sizes = chunks.map(({ bytes, localized }) =>
    bytes - measuredLocales.reduce((total, locale) => total + localized[locale], 0));
  let bytes = Math.max(0, ...sizes);
  const localized = {};
  for (const locale of measuredLocales) {
    chunks.forEach((chunk, index) => { sizes[index] += chunk.localized[locale]; });
    const next = Math.max(0, ...sizes);
    localized[locale] = next - bytes;
    bytes = next;
  }
  return { bytes, localized };
}
