export type VaultFile = {
  path: string;
  content: string;
  updatedAt?: string;
};

export type VaultTreeEntry = {
  path: string;
  type: 'file' | 'directory';
};

export type VaultSearchResult = {
  path: string;
  line: number;
  text: string;
};

export type VaultSnapshot = {
  workspaceId: string;
  files: VaultFile[];
  truncated: boolean;
  lastSeq?: number;
};

export type VaultPatch = {
  path: string;
  patch: string;
  reason?: string;
};

export type VaultContext = {
  workspaceId: string;
  content: string;
  includedPaths: string[];
  lastSeq?: number;
};

