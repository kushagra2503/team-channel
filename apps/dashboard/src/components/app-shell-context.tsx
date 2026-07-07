import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project, RelayStatusResponse, Workspace } from '@teambridge/core';

export type HeaderVariant = 'projects' | 'dashboard';

export type AppShellHeaderState = {
  variant: HeaderVariant;
  project?: Project;
  workspace?: Workspace;
  projectCount?: number;
  teamPanelOpen?: boolean;
  onToggleTeamPanel?: () => void;
  relayStatus?: RelayStatusResponse;
};

type AppShellContextValue = {
  header: AppShellHeaderState;
  setHeader: (patch: Partial<AppShellHeaderState>) => void;
  resetHeader: () => void;
};

const defaultHeader: AppShellHeaderState = { variant: 'projects' };

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<AppShellHeaderState>(defaultHeader);

  const setHeader = useCallback((patch: Partial<AppShellHeaderState>) => {
    setHeaderState((current) => ({ ...current, ...patch }));
  }, []);

  const resetHeader = useCallback(() => {
    setHeaderState(defaultHeader);
  }, []);

  const value = useMemo(
    () => ({ header, setHeader, resetHeader }),
    [header, setHeader, resetHeader]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }
  return ctx;
}

/** Push header fields from a page; clears back to defaults on unmount. */
export function useSyncAppHeader(state: Partial<AppShellHeaderState>) {
  const { setHeader, resetHeader } = useAppShell();

  useEffect(() => {
    setHeader(state);
    return () => resetHeader();
  }, [setHeader, resetHeader, state]);
}
