import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PhaseOneVaultFile } from '@teambridge/core';

export const PHASE_ONE_VAULT_FILES: PhaseOneVaultFile[] = [
  'README.md',
  'decisions.md',
  'observations.md',
  'blockers.md',
  'test-results.md',
  'attempts.md'
];

const INITIAL_CONTENT: Record<PhaseOneVaultFile, string> = {
  'README.md': '# Teambridge Vault\n\nThis flat vault is generated from `events.jsonl`.\n',
  'decisions.md': '# Decisions\n',
  'observations.md': '# Observations\n',
  'blockers.md': '# Blockers\n',
  'test-results.md': '# Test Results\n',
  'attempts.md': '# Attempts\n'
};

export async function initializePhaseOneVault(vaultDir: string): Promise<void> {
  await mkdir(vaultDir, { recursive: true });

  await Promise.all(
    PHASE_ONE_VAULT_FILES.map((file) =>
      writeFile(join(vaultDir, file), INITIAL_CONTENT[file], { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') {
          return;
        }

        throw error;
      })
    )
  );
}
