import type { Project, ProjectMember, VaultContext, Workspace, WorkspaceStatusResponse } from '@coord/core';

type CacheShape = {
  workspaces: Workspace[];
  selectedWorkspaceId?: string;
  status: Record<string, WorkspaceStatusResponse>;
  vault: Record<string, VaultContext>;
  projects: Project[];
  projectMembers: Record<string, ProjectMember[]>;
  lastProjectId?: string;
};

const CACHE_VERSION = 2;

function cacheKey(daemonUrl: string): string {
  return `tb_cache_v${CACHE_VERSION}_${daemonUrl}`;
}

const EMPTY: CacheShape = { workspaces: [], status: {}, vault: {}, projects: [], projectMembers: {} };

function readCache(daemonUrl: string): CacheShape {
  try {
    const raw = sessionStorage.getItem(cacheKey(daemonUrl));
    if (!raw) return { ...EMPTY };
    return JSON.parse(raw) as CacheShape;
  } catch {
    return { ...EMPTY };
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
    get projects() { return shape.projects; },
    get lastProjectId() { return shape.lastProjectId; },

    setWorkspaces(workspaces: Workspace[]) {
      shape = { ...shape, workspaces };
      flush();
    },

    setSelectedWorkspaceId(id: string | undefined) {
      shape = { ...shape, selectedWorkspaceId: id };
      flush();
    },

    setProjects(projects: Project[]) {
      shape = { ...shape, projects };
      flush();
    },

    setLastProjectId(id: string) {
      shape = { ...shape, lastProjectId: id };
      flush();
    },

    getProjectMembers(projectId: string): ProjectMember[] | undefined {
      return shape.projectMembers[projectId];
    },

    setProjectMembers(projectId: string, members: ProjectMember[]) {
      shape = { ...shape, projectMembers: { ...shape.projectMembers, [projectId]: members } };
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
