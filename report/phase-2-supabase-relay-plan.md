# Phase 2 Supabase Relay Plan

This is Nihal's Phase 2 backend plan. It explains what "Supabase relay" means, which database objects are needed, and how the daemon should use them.

## Current Implementation Status (Jul 2026)

The relay MVP from this plan is implemented and live-verified.

Implemented:

- Supabase migration: `supabase/migrations/001_teambridge_relay.sql`.
- `tc_` tables, indexes, RLS helpers/policies, checkpoint storage bucket, and Realtime publication.
- `tc_append_event` RPC for canonical per-workspace `seq` assignment and `dedupeKey` dedupe.
- Daemon Supabase relay client using REST/RPC.
- Minimal `teambridge login` auth flow with local daemon identity storage.
- Device registration in `tc_devices`.
- Project/session/participant mirroring to Supabase when logged in.
- Remote publish path from `teambridge publish` through daemon to Supabase.
- Local `pending_remote_events` queue for failed remote appends.
- Manual `teambridge sync` and autonomous polling via `TEAMBRIDGE_RELAY_SYNC_INTERVAL_MS`.
- Pull-after-last-remote-seq and local vault rematerialization from canonical remote events.
- Remote session discovery through `teambridge sessions` / `teambridge list`.
- `teambridge join <session>` can import a remote workspace and then create the local Git worktree.
- Dashboard calls daemon `/relay/sessions` and merges remote relay sessions with local sessions.

Verified:

- All `tc_` tables are reachable through Supabase REST.
- `teambridge-checkpoints` storage bucket is reachable.
- `tc_append_event` assigns `seq = 1, 2...` and dedupes duplicate `dedupeKey` values.
- Live CLI/daemon relay smoke passed: login, start, sessions/list, sync, status relay.
- Live `teambridge publish` reached Supabase with canonical `seq = 1` and the expected payload.
- Local verification still passes: `pnpm build`, `pnpm test`, `pnpm test:integration`, dashboard test/build.

Still pending:

- Supabase Realtime websocket subscription client in the daemon. Realtime publication exists, but polling/manual sync is currently the correctness path.
- Checkpoint upload/download implementation and checkpoint lease/failover behavior.
- Late joiner bootstrap from checkpoint + replay. Current join imports remote workspace and replays events; checkpoint acceleration is pending.
- Conflict detection/resolution primitives beyond schema/event type support.
- Dashboard UI for sync health, presence, checkpoints, conflicts, and richer remote-session state.

## Read This First

This plan started as the Phase 2 backend blueprint. The migration has now been applied and the relay MVP has been verified live against Supabase. Keep using this document for the remaining Phase 2 work, especially realtime websocket subscriptions, checkpoints, late-join bootstrap, and conflicts.

Current Phase 1 command surface is:

```bash
teambridge start <session_name> [base_ref]
teambridge join <session_name> --as <display_name>
teambridge enter <session_name>
teambridge publish <target_file> <text>
teambridge vault read|search|context
```

Do not bring back `teambridge track start` / `teambridge track join` as user-facing commands. Internally the dashboard and database may still use the word "track", but CLI users should think in sessions.

For auth: Phase 2 needs minimal Supabase Auth so RLS can protect relay data. It does **not** need polished auth UX yet. Defer invites, orgs, GitHub OAuth polish, dashboard login UI, keychain storage, and role management until after cross-device sync works.

Phase 1 is local-only:

```text
local daemon -> local SQLite + events.jsonl -> local vault
```

Phase 2 adds cross-device sync:

```text
local daemon
  -> local SQLite pending queue
  -> Supabase Auth + Postgres + Realtime + Storage
  -> other local daemons
  -> each machine materializes its own local vault
```

Supabase is not the agent's reasoning memory. The materialized local vault is still what agents read. Supabase is the authenticated relay, ordering source, presence source, and late-join bootstrap source.

## Nihal's Responsibility

