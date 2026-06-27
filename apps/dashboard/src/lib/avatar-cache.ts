const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | undefined>>();

export function getCachedAvatarUrl(httpUrl: string): string | undefined {
  return objectUrlCache.get(httpUrl);
}

export async function preloadAvatar(httpUrl: string): Promise<string | undefined> {
  const cached = objectUrlCache.get(httpUrl);
  if (cached) return cached;

  const pending = inflight.get(httpUrl);
  if (pending) return pending;

  const task = fetch(httpUrl)
    .then((response) => (response.ok ? response.blob() : undefined))
    .then((blob) => {
      if (!blob) return undefined;
      const url = URL.createObjectURL(blob);
      objectUrlCache.set(httpUrl, url);
      return url;
    })
    .finally(() => {
      inflight.delete(httpUrl);
    });

  inflight.set(httpUrl, task);
  return task;
}

export function preloadAvatars(httpUrls: Iterable<string>): void {
  for (const url of httpUrls) {
    void preloadAvatar(url);
  }
}
