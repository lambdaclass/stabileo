export function unpackPublicDictionary({ default: groups }: { default: Record<string, Record<string, string>> }) {
  const dictionary: Record<string, string> = {};
  for (const [namespace, entries] of Object.entries(groups)) {
    for (const [key, value] of Object.entries(entries)) dictionary[`${namespace}.${key}`] = value;
  }
  return { default: dictionary };
}
