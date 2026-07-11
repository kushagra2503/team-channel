export type PhaseOneVaultFile =
  | 'README.md'
  | 'decisions.md'
  | 'observations.md'
  | 'blockers.md'
  | 'test-results.md'
  | 'attempts.md'
  | 'conflicts.md';

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
  truncated: boolean;
  maxBytes?: number;
  lastSeq?: number;
};

export type VaultItemAnnotation = {
  path: string;
  itemText: string;
  color?: string | null;
  assign?: string | null;
};

export type VaultAnnotateResponse = {
  file: VaultFile;
  context?: VaultContext;
};