Nihal owns the backend relay layer:

- Supabase schema, indexes, RLS, storage bucket, and Realtime publication.
- Auth/session validation for daemon relay calls.
- Canonical remote event insert with per-workspace monotonic `seq`.
- Realtime subscriptions that pull remote events into the local daemon.
- Local offline queue + retry.
- Event dedupe using `dedupeKey`.
- Checkpoint upload/download and checkpoint lease/failover.
- Late joiner bootstrap from latest checkpoint + event replay.
- Conflict detection primitives and conflict resolution event plumbing.

Kushagra and Ronish should not need to guess the database shape. CLI/dashboard/MCP should use daemon APIs; daemon is the integration boundary.

## Product Model

The important rule:

```text
events are the source of truth
vault files are a projection
checkpoints are a bootstrap optimization
```

For Phase 2:

- Local daemons may create pending events while offline.
- Supabase assigns the canonical `seq` when the event reaches the relay.
- Every device replays events by canonical `seq`, not by timestamp.
- A late joiner downloads the latest checkpoint, then replays events after that checkpoint `seq`.

## Auth Model

Use Supabase Auth for real users, but keep it minimal in Phase 2.

Recommended Phase 2 dev flow:

```bash
teambridge login --email <email> --password <password>
teambridge init
teambridge start billing-refactor main
teambridge sessions
teambridge join billing-refactor
teambridge sync
```

Daemon auth rules:

- The CLI obtains a Supabase session and gives the daemon the access token.
- The daemon validates the token with Supabase before relay operations.
- The daemon registers/updates one `devices` row for the current machine.
- Do not authorize using `user_metadata`; it is user-editable.
- Use `auth.uid()` and database membership rows for RLS.
- Store authorization data in tables, not in editable JWT metadata.
- The browser dashboard should still talk to the local daemon, not directly to Supabase for write operations in Phase 2.
- Do not put the service role key in dashboard/browser env. It is local daemon / server-only.

Local `.env` variable names:

```bash
SUPABASE_URL=
SUPABASE_REST_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
```

For the final app, prefer publishable/anon key for user auth and keep `SUPABASE_SERVICE_ROLE_KEY` restricted to trusted local daemon or server-side relay operations only.

## Schemas

Use `public` for exposed tables and enable RLS on every table. Put helper functions that need elevated privileges in a private schema.

All Teambridge-owned Supabase tables use the `tc_` prefix. This is the SQL-safe version of the "TC_" naming convention: Postgres folds unquoted identifiers to lowercase, so writing literal uppercase `"TC_"` would force every query to quote table names forever.

```sql
create schema if not exists teambridge_private;

create extension if not exists pgcrypto;
```

### Profiles

One row per Supabase auth user.

```sql
create table public.tc_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Devices

One row per daemon installation/session device.

```sql
create table public.tc_devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null,
  daemon_version text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index tc_devices_user_id_idx on public.tc_devices(user_id);
