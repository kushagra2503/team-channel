/** Normalize a person name for stable comparisons and avatar keys. */
export function normalizeDisplayName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '-')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL-safe slug derived from a display name. */
export function avatarNameSlug(displayName: string): string {
  return normalizeDisplayName(displayName).replace(/\s+/g, '-');
}

/** Stable on-disk avatar id — one flower per person name. */
export function avatarStorageId(displayName: string): string {
  return `name_${avatarNameSlug(displayName)}`;
}

/** Human-readable display name from first and last name (dashboard + project roster). */
export function formatDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim();
}
