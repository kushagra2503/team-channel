# Phase 1 Design Choices

This document records the current Phase 1 design choices so future contributors do not accidentally revert them back to a more complex model.

Phase 1 is intentionally local-only and simple. The goal is to prove the core loop before adding remote sync, richer vault structure, MCP behavior, hooks, or dashboard workflows.

## 1. Relay Mode Is Local-Only

Current contract:

```ts
export type RelayMode = 'local';
```

Why:

- Phase 1 should prove the local product loop first.
- Supabase sync adds ordering, auth, retries, realtime, and checkpoint complexity.
- The daemon should work locally before it becomes a sync client.

Do not add `supabase` or `git-sync` back into `RelayMode` until Phase 2 work actually starts.

Phase 1 flow:

```text
CLI -> local daemon -> events.jsonl -> flat vault files
```

Not Phase 1:

```text
CLI -> local daemon -> Supabase -> teammate daemon
```

## 2. User Context Uses One Event Type: `publish`

Current user-authored event model:

```json
{
  "type": "publish",
  "targetFile": "decisions.md",
  "payload": {
    "text": "Backend is the source of truth for invoice state."
  }
}
```

Why:

- It keeps Phase 1 simple.
- Filtering can happen by `targetFile`.
- Agents and CLI do not need to understand many event categories yet.
- Future vault structure can change without changing the meaning of old user events.

Do not reintroduce separate user-publishable event types like `decision`, `observation`, `blocker`, `test_result`, or `attempt_failed` unless there is a concrete Phase 2/3 need that filenames cannot handle.

Internal event types can still exist for system behavior:

```text
team_ask
team_reply
vault_patch
conflict_detected
conflict_resolved
checkpoint_created
```

Those are not Phase 1 user publish categories.

## 3. `targetFile` Is Required For Publish

Current publish request shape:

```ts
export type PublishEventRequest<TPayload = PublishEventPayload> = {
  targetFile: VaultTargetFile;
  payload: TPayload;
  dedupeKey?: string;
};
```

Why:

- The target markdown file is the Phase 1 category.
- This makes the materializer straightforward.
- It gives agents an explicit way to choose where content should land.
- It avoids hardcoding semantic routing too early.

Example CLI:

```bash
teambridge publish decisions.md "Backend is the source of truth for invoice state."
teambridge publish observations.md "Frontend reads derived totals from the invoice API."
teambridge publish blockers.md "Need refresh-token behavior decided before UI retry logic."
```

Example MCP tool input:

```ts
team_publish({
  targetFile: 'observations.md',
  payload: {
    text: 'Frontend calls refresh endpoint without retry cap.'
  }
});
```

## 4. Phase 1 Vault Is Flat

Current Phase 1 vault:

```text
vault/
├── README.md
├── decisions.md
├── observations.md
├── blockers.md
├── test-results.md
└── attempts.md
```

Why:

- Easy to implement.
- Easy for humans and agents to inspect.
- Easy to search.
- Easy to rebuild from `events.jsonl`.
- Enough to prove the local shared-context loop.

Do not switch back to the nested vault yet:

```text
MEMORY.md
CURRENT_GOALS.md
day-logs/
topics/
procedures/
sessions/
```

That structure can come later if the flat model becomes insufficient.

## 5. Events Stay The Source Of Truth

Even with flat markdown files, the markdown is still only a projection.

Source of truth:

```text
events.jsonl
```

Readable projection:

```text
vault/*.md
```

The materializer should be able to delete and rebuild the vault from ordered events:

```bash
rm -rf .teambridge/workspaces/billing-refactor/vault
teambridge vault rebuild billing-refactor
teambridge vault read decisions.md
```

If rebuild does not work, the architecture is drifting in the wrong direction.

## 6. `vault context` Is Basic In Phase 1

Phase 1 should include a simple context endpoint/command because agents will eventually need one.

Current behavior:

```text
read flat vault files in stable order
-> concatenate content up to a configured limit
-> return includedPaths, lastSeq, truncated
```

Example response:

```json
{
  "workspaceId": "ws_123",
  "content": "# Decisions\n\n- Backend is the source of truth.\n\n# Observations\n\n- Frontend reads derived totals.",
  "includedPaths": ["decisions.md", "observations.md"],
  "truncated": false,
  "maxBytes": 24000,
  "lastSeq": 2
}
```

Do not build smart ranking, summarization, topic selection, or agent-specific context in Phase 1. That can replace the internals later while keeping the same `VaultContext` shape.

## 7. Keep The Vault Layout Easy To Change

The current file names are Phase 1 defaults, not permanent canon.

If the vault becomes nested later, add a translation layer in the materializer:

```text
old targetFile: decisions.md
new projection: MEMORY.md + CURRENT_GOALS.md + day-logs/{date}.md
```

Important rule:

```text
Do not rewrite old events just because the vault layout changes.
```

Instead:

- Preserve old `publish` events.
- Preserve old `targetFile` values.
- Teach the materializer how old target files map to new projections.

## 8. Phase 1 Success Criteria

The first version passes when this local flow works:

```bash
teambridge init
teambridge start billing-refactor main
teambridge join billing-refactor --as kushagra
teambridge join billing-refactor --as ronish
teambridge publish decisions.md "Backend is the source of truth for invoice state."
teambridge vault read decisions.md
teambridge vault context
teambridge vault search "invoice state"
```

And all of this is true:

- Workspace manifest exists.
- Participants exist.
- `baseCommit` is frozen.
- `events.jsonl` has a `publish` event with `seq`.
- `vault/decisions.md` is generated.
- `vault context` returns flat vault content with truncation metadata.
- Vault can be rebuilt from `events.jsonl`.
- No Supabase is required.