```

### Projects

Projects group tracks/workspaces. This mirrors the Phase 1 dashboard model.

```sql
create table public.tc_projects (
  id text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index tc_projects_created_by_idx on public.tc_projects(created_by);
```

### Project Members

Project membership controls project-level visibility.

```sql
create table public.tc_project_members (
  project_id text not null references public.tc_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'idle', 'offline')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index tc_project_members_user_id_idx on public.tc_project_members(user_id);
```

### Workspaces / Tracks

The database name stays `workspaces` because the core contract is still `Workspace`. The UI can call these tracks.

```sql
create table public.tc_workspaces (
  id text primary key,
  project_id text references public.tc_projects(id) on delete set null,
  session_name text not null,
  repo_remote text,
  repo_root_hash text,
  base_ref text not null,
  base_commit text not null,
  scope_json jsonb not null default '[]'::jsonb,
  created_by_participant_id text,
  created_by_user_id uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active', 'archived')),
  relay_mode text not null default 'supabase' check (relay_mode in ('supabase')),
  created_at timestamptz not null default now(),
  unique (project_id, session_name)
);

create index tc_workspaces_project_id_idx on public.tc_workspaces(project_id);
create index tc_workspaces_created_by_user_id_idx on public.tc_workspaces(created_by_user_id);
```

### Participants

Participants represent a user inside a workspace/track. A user may have multiple devices, but should normally have one participant row per workspace.

```sql
create table public.tc_participants (
  id text primary key,
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  branch text not null,
  agent text check (agent in ('claude-code', 'cursor', 'codex', 'ghost', 'unknown') or agent is null),
  status text not null default 'active' check (status in ('active', 'idle', 'offline')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (workspace_id, branch)
);

alter table public.tc_workspaces
  add constraint tc_workspaces_created_by_participant_fk
  foreign key (created_by_participant_id)
  references public.tc_participants(id)
  deferrable initially deferred;

create index tc_participants_workspace_id_idx on public.tc_participants(workspace_id);
create index tc_participants_user_id_idx on public.tc_participants(user_id);
```

### Workspace Events

This is the most important table. `seq` is canonical and assigned only by the relay.

```sql
create table public.tc_workspace_events (
  id text primary key,
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  seq bigint not null,
  type text not null check (
    type in (
      'publish',
      'team_ask',
      'team_reply',
      'vault_patch',
      'conflict_detected',
      'conflict_resolved',
      'checkpoint_created'
    )
  ),
  actor_id text not null references public.tc_participants(id),
  device_id text not null references public.tc_devices(id),
  target_file text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (workspace_id, seq),
  unique (workspace_id, dedupe_key)
);

create index tc_workspace_events_workspace_seq_idx
  on public.tc_workspace_events(workspace_id, seq);

create index tc_workspace_events_workspace_created_at_idx
  on public.tc_workspace_events(workspace_id, created_at desc);

create index tc_workspace_events_actor_id_idx
  on public.tc_workspace_events(actor_id);
```

Important:

- The daemon should never use `created_at` for replay order.
- For `publish`, `target_file` is required at the API/daemon layer.
- `dedupe_key` should be deterministic for retries, for example:

```text
<workspaceId>:<deviceId>:<localEventId>
```

### Vault Checkpoints

Checkpoints let late joiners avoid replaying every event from zero.

```sql
create table public.tc_workspace_vault_checkpoints (
  id text primary key,
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  seq bigint not null,
  storage_path text not null,
  hash text not null,
  byte_size integer not null,
  created_by_device_id text not null references public.tc_devices(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, seq)
);

create index tc_workspace_vault_checkpoints_latest_idx
  on public.tc_workspace_vault_checkpoints(workspace_id, seq desc);
```

Storage bucket:

```text
teambridge-checkpoints
```

Object path:

```text
<workspace_id>/<seq>/<hash>.json.gz
```

Checkpoint payload:

```json
{
  "schemaVersion": 1,
  "workspaceId": "ws_...",
  "seq": 42,
  "files": [
    { "path": "decisions.md", "content": "# Decisions\n..." }
  ]
}
```

### Checkpoint Leases

Only one daemon should build/upload a checkpoint at a time.

```sql
create table public.tc_checkpoint_leases (
  workspace_id text primary key references public.tc_workspaces(id) on delete cascade,
  leader_device_id text not null references public.tc_devices(id),
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index tc_checkpoint_leases_expires_idx
  on public.tc_checkpoint_leases(lease_expires_at);
```

### Inbox Messages

Used later by `teambridge ask`, `teambridge inbox`, `teambridge reply`, and MCP tools.

```sql
create table public.tc_inbox_messages (
  id text primary key,
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  from_participant_id text not null references public.tc_participants(id),
  to_participant_id text not null references public.tc_participants(id),
  status text not null default 'pending' check (status in ('pending', 'answered', 'expired', 'cancelled')),
  body text not null,
  reply_to text references public.tc_inbox_messages(id),
  event_id text references public.tc_workspace_events(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index tc_inbox_messages_to_status_idx
  on public.tc_inbox_messages(to_participant_id, status, created_at desc);

create index tc_inbox_messages_workspace_idx
  on public.tc_inbox_messages(workspace_id, created_at desc);
```

### Presence

Presence is intentionally soft state. If a daemon stops heartbeating, the user is treated as offline.

```sql
create table public.tc_presence (
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  participant_id text not null references public.tc_participants(id) on delete cascade,
  device_id text not null references public.tc_devices(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'idle', 'offline')),
  current_branch text,
  current_worktree_path_hash text,
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, participant_id, device_id)
);

create index tc_presence_workspace_seen_idx
  on public.tc_presence(workspace_id, last_seen_at desc);
```

### Conflicts

This is a primitive table. The exact conflict detector can evolve.

```sql
create table public.tc_conflicts (
  id text primary key,
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  kind text not null check (kind in ('content', 'vault', 'branch', 'unknown')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  summary text not null,
  event_ids text[] not null default '{}',
  affected_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_event_id text references public.tc_workspace_events(id)
);

create index tc_conflicts_workspace_status_idx
  on public.tc_conflicts(workspace_id, status, created_at desc);
```

## RLS Helpers

Use indexed membership checks. Wrap `auth.uid()` in `select` inside policies.

```sql
create or replace function teambridge_private.is_project_member(target_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tc_project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = (select auth.uid())
  );
$$;

create or replace function teambridge_private.is_workspace_member(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tc_participants p
    where p.workspace_id = target_workspace_id
      and p.user_id = (select auth.uid())
  );
$$;
```

Do not create these helper functions in an exposed schema. Keep them in `teambridge_private`.

## RLS Policy Intent

Enable RLS on every exposed table:

```sql
alter table public.tc_profiles enable row level security;
alter table public.tc_devices enable row level security;
alter table public.tc_projects enable row level security;
alter table public.tc_project_members enable row level security;
alter table public.tc_workspaces enable row level security;
alter table public.tc_participants enable row level security;
alter table public.tc_workspace_events enable row level security;
alter table public.tc_workspace_vault_checkpoints enable row level security;
alter table public.tc_checkpoint_leases enable row level security;
alter table public.tc_inbox_messages enable row level security;
alter table public.tc_presence enable row level security;
alter table public.tc_conflicts enable row level security;
```

Policies:

```sql
create policy "profiles_select_self"
on public.tc_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_self"
on public.tc_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles_update_self"
on public.tc_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "devices_self"
on public.tc_devices for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "projects_select_member"
on public.tc_projects for select
to authenticated
using (teambridge_private.is_project_member(id) or created_by = (select auth.uid()));

create policy "projects_insert_creator"
on public.tc_projects for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "project_members_select_member"
on public.tc_project_members for select
to authenticated
using (teambridge_private.is_project_member(project_id));

create policy "project_members_insert_self_or_owner"
on public.tc_project_members for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.tc_project_members pm
    where pm.project_id = project_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'owner'
  )
);

create policy "workspaces_select_member"
on public.tc_workspaces for select
to authenticated
using (teambridge_private.is_workspace_member(id));

create policy "workspaces_insert_creator"
on public.tc_workspaces for insert
to authenticated
with check (created_by_user_id = (select auth.uid()));

create policy "participants_select_workspace_member"
on public.tc_participants for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

create policy "participants_insert_self"
on public.tc_participants for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "workspace_events_select_member"
on public.tc_workspace_events for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

-- Event inserts should go through the relay append operation below.
-- Do not create a broad direct insert policy unless the append operation cannot be used.

create policy "checkpoints_select_member"
on public.tc_workspace_vault_checkpoints for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

create policy "leases_select_member"
on public.tc_checkpoint_leases for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

create policy "inbox_select_workspace_member"
on public.tc_inbox_messages for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

create policy "presence_select_workspace_member"
on public.tc_presence for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

create policy "presence_upsert_self"
on public.tc_presence for all
to authenticated
using (
  exists (
    select 1 from public.tc_participants p
    where p.id = participant_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.tc_participants p
    where p.id = participant_id
      and p.user_id = (select auth.uid())
  )
);

create policy "conflicts_select_member"
on public.tc_conflicts for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));
```

The policies above are intentionally conservative. For writes that need canonical ordering, leases, or conflict resolution, prefer a relay operation rather than broad client-side inserts.

## Canonical Event Append

Problem:

```text
multiple devices can publish at the same time
created_at timestamps can drift
local seq numbers collide
```

Solution:

```text
Supabase assigns tc_workspace_events.seq inside one atomic relay operation
```

Recommended implementation: a Supabase Edge Function named `append-event`.

Why Edge Function instead of direct table insert:

- It can validate the Supabase JWT.
- It can check workspace membership.
- It can run a transaction with row locking.
- It can assign canonical `seq`.
- It can return the already-inserted event when `dedupe_key` was retried.
- It avoids exposing broad event insert permissions to clients.

Pseudo transaction:

```sql
begin;

