import { buildDisplayNameAvatarUrl, type TeambridgeClientConfig } from '@/api/teambridgeClient';

export function avatarUrlForDisplayName(
  displayName: string,
  config: TeambridgeClientConfig,
  avatarRev?: number
): string | undefined {
  if (!config.daemonBaseUrl) return undefined;
  return buildDisplayNameAvatarUrl(displayName, config, avatarRev);
}
