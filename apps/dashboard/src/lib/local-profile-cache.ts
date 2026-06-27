import type { LocalUserProfile } from '@teambridge/core';

type CachedLocalIdentity = {
  profile: LocalUserProfile;
  avatarVersion?: string;
};

function cacheKey(daemonUrl: string): string {
  return `tb_local_identity_v1_${daemonUrl}`;
}

export function readCachedLocalIdentity(daemonUrl: string): CachedLocalIdentity | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(daemonUrl));
    if (!raw) return null;
    return JSON.parse(raw) as CachedLocalIdentity;
  } catch {
    return null;
  }
}

export function writeCachedLocalIdentity(
  daemonUrl: string,
  profile: LocalUserProfile | null,
  avatarVersion?: string
): void {
  try {
    if (!profile) {
      sessionStorage.removeItem(cacheKey(daemonUrl));
      return;
    }
    sessionStorage.setItem(
      cacheKey(daemonUrl),
      JSON.stringify({ profile, avatarVersion } satisfies CachedLocalIdentity)
    );
  } catch {
    // storage quota exceeded — ignore
  }
}
