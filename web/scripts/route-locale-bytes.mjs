import { parseAst } from 'rollup/parseAst';

export const measuredLocales = ['it', 'nl'];
const tableKeys = new Set(['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'it', 'zh', 'nl']);

function dictionaryLocale(id) {
  return id.match(/(?:\/i18n\/locales\/(?:[^/]+\/)*|virtual:(?:app|public)-i18n\/)(it|nl)(?:\.ts)?$/)?.[1];
}

function propertyName(property) {
  if (property.type === 'Property' && !property.computed) return property.key.name ?? property.key.value;
}

export function localeBytes(code, moduleIds) {
  const owners = new Set(moduleIds.map(dictionaryLocale));
  const dedicated = owners.size === 1 ? [...owners][0] : undefined;
  const bytes = { it: 0, nl: 0 };
  if (!dedicated && !/\b(?:it|nl)\b/.test(code)) return bytes;
  const program = parseAst(code);
  const bindings = new Map();
  const dataReferences = new Set();
  const exported = new Set();
  for (const statement of program.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const variable of declaration.declarations) {
      if (variable.id.type !== 'Identifier') continue;
      bindings.set(variable.id.name, variable.init);
      dataReferences.add(variable.id.start);
      if (statement.type === 'ExportNamedDeclaration') exported.add(variable.id.name);
    }
  }
  const literals = new Map();
  const resolved = new Map();
  function attribute(node, locale, resolve) {
    if (!node) return;
    if (node.type === 'Identifier' && resolve) {
      dataReferences.add(node.start);
      if (!resolved.has(locale)) resolved.set(locale, new Set());
      if (resolved.get(locale).has(node.name)) return;
      resolved.get(locale).add(node.name);
      return attribute(bindings.get(node.name), locale, true);
    }
    if (node.type === 'ObjectExpression') {
      for (const field of node.properties) {
        if (field.type === 'SpreadElement') attribute(field.argument, locale, resolve);
        else if (propertyName(field) !== undefined) attribute(field.value, locale, resolve);
      }
    } else if (node.type === 'ArrayExpression') {
      for (const item of node.elements) attribute(item, locale, resolve);
    } else if ((node.type === 'Literal' && typeof node.value === 'string') || (node.type === 'TemplateLiteral' && !node.expressions.length)) {
      if (!literals.has(node)) literals.set(node, new Set());
      literals.get(node).add(locale);
    }
  }
  function visit(node, moduleScope) {
    if (!node?.type) return;
    if (node.type === 'ObjectExpression') {
      const keys = node.properties.map(propertyName);
      if (keys.includes('en') && keys.some(key => measuredLocales.includes(key)) && keys.every(key => tableKeys.has(key))) {
        for (const field of node.properties) attribute(field.value, propertyName(field), moduleScope);
        return;
      }
    }
    const sameScope = moduleScope && !['BlockStatement', 'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassBody'].includes(node.type);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => visit(item, sameScope));
      else if (child?.type) visit(child, sameScope);
    }
  }
  if (dedicated) {
    for (const statement of program.body) {
      if (statement.type === 'ExportDefaultDeclaration') attribute(statement.declaration, dedicated, true);
      if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
        for (const specifier of statement.specifiers) attribute(specifier.local, dedicated, true);
        for (const variable of statement.declaration?.declarations ?? []) attribute(variable.init, dedicated, true);
      }
    }
  } else {
    visit(program, true);
  }
  const attributed = new Set([...resolved.values()].flatMap(names => [...names]));
  function checkUse(node) {
    if (!node?.type) return;
    if (node.type === 'Identifier' && attributed.has(node.name) && !dataReferences.has(node.start)) {
      attribute(bindings.get(node.name), 'shared', true);
    }
    if (node.type === 'Property' && !node.computed) return checkUse(node.value);
    if (node.type === 'MemberExpression' && !node.computed) return checkUse(node.object);
    if (node.type === 'ExportSpecifier') return checkUse(node.local);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(checkUse);
      else if (child?.type) checkUse(child);
    }
  }
  checkUse(program);
  if (!dedicated) for (const name of exported) {
    if (attributed.has(name)) attribute(bindings.get(name), 'shared', true);
  }
  for (const [node, langs] of literals) {
    if (langs.size !== 1) continue;
    const [lang] = langs;
    if (measuredLocales.includes(lang)) bytes[lang] += Buffer.byteLength(code.slice(node.start, node.end));
  }
  return bytes;
}

export function publicDictionaryFootprint(chunks) {
  const alternatives = chunks.map(({ bytes, localized }) => ({
    shared: bytes - measuredLocales.reduce((sum, locale) => sum + localized[locale], 0), bytes, localized,
  }));
  const shared = Math.max(0, ...alternatives.map(chunk => chunk.shared));
  const localized = Object.fromEntries(measuredLocales.map(locale => [
    locale, Math.max(0, ...alternatives.map(chunk => chunk.localized[locale])),
  ]));
  return { bytes: Math.max(0, ...alternatives.map(chunk => chunk.bytes)), shared, localized };
}

export function measureRouteFiles(files, publicLocaleChunks, size, chunkLocaleBytes) {
  const rest = [...files].filter(file => !publicLocaleChunks.has(file));
  const alternatives = {};
  for (const [file, locale] of publicLocaleChunks.entries()) {
    if (Object.hasOwn(alternatives, locale)) throw new Error('Duplicate public dictionary for ' + locale);
    const localized = chunkLocaleBytes.get(file) ?? { it: 0, nl: 0 };
    alternatives[locale] = { bytes: size(file), localized };
  }
  const dictionary = publicDictionaryFootprint(Object.values(alternatives));
  const localeSizes = { ...dictionary.localized, shared: dictionary.shared };
  let bytes = dictionary.bytes;
  for (const file of rest) {
    const total = size(file);
    const localized = chunkLocaleBytes.get(file);
    bytes += total;
    localeSizes.shared += total;
    for (const locale of measuredLocales) {
      const count = localized?.[locale] ?? 0;
      localeSizes[locale] += count;
      localeSizes.shared -= count;
    }
  }
  localeSizes.alternatives = alternatives;
  localeSizes.publicPayload = dictionary.localized;
  localeSizes.sharedAlternative = dictionary.shared;
  return { bytes, localeSizes };
}