-- Lock the workspace row so only one event append computes next seq at a time.
select id
from public.tc_workspaces
where id = $workspace_id
for update;

-- If dedupe key already exists, return that event.
select *
from public.tc_workspace_events
where workspace_id = $workspace_id
  and dedupe_key = $dedupe_key;

-- Otherwise assign next seq.
select coalesce(max(seq), 0) + 1
from public.tc_workspace_events
where workspace_id = $workspace_id;

insert into public.tc_workspace_events (
  id,
  workspace_id,
  seq,
  type,
  actor_id,
  device_id,
  target_file,
  payload,
  dedupe_key
) values (...);

commit;
```

For high volume later, replace `max(seq)` with a `workspace_event_counters` table. For Phase 2, row-locking the workspace is simple and correct.

Response shape:

```json
{
  "event": {
    "id": "evt_...",
    "workspaceId": "ws_...",
    "seq": 12,
    "type": "publish",
    "actorId": "user_...",
    "deviceId": "dev_...",
    "targetFile": "decisions.md",
    "payload": { "text": "Use backend as source of truth." },
    "dedupeKey": "ws_...:dev_...:local_...",
    "createdAt": "2026-07-02T00:00:00.000Z"
  },
  "deduped": false
}
```

## Realtime

Enable Postgres Changes for relay tables that clients should observe:

```sql
alter publication supabase_realtime add table public.tc_workspace_events;
alter publication supabase_realtime add table public.tc_workspace_vault_checkpoints;
alter publication supabase_realtime add table public.tc_inbox_messages;
alter publication supabase_realtime add table public.tc_presence;
alter publication supabase_realtime add table public.tc_conflicts;
```

Daemon subscription per active workspace:

```text
subscribe tc_workspace_events where workspace_id = current workspace
on insert:
  if event.seq > local lastRemoteSeq:
    append canonical event locally
    materialize event into local vault
    update lastRemoteSeq
