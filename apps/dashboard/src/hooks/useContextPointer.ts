import { useCallback, useEffect, useState } from 'react';
import type { ContextPointerResponse } from '@coord/core';
import { getContextPointer, setContextPointer, type CoordClientConfig } from '@/api/coordClient';

const REFRESH_MS = 5000;

export type UseContextPointerResult = {
  pointer: ContextPointerResponse | null;
  error: string | undefined;
  loading: boolean;
  update: (lastSeenSeq: number) => Promise<void>;
};

export function useContextPointer(
  workspaceId: string | undefined,
  config: CoordClientConfig
): UseContextPointerResult {
  const [pointer, setPointer] = useState<ContextPointerResponse | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (lastSeenSeq: number) => {
      if (!workspaceId) return;
      setLoading(true);
      try {
        const next = await setContextPointer(workspaceId, { lastSeenSeq }, config);
        setPointer(next);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to update context pointer');
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, config]
  );

  useEffect(() => {
    if (!workspaceId) {
      setPointer(null);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    setError(undefined);

    const load = async () => {
      try {
        const next = await getContextPointer(workspaceId, config, controller.signal);
        setPointer(next);
        setError(undefined);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load context pointer.');
        }
      }
    };

    void load();
    const refreshId = window.setInterval(load, REFRESH_MS);

    return () => {
      window.clearInterval(refreshId);
      controller.abort();
    };
  }, [workspaceId, config]);

  return { pointer, error, loading, update };
}
