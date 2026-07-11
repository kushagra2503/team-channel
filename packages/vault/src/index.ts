import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Conflict, PhaseOneVaultFile, PublishEventPayload, VaultContext, VaultFile, VaultItemAnnotation, VaultItemMeta, WorkspaceEvent } from '@teambridge/core';
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
  'conflicts.md': '# Conflicts\n\nNo conflicts detected.\n'
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
  if (targetFile === 'conflicts.md') {
    throw new Error('conflicts.md is managed by Teambridge and is not a publish target');
  }

  await initializePhaseOneVault(vaultDir);
  await appendFile(join(vaultDir, targetFile), formatPublishText(event.payload.text));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function conflictFromDetectedEvent(event: WorkspaceEvent): Conflict | null {
  if (event.type !== 'conflict_detected' || typeof event.payload !== 'object' || event.payload === null) {
    return null;
  }

  const payload = event.payload as Record<string, unknown>;
  const id = String(payload.conflictId ?? payload.id ?? `conf_${event.id}`);
  const kind = String(payload.kind ?? 'unknown');
  return {
    id,
    workspaceId: event.workspaceId,
    kind: kind === 'content' || kind === 'vault' || kind === 'branch' ? kind : 'unknown',
    status: 'open',
    summary: String(payload.summary ?? 'Conflict detected'),
    eventIds: stringArray(payload.eventIds).length > 0 ? stringArray(payload.eventIds) : [event.id],
    affectedPaths: stringArray(payload.affectedPaths),
    createdAt: String(payload.createdAt ?? event.createdAt)
  };
}

function applyConflictResolution(conflict: Conflict, event: WorkspaceEvent): Conflict {
  const payload = typeof event.payload === 'object' && event.payload !== null
    ? event.payload as Record<string, unknown>
    : {};
  return {
    ...conflict,
    status: 'resolved',
    resolvedAt: String(payload.resolvedAt ?? event.createdAt),
    resolutionEventId: event.id
  };
}

function deriveConflicts(events: WorkspaceEvent[]): Conflict[] {
  const conflicts = new Map<string, Conflict>();

  for (const event of events) {
    if (event.type === 'conflict_detected') {
      const conflict = conflictFromDetectedEvent(event);
      if (conflict) conflicts.set(conflict.id, conflict);
    } else if (event.type === 'conflict_resolved' && typeof event.payload === 'object' && event.payload !== null) {
      const conflictId = String((event.payload as Record<string, unknown>).conflictId ?? '');
      const existing = conflictId ? conflicts.get(conflictId) : undefined;
      if (existing) conflicts.set(conflictId, applyConflictResolution(existing, event));
    }
  }

  return [...conflicts.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function renderConflictsMarkdown(conflicts: Conflict[], events: WorkspaceEvent[]): string {
  const resolutionByConflictId = new Map<string, string>();
  for (const event of events) {
    if (event.type !== 'conflict_resolved' || typeof event.payload !== 'object' || event.payload === null) continue;
    const payload = event.payload as Record<string, unknown>;
    const conflictId = String(payload.conflictId ?? '');
    const resolutionText = String(payload.resolutionText ?? '').trim();
    if (conflictId && resolutionText) resolutionByConflictId.set(conflictId, resolutionText);
  }

  const lines = ['# Conflicts', ''];
  if (conflicts.length === 0) {
    lines.push('No conflicts detected.', '');
    return lines.join('\n');
  }

  const open = conflicts.filter((conflict) => conflict.status === 'open');
  const resolved = conflicts.filter((conflict) => conflict.status !== 'open');

  lines.push('## Open');
  if (open.length === 0) {
    lines.push('- None');
  } else {
    for (const conflict of open) {
      lines.push(`- [${conflict.id}] ${conflict.summary}`);
      if (conflict.affectedPaths?.length) lines.push(`  - affected: ${conflict.affectedPaths.join(', ')}`);
      if (conflict.eventIds.length) lines.push(`  - events: ${conflict.eventIds.join(', ')}`);
    }
  }

  lines.push('', '## Resolved');
  if (resolved.length === 0) {
    lines.push('- None');
  } else {
    for (const conflict of resolved) {
      lines.push(`- [${conflict.id}] ${conflict.summary}`);
      const resolution = resolutionByConflictId.get(conflict.id);
      if (resolution) lines.push(`  - resolution: ${resolution}`);
      if (conflict.resolvedAt) lines.push(`  - resolved: ${conflict.resolvedAt}`);
    }
  }

  lines.push('');
  return lines.join('\n');
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
    }
  }
  await writeFile(join(vaultDir, 'conflicts.md'), renderConflictsMarkdown(deriveConflicts(events), events));

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