```

The daemon should still poll on reconnect:

```text
GET events after lastRemoteSeq
```

Realtime is a notification path, not the only correctness path.

## Local Daemon State Additions

Phase 1 has local SQLite. Phase 2 should add these local tables.

```sql
create table pending_remote_events (
  local_id text primary key,
  workspace_id text not null,
  actor_id text not null,
  device_id text not null,
  type text not null,
  target_file text,
  payload_json text not null,
  dedupe_key text not null unique,
  local_order integer not null,
  retry_count integer not null default 0,
  next_retry_at text,
  created_at text not null,
  last_error text
);

create table remote_sync_state (
  workspace_id text primary key,
  last_remote_seq integer not null default 0,
  last_synced_at text,
  relay_status text not null default 'offline'
);

create table remote_identity (
  relay_url text primary key,
  user_id text not null,
  access_token text not null,
  refresh_token text,
  expires_at text
);
```

For production, move tokens to OS keychain later. For Phase 2 dev, local file/SQLite is acceptable if documented clearly.

## Publish Flow

Online happy path:

```text
teambridge publish decisions.md "..."
  -> CLI calls local daemon
  -> daemon validates targetFile/payload
  -> daemon creates dedupeKey
  -> daemon calls Supabase append-event
  -> Supabase returns canonical event with seq
  -> daemon appends canonical event to events.jsonl
  -> daemon materializes local vault
  -> Realtime notifies other devices
