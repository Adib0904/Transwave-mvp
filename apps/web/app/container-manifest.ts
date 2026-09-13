const CONTAINER_NUMBER = /\b[A-Z]{4}\d{7}\b/g;

export function parseContainerManifest(value: string): string[] {
  const matches = value.toUpperCase().match(CONTAINER_NUMBER) ?? [];
  return [...new Set(matches)];
}
