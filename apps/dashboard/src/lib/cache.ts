import type { VaultContext, Workspace, WorkspaceStatusResponse } from '@teambridge/core';

type CacheShape = {
  workspaces: Workspace[];
  selectedWorkspaceId?: string;
  status: Record<string, WorkspaceStatusResponse>;
  vault: Record<string, VaultContext>;
};

const CACHE_VERSION = 1;

function cacheKey(daemonUrl: string): string {
  return `tb_cache_v${CACHE_VERSION}_${daemonUrl}`;
}

function readCache(daemonUrl: string): CacheShape {
  try {
    const raw = sessionStorage.getItem(cacheKey(daemonUrl));
    if (!raw) return { workspaces: [], status: {}, vault: {} };
    return JSON.parse(raw) as CacheShape;
  } catch {
    return { workspaces: [], status: {}, vault: {} };
  }
}

function writeCache(daemonUrl: string, shape: CacheShape): void {
  try {
    sessionStorage.setItem(cacheKey(daemonUrl), JSON.stringify(shape));
  } catch {
    // storage quota exceeded — ignore
  }
}

export function createCache(daemonUrl: string) {
  let shape = readCache(daemonUrl);

  function flush() {
    writeCache(daemonUrl, shape);
  }

  return {
    get workspaces() { return shape.workspaces; },
    get selectedWorkspaceId() { return shape.selectedWorkspaceId; },

    setWorkspaces(workspaces: Workspace[]) {
      shape = { ...shape, workspaces };
      flush();
    },

    setSelectedWorkspaceId(id: string | undefined) {
      shape = { ...shape, selectedWorkspaceId: id };
      flush();
    },

    getStatus(workspaceId: string): WorkspaceStatusResponse | undefined {
      return shape.status[workspaceId];
    },

    setStatus(workspaceId: string, status: WorkspaceStatusResponse) {
      shape = { ...shape, status: { ...shape.status, [workspaceId]: status } };
      flush();
    },

    getVault(workspaceId: string): VaultContext | undefined {
      return shape.vault[workspaceId];
    },

    setVault(workspaceId: string, context: VaultContext) {
      shape = { ...shape, vault: { ...shape.vault, [workspaceId]: context } };
      flush();
    }
  };
}