```

Offline path:

```text
teambridge publish blockers.md "..."
  -> daemon cannot reach relay
  -> daemon writes pending_remote_events row
  -> daemon may optimistically materialize pending publish locally
  -> status shows pending event count
  -> retry loop uploads later with same dedupeKey
  -> relay assigns canonical seq
  -> daemon replaces pending state with canonical event
  -> daemon rebuilds vault by canonical seq + remaining pending events
```

Important: canonical `seq` belongs to Supabase. Local pending order is only local UI state.

## Retry and Dedupe

Retry loop:

```text
every few seconds:
  find pending events where next_retry_at <= now
  call append-event with same dedupeKey
  if success:
    remove pending row
    append/materialize canonical event
  if network/server error:
    retry_count += 1
    next_retry_at = now + backoff(retry_count)
```

Backoff:

```text
1s, 2s, 5s, 10s, 30s, 60s max
```

Dedupe behavior:

- If the daemon times out after Supabase inserted the event, retrying with the same `dedupeKey` returns the existing event.
- If two devices accidentally send the same logical event with the same `dedupeKey`, only one canonical event exists.

## Checkpoint Flow

When to checkpoint:

- every 50 events, or
- vault content changed by more than a configured byte threshold, or
- before allowing a late joiner to bootstrap if the latest checkpoint is old.

Lease flow:

```text
daemon wants to build checkpoint
  -> tries to acquire tc_checkpoint_leases row
  -> succeeds if no lease or lease_expires_at < now()
  -> builds checkpoint from local canonical vault at seq N
  -> uploads checkpoint JSON gzip to Storage
  -> inserts tc_workspace_vault_checkpoints row
  -> appends checkpoint_created event
  -> renews/releases lease
```

Failover:

```text
if leader daemon disappears:
  lease expires
  another online daemon can acquire
```

Storage object must be private. Members get signed URLs through daemon/relay, or the daemon downloads with authenticated access after membership checks.

## Late Joiner Bootstrap

When Ronish joins an existing relay workspace:

```text
teambridge join billing-refactor
  -> daemon authenticates user
  -> fetch workspace manifest + participants
  -> create participant row if needed
  -> fetch latest checkpoint
  -> download checkpoint snapshot
  -> materialize checkpoint into local vault
  -> fetch tc_workspace_events where seq > checkpoint.seq order by seq asc
  -> apply events locally
  -> create local worktree from workspace.base_commit
  -> subscribe to realtime
```

If no checkpoint exists:

```text
replay all events from seq 1
```

Pass condition:

```text
late joiner can read decisions.md/observations.md exactly like existing members
```

## Conflict Primitives

Phase 2 should keep conflict detection simple.

Create conflict rows when:

- two pending/offline publishes touch the same `targetFile` and both claim incompatible metadata,
- a branch/worktree cannot be created because the branch already exists with different base commit,
- checkpoint hash does not match downloaded content,
- event replay fails validation.

Conflict event flow:

```text
detect conflict
  -> insert tc_conflicts row
  -> append conflict_detected event
  -> materialize summary into conflicts.md
```

Resolution flow:

```text
resolve conflict
  -> append conflict_resolved event
  -> update tc_conflicts.status = resolved
  -> materialize resolution into conflicts.md
