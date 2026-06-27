import type { Workspace } from '@teambridge/core';

type WorkspaceName = Pick<Workspace, 'sessionName'>;

export function getWorkspaceDisplayName(workspace?: WorkspaceName): string {
  if (!workspace) {
    return 'No workspace';
  }

  const words = workspace.sessionName.replace(/[-_]+/g, ' ').trim();
  if (!words) {
    return workspace.sessionName;
  }

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function getWorkspaceSessionId(workspace?: WorkspaceName): string | undefined {
  return workspace?.sessionName;
}
