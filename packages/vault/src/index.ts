import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConflictDetectedPayload, ConflictResolvedPayload, PhaseOneVaultFile, PublishEventPayload, VaultContext, VaultFile, VaultItemAnnotation, VaultItemMeta, WorkspaceEvent } from '@teambridge/core';
import {
  extractVaultAnnotations,
  parseVaultListLine,
  reapplyVaultAnnotations,
  updateVaultFileItemMeta
} from '@teambridge/core';

export const PHASE_ONE_VAULT_FILES: PhaseOneVaultFile[] = [
  'README.md',
  'decisions.md',
  'observations.md',
  'blockers.md',
  'test-results.md',
  'attempts.md',
  'conflicts.md'
];

const INITIAL_CONTENT: Record<PhaseOneVaultFile, string> = {
  'README.md': '# Teambridge Vault\n\nThis flat vault is generated from `events.jsonl`.\n',
  'decisions.md': '# Decisions\n',
  'observations.md': '# Observations\n',
  'blockers.md': '# Blockers\n',
  'test-results.md': '# Test Results\n',
  'attempts.md': '# Attempts\n',
  'conflicts.md': '# Conflicts\n'
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

export function assertPhaseOneTargetFile(targetFile: string): PhaseOneVaultFile {
  if (!PHASE_ONE_VAULT_FILES.includes(targetFile as PhaseOneVaultFile)) {
    throw new Error(`Unsupported Phase 1 vault file: ${targetFile}`);
  }

  return targetFile as PhaseOneVaultFile;
}

function formatPublishText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('publish payload.text is required');
  }

  return `- ${trimmed.replace(/\n/g, '\n  ')}\n`;
}

export async function materializePublishEvent(vaultDir: string, event: WorkspaceEvent<PublishEventPayload>): Promise<void> {
  if (event.type !== 'publish') {
    return;
  }

  if (!event.targetFile) {
    throw new Error('publish event targetFile is required');
  }

  const targetFile = assertPhaseOneTargetFile(event.targetFile);
  if (targetFile === 'README.md') {
    throw new Error('README.md is not a publish target');
  }

  await initializePhaseOneVault(vaultDir);
  await appendFile(join(vaultDir, targetFile), formatPublishText(event.payload.text));
}

function formatConflictText(event: WorkspaceEvent<ConflictDetectedPayload | ConflictResolvedPayload>): string {
  if (event.type === 'conflict_detected') {
    const { targetFile, summary } = event.payload as ConflictDetectedPayload;
    return `- ${event.createdAt} OPEN: ${summary} (${targetFile})\n`;
  }
  const { conflictId, resolutionText } = event.payload as ConflictResolvedPayload;
  return `- ${event.createdAt} RESOLVED ${conflictId}: ${resolutionText.replace(/\n/g, ' ')}\n`;
}

export async function materializeConflictEvent(
  vaultDir: string,
  event: WorkspaceEvent<ConflictDetectedPayload | ConflictResolvedPayload>
): Promise<void> {
  if (event.type !== 'conflict_detected' && event.type !== 'conflict_resolved') {
    return;
  }

  await initializePhaseOneVault(vaultDir);
  await appendFile(join(vaultDir, 'conflicts.md'), formatConflictText(event));
}

export async function readEventsJsonl(eventsPath: string): Promise<WorkspaceEvent[]> {
  const content = await readFile(eventsPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  });

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WorkspaceEvent)
    .sort((a, b) => a.seq - b.seq);
}

export async function rebuildPhaseOneVault(vaultDir: string, eventsPath: string): Promise<{ lastSeq: number }> {
  const preserved = new Map<string, Map<string, VaultItemMeta>>();
  for (const file of PHASE_ONE_VAULT_FILES) {
    const content = await readFile(join(vaultDir, file), 'utf8').catch(() => '');
    const annotations = extractVaultAnnotations(content);
    if (annotations.size > 0) preserved.set(file, annotations);
  }

  await rm(vaultDir, { recursive: true, force: true });
  await initializePhaseOneVault(vaultDir);

  const events = await readEventsJsonl(eventsPath);
  for (const event of events) {
    if (event.type === 'publish') {
      await materializePublishEvent(vaultDir, event as WorkspaceEvent<PublishEventPayload>);
    } else if (event.type === 'conflict_detected' || event.type === 'conflict_resolved') {
      await materializeConflictEvent(vaultDir, event as WorkspaceEvent<ConflictDetectedPayload | ConflictResolvedPayload>);
    }
  }

  for (const file of PHASE_ONE_VAULT_FILES) {
    const annotations = preserved.get(file);
    if (!annotations?.size) continue;
    const filePath = join(vaultDir, file);
    const content = await readFile(filePath, 'utf8');
    await writeFile(filePath, reapplyVaultAnnotations(content, annotations));
  }

  return { lastSeq: events.at(-1)?.seq ?? 0 };
}

export async function annotateVaultItem(
  vaultDir: string,
  annotation: VaultItemAnnotation
): Promise<VaultFile> {
  const targetFile = assertPhaseOneTargetFile(annotation.path);
  const filePath = join(vaultDir, targetFile);
  const content = await readFile(filePath, 'utf8');
  let current: VaultItemMeta = {};
  for (const line of content.split('\n')) {
    const parsed = parseVaultListLine(line);
    if (parsed?.text === annotation.itemText) {
      current = parsed.meta;
      break;
    }
  }
  const meta: VaultItemMeta = {
    color: annotation.color === null ? undefined : (annotation.color ?? current.color),
    assign: annotation.assign === null ? undefined : (annotation.assign ?? current.assign)
  };
  const next = updateVaultFileItemMeta(content, annotation.itemText, meta);
  await writeFile(filePath, next);
  return { path: targetFile, content: next };
}

export async function readVaultFile(vaultDir: string, path: string): Promise<VaultFile> {
  const targetFile = assertPhaseOneTargetFile(path);
  const content = await readFile(join(vaultDir, targetFile), 'utf8');

  return {
    path: targetFile,
    content
  };
}

export async function createVaultContext(
  workspaceId: string,
  vaultDir: string,
  lastSeq: number,
  maxBytes = 24000
): Promise<VaultContext> {
  let remainingBytes = maxBytes;
  let truncated = false;
  const includedPaths: string[] = [];
  const chunks: string[] = [];

  for (const file of PHASE_ONE_VAULT_FILES) {
    const content = await readFile(join(vaultDir, file), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return '';
      }

      throw error;
    });

    const chunk = `\n\n--- ${file} ---\n${content}`;
    const bytes = Buffer.byteLength(chunk, 'utf8');

    if (bytes > remainingBytes) {
      const partial = Buffer.from(chunk, 'utf8').subarray(0, Math.max(0, remainingBytes)).toString('utf8');
      if (partial) {
        chunks.push(partial);
        includedPaths.push(file);
      }
      truncated = true;
      break;
    }

    chunks.push(chunk);
    includedPaths.push(file);
    remainingBytes -= bytes;
  }

  return {
    workspaceId,
    content: chunks.join('').trimStart(),
    includedPaths,
    truncated,
    maxBytes,
    lastSeq
  };
}
