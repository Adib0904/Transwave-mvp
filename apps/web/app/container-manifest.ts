export function parseContainerManifest(value: string): string[] {
  const normalized = value.toUpperCase().trim();
  if (!normalized) return [];

  const pairedReferences = Array.from(
    normalized.matchAll(/([^\s,/]+)\s*\/\s*(?:20|40|45)[A-Z0-9`'-]*/g),
    (match) => match[1],
  );
  const references = pairedReferences.length
    ? pairedReferences
    : normalized
        .split(/[\s,;]+/)
        .map((part) => part.replace(/^\/+|\/+$/g, ""))
        .filter((part) => part && !/^(?:20|40|45)[A-Z0-9`'-]*$/.test(part));

  return [...new Set(references.filter((reference) => reference.length <= 64))];
}