```

Conflict UI/CLI can come later. Nihal only needs stable primitives and daemon endpoints.

## Daemon API Additions

Local daemon endpoints for Phase 2:

```text
POST /auth/login
POST /auth/logout
GET  /auth/status

POST /relay/connect
GET  /relay/status?repoRoot=...
POST /relay/sync

POST /workspaces/start          # accepts relayMode=supabase later
POST /workspaces/join           # can bootstrap from relay
GET  /workspaces/:id/events     # includes remote/canonical events

POST /workspaces/:id/checkpoints
POST /workspaces/:id/checkpoints/acquire-lease
GET  /workspaces/:id/checkpoints/latest

GET  /workspaces/:id/conflicts
POST /workspaces/:id/conflicts/:conflictId/resolve
```

CLI should still call daemon only. Dashboard should still call daemon only.

## Implementation Order

### Nihal Step 1: Supabase Setup

1. Create Supabase project.
2. Add tables/indexes from this plan.
3. Enable RLS on all tables.
4. Add RLS helper functions and policies.
5. Add private Storage bucket `teambridge-checkpoints`.
6. Enable Realtime publication on relay tables.
7. Run Supabase advisors and fix warnings.

### Nihal Step 2: Auth and Relay Client

1. Add daemon relay config fields.
2. Add login/session storage.
3. Validate sessions before relay calls.
4. Add device registration.
5. Add profile upsert.

### Nihal Step 3: Canonical Event Insert

1. Implement `append-event` relay operation.
2. Ensure atomic `seq` assignment.
3. Ensure dedupe works.
4. Add tests for concurrent inserts and retry dedupe.

### Nihal Step 4: Sync Loop

1. Add local `pending_remote_events`.
2. Add upload retry loop.
3. Add pull-after-last-seq.
4. Add Realtime subscription.
5. Rebuild local vault from canonical events when needed.

### Nihal Step 5: Checkpoints

1. Add checkpoint lease acquisition.
2. Add checkpoint serialization and hash.
3. Upload checkpoint to Storage.
4. Insert checkpoint row.
5. Implement download + replay bootstrap.

### Nihal Step 6: Conflicts

1. Add conflict table access through daemon.
2. Add basic detector hooks around replay/materialization/worktree creation.
3. Append `conflict_detected` and `conflict_resolved` events.
4. Materialize conflict summaries into `conflicts.md`.

## Test Plan

Unit/backend tests:

- RLS: non-member cannot select workspace/events.
- RLS: member can select workspace/events.
- Event append: concurrent appends produce `seq = 1, 2, 3...`.
- Event append: duplicate `dedupeKey` returns existing event.
- Checkpoint lease: only one leader succeeds before expiry.
- Bootstrap: checkpoint + events after checkpoint recreate same vault.

Integration tests:

```text
Device A starts workspace and publishes event.
Device B joins and sees event.
Device A goes offline and publishes pending event.
Device A reconnects and pending event syncs once.
Device C joins late and bootstraps from checkpoint + replay.
```

Pass when:

- All devices converge to the same canonical event list.
- All vaults materialize the same content.
- No duplicate events appear after retry.
- Late joiner works without access to another user's local machine.

## Open Decisions Before Implementation

1. Whether Phase 2 dev stores Supabase tokens in local SQLite or OS keychain. SQLite is faster for MVP; keychain is safer.
2. Whether canonical append is implemented as a Supabase Edge Function or a Postgres RPC. Edge Function is recommended because it can safely run privileged transaction logic without broad client insert policies.
3. Whether projects require explicit invitations in Phase 2, or whether any authenticated user with a workspace invite/session name can join. For MVP, explicit project/workspace membership is safer.
4. How much pending offline content should be shown in the vault before it receives canonical `seq`. Recommended: show it locally with pending status, then rebuild after sync.

