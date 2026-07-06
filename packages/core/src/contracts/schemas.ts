import { z } from 'zod';

export const AgentKindSchema = z.enum(['claude-code', 'cursor', 'codex', 'ghost', 'unknown']);
export const ParticipantStatusSchema = z.enum(['active', 'idle', 'offline']);

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  workspaceId: z.string().min(1),
  branch: z.string().min(1),
  agent: AgentKindSchema.optional(),
  status: ParticipantStatusSchema,
  lastSeenAt: z.string().datetime()
});

export const WorkspaceStatusSchema = z.enum(['active', 'archived']);
export const RelayModeSchema = z.enum(['local', 'supabase']);

export const TeambridgeConfigSchema = z.object({
  schemaVersion: z.literal(1),
  defaultRelayMode: RelayModeSchema,
  daemonPort: z.number().int().positive(),
  mcpPort: z.number().int().positive(),
  autoInject: z.boolean(),
  vaultInjectionMode: z.literal('compact'),
  vault: z.object({
    contextMaxBytes: z.number().int().positive()
  })
});

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  sessionName: z.string().min(1),
  repoRemote: z.string().min(1).nullable(),
  repoRootHash: z.string().min(1),
  baseRef: z.string().min(1),
  baseCommit: z.string().min(1),
  scope: z.array(z.string()),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  status: WorkspaceStatusSchema,
  relayMode: RelayModeSchema,
  projectId: z.string().min(1).nullable()
});

export const WorkspaceManifestSchema = WorkspaceSchema.extend({
  schemaVersion: z.literal(1),
  participants: z.array(ParticipantSchema)
});

export const StartWorkspaceRequestSchema = z.object({
  sessionName: z.string().min(1),
  baseRef: z.string().min(1).optional(),
  scope: z.array(z.string()).optional(),
  displayName: z.string().min(1).optional(),
  agent: AgentKindSchema.optional(),
  projectId: z.string().min(1).optional()
});

export const LocalUserProfileSchema = z.object({
  schemaVersion: z.literal(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().min(1),
  defaultAgent: AgentKindSchema.optional(),
  defaultProjectId: z.string().min(1).nullable().optional()
});

export const SaveLocalUserProfileRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  defaultAgent: AgentKindSchema.optional(),
  defaultProjectId: z.string().min(1).nullable().optional()
});

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  addLocalUser: z.boolean().optional()
});

export const UpsertProjectMemberRequestSchema = z.object({
  displayName: z.string().min(1),
  status: ParticipantStatusSchema.optional()
});

export const JoinWorkspaceRequestSchema = z.object({
  sessionName: z.string().min(1),
  displayName: z.string().min(1).optional(),
  agent: AgentKindSchema.optional()
});

export const WorktreeInfoSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().min(1),
  baseCommit: z.string().min(1),
  currentCommit: z.string().min(1).optional(),
  dirty: z.boolean()
});

export const WorkspaceEventTypeSchema = z.enum([
  'publish',
  'team_ask',
  'team_reply',
  'vault_patch',
  'conflict_detected',
  'conflict_resolved',
  'checkpoint_created'
]);

export const PublishEventPayloadSchema = z.object({
  text: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const PublishEventRequestSchema = z.object({
  targetFile: z.string().min(1),
  payload: PublishEventPayloadSchema,
  dedupeKey: z.string().min(1).optional()
});

export const PublishEventSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  seq: z.number().int().positive(),
  type: z.literal('publish'),
  actorId: z.string().min(1),
  deviceId: z.string().min(1),
  payload: PublishEventPayloadSchema,
  targetFile: z.string().min(1),
  dedupeKey: z.string().min(1).optional(),
  createdAt: z.string().datetime()
});

export const VaultFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  updatedAt: z.string().datetime().optional()
});

export const VaultContextSchema = z.object({
  workspaceId: z.string().min(1),
  content: z.string(),
  includedPaths: z.array(z.string().min(1)),
  truncated: z.boolean(),
  maxBytes: z.number().int().positive().optional(),
  lastSeq: z.number().int().nonnegative().optional()
});

export const TeambridgeErrorCodeSchema = z.enum([
  'WORKSPACE_NOT_FOUND',
  'WORKTREE_NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'RELAY_UNAVAILABLE',
  'INVALID_REQUEST',
  'NOT_FOUND',
  'INTERNAL_ERROR'
]);

export const TeambridgeErrorSchema = z.object({
  code: TeambridgeErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional()
});

export function ApiOkSchema<T extends z.ZodType>(data: T) {
  return z.object({
    ok: z.literal(true),
    data
  });
}

export const ApiFailSchema = z.object({
  ok: z.literal(false),
  error: TeambridgeErrorSchema
});

export function ApiResultSchema<T extends z.ZodType>(data: T) {
  return z.union([ApiOkSchema(data), ApiFailSchema]);
}

export const StartWorkspaceResponseSchema = z.object({
  manifest: WorkspaceManifestSchema,
  worktree: WorktreeInfoSchema
});

export const JoinWorkspaceResponseSchema = StartWorkspaceResponseSchema;

export const WorkspaceStatusResponseSchema = z.object({
  workspace: WorkspaceSchema,
  participants: z.array(ParticipantSchema),
  worktrees: z.array(WorktreeInfoSchema),
  lastSeq: z.number().int().nonnegative()
});

export const VaultReadResponseSchema = z.object({
  file: VaultFileSchema
});

export const VaultContextResponseSchema = z.object({
  context: VaultContextSchema
});

export const SyncStateEntrySchema = z.object({
  workspaceId: z.string().min(1),
  lastRemoteSeq: z.number().int().nonnegative(),
  lastSyncedAt: z.string().nullable(),
  relayStatus: z.string(),
  lastError: z.string().nullable()
});

export const RelayStatusResponseSchema = z.object({
  configured: z.boolean(),
  loggedIn: z.boolean(),
  pending: z.number().int().nonnegative(),
  sync: z.array(SyncStateEntrySchema)
});
