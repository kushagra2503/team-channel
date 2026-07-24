import { join } from 'node:path';

/**
 * Mirrors the daemon's `safeDisplayName` (packages/daemon/src/index.ts:430)
 * BYTE-FOR-BYTE. The participant branch is built from this on both sides, and
 * the daemon enforces UNIQUE(branch); any drift here silently breaks join
 * reconciliation. Keep identical until it is lifted into @coord/core
 * (daemon ask #6 in docs/nihal-daemon-requests.md), then import from there.
 */
export function safeDisplayName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'local'
  );
}

const SESSION_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * The daemon stores the session name raw into a git ref segment
 * (`coord/<sessionName>/<safeName>`). Reject anything that would produce
 * an invalid ref before the daemon persists it.
 */
export function assertValidSessionName(sessionName: string): void {
  const trimmed = sessionName.trim();
  if (!trimmed) {
    throw new Error('Track name is required.');
  }
  if (!SESSION_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Track name "${sessionName}" is invalid. Use only letters, numbers, '.', '_' and '-' (no spaces or slashes).`
    );
  }
}

/** Branch uses the RAW (validated) session name — matches daemon index.ts:778-779. */
export function branchForParticipant(sessionName: string, displayName: string): string {
  return `coord/${sessionName}/${safeDisplayName(displayName)}`;
}

/** Path segment is sanitized for filesystem safety (branch is not — keep distinct). */
export function sessionSlug(sessionName: string): string {
  return safeDisplayName(sessionName);
}

export function worktreePathFor(repoRoot: string, sessionName: string, displayName: string): string {
  return join(repoRoot, '.coord', 'worktrees', sessionSlug(sessionName), safeDisplayName(displayName));
}
