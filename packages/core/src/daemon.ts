export const DEFAULT_DAEMON_BASE_URL = 'http://127.0.0.1:9473';

export type DaemonClientOptions = {
  baseUrl?: string;
  repoRoot?: string;
};

export type DaemonQueryParams = Record<string, string | number | boolean | undefined>;

export function buildDaemonUrl(
  path: string,
  options: DaemonClientOptions = {},
  params: DaemonQueryParams = {}
): string {
  const url = new URL(path, options.baseUrl ?? DEFAULT_DAEMON_BASE_URL);

  if (options.repoRoot) {
    url.searchParams.set('repoRoot', options.repoRoot);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}
