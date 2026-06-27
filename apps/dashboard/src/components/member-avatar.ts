import { buildDisplayNameAvatarUrl, type TeambridgeClientConfig } from '@/api/teambridgeClient';

export function avatarUrlForDisplayName(
  displayName: string,
  config: TeambridgeClientConfig,
  rev?: number | string
): string | undefined {
  if (!config.daemonBaseUrl) return undefined;
  return buildDisplayNameAvatarUrl(displayName, config, rev);
}
