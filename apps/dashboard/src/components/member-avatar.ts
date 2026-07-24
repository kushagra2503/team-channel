import { buildDisplayNameAvatarUrl, type CoordClientConfig } from '@/api/coordClient';

export function avatarUrlForDisplayName(
  displayName: string,
  config: CoordClientConfig,
  rev?: number | string
): string | undefined {
  if (!config.daemonBaseUrl) return undefined;
  return buildDisplayNameAvatarUrl(displayName, config, rev);
}
