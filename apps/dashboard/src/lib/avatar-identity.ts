/** Mirror of @teambridge/core/avatar — kept local for Vite ESM (core ships CJS). */

export function normalizeDisplayName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '-')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function avatarNameSlug(displayName: string): string {
  return normalizeDisplayName(displayName).replace(/\s+/g, '-');
}

export function avatarStorageId(displayName: string): string {
  return `name_${avatarNameSlug(displayName)}`;
}
