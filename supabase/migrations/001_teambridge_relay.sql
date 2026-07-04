-- Teambridge Phase 2 Supabase relay schema.
--
-- All Teambridge-owned tables use the tc_ prefix. Keep identifiers lowercase:
-- Postgres folds unquoted names to lowercase, while quoted "TC_*" names would
-- require quoting every query forever.

create schema if not exists teambridge_private;
create extension if not exists pgcrypto;

-- Profiles
create table if not exists public.tc_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Devices
create table if not exists public.tc_devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  hostname text not null,
  daemon_version text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists tc_devices_user_id_idx on public.tc_devices(user_id);

-- Projects
create table if not exists public.tc_projects (
  id text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists tc_projects_created_by_idx on public.tc_projects(created_by);

-- Project roster / access boundary
create table if not exists public.tc_project_members (
  project_id text not null references public.tc_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'idle', 'offline')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists tc_project_members_user_id_idx on public.tc_project_members(user_id);

-- Workspaces / sessions / tracks
create table if not exists public.tc_workspaces (
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

create index if not exists tc_workspaces_project_id_idx on public.tc_workspaces(project_id);
create index if not exists tc_workspaces_repo_remote_idx on public.tc_workspaces(repo_remote);
create index if not exists tc_workspaces_created_by_user_id_idx on public.tc_workspaces(created_by_user_id);

-- Participants in one workspace/session
create table if not exists public.tc_participants (
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
  drop constraint if exists tc_workspaces_created_by_participant_fk;

alter table public.tc_workspaces
  add constraint tc_workspaces_created_by_participant_fk
  foreign key (created_by_participant_id)
  references public.tc_participants(id)
  deferrable initially deferred;

create index if not exists tc_participants_workspace_id_idx on public.tc_participants(workspace_id);
create index if not exists tc_participants_user_id_idx on public.tc_participants(user_id);

-- Canonical event log. seq is assigned by trusted relay/daemon code.
create table if not exists public.tc_workspace_events (
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

create index if not exists tc_workspace_events_workspace_seq_idx
  on public.tc_workspace_events(workspace_id, seq);

create index if not exists tc_workspace_events_workspace_created_at_idx
  on public.tc_workspace_events(workspace_id, created_at desc);

create index if not exists tc_workspace_events_actor_id_idx
  on public.tc_workspace_events(actor_id);

-- Checkpoints for late join bootstrap
create table if not exists public.tc_workspace_vault_checkpoints (
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

create index if not exists tc_workspace_vault_checkpoints_latest_idx
  on public.tc_workspace_vault_checkpoints(workspace_id, seq desc);

-- Checkpoint leadership / failover
create table if not exists public.tc_checkpoint_leases (
  workspace_id text primary key references public.tc_workspaces(id) on delete cascade,
  leader_device_id text not null references public.tc_devices(id),
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists tc_checkpoint_leases_expires_idx
  on public.tc_checkpoint_leases(lease_expires_at);

-- Inbox / ask / reply
create table if not exists public.tc_inbox_messages (
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

create index if not exists tc_inbox_messages_to_status_idx
  on public.tc_inbox_messages(to_participant_id, status, created_at desc);

create index if not exists tc_inbox_messages_workspace_idx
  on public.tc_inbox_messages(workspace_id, created_at desc);

-- Presence is soft state.
create table if not exists public.tc_presence (
  workspace_id text not null references public.tc_workspaces(id) on delete cascade,
  participant_id text not null references public.tc_participants(id) on delete cascade,
  device_id text not null references public.tc_devices(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'idle', 'offline')),
  current_branch text,
  current_worktree_path_hash text,
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, participant_id, device_id)
);

create index if not exists tc_presence_workspace_seen_idx
  on public.tc_presence(workspace_id, last_seen_at desc);

-- Conflict primitives
create table if not exists public.tc_conflicts (
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

create index if not exists tc_conflicts_workspace_status_idx
  on public.tc_conflicts(workspace_id, status, created_at desc);

-- RLS helper functions. Security definer functions live in a private schema.
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

create or replace function teambridge_private.is_project_owner(target_project_id text)
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
      and pm.role = 'owner'
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

grant usage on schema teambridge_private to authenticated;
grant execute on function teambridge_private.is_project_member(text) to authenticated;
grant execute on function teambridge_private.is_project_owner(text) to authenticated;
grant execute on function teambridge_private.is_workspace_member(text) to authenticated;

-- RLS
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

-- Policies: drop/recreate to make the migration repeatable in dev.
drop policy if exists tc_profiles_select_self on public.tc_profiles;
create policy tc_profiles_select_self
on public.tc_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists tc_profiles_insert_self on public.tc_profiles;
create policy tc_profiles_insert_self
on public.tc_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists tc_profiles_update_self on public.tc_profiles;
create policy tc_profiles_update_self
on public.tc_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists tc_devices_self on public.tc_devices;
create policy tc_devices_self
on public.tc_devices for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists tc_projects_select_member on public.tc_projects;
create policy tc_projects_select_member
on public.tc_projects for select
to authenticated
using (teambridge_private.is_project_member(id) or created_by = (select auth.uid()));

drop policy if exists tc_projects_insert_creator on public.tc_projects;
create policy tc_projects_insert_creator
on public.tc_projects for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists tc_project_members_select_member on public.tc_project_members;
create policy tc_project_members_select_member
on public.tc_project_members for select
to authenticated
using (teambridge_private.is_project_member(project_id));

drop policy if exists tc_project_members_insert_self_or_owner on public.tc_project_members;
create policy tc_project_members_insert_self_or_owner
on public.tc_project_members for insert
to authenticated
with check (
  user_id = (select auth.uid())
  or teambridge_private.is_project_owner(project_id)
);

drop policy if exists tc_project_members_update_owner on public.tc_project_members;
create policy tc_project_members_update_owner
on public.tc_project_members for update
to authenticated
using (teambridge_private.is_project_owner(project_id))
with check (teambridge_private.is_project_owner(project_id));

drop policy if exists tc_workspaces_select_member on public.tc_workspaces;
create policy tc_workspaces_select_member
on public.tc_workspaces for select
to authenticated
using (
  teambridge_private.is_workspace_member(id)
  or created_by_user_id = (select auth.uid())
  or (project_id is not null and teambridge_private.is_project_member(project_id))
);

drop policy if exists tc_workspaces_insert_creator on public.tc_workspaces;
create policy tc_workspaces_insert_creator
on public.tc_workspaces for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and (
    project_id is null
    or teambridge_private.is_project_member(project_id)
  )
);

drop policy if exists tc_participants_select_workspace_member on public.tc_participants;
create policy tc_participants_select_workspace_member
on public.tc_participants for select
to authenticated
using (
  teambridge_private.is_workspace_member(workspace_id)
  or user_id = (select auth.uid())
);

drop policy if exists tc_participants_insert_self on public.tc_participants;
create policy tc_participants_insert_self
on public.tc_participants for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.tc_workspaces w
    where w.id = workspace_id
      and (
        w.created_by_user_id = (select auth.uid())
        or w.project_id is null
        or teambridge_private.is_project_member(w.project_id)
      )
  )
);

drop policy if exists tc_workspace_events_select_member on public.tc_workspace_events;
create policy tc_workspace_events_select_member
on public.tc_workspace_events for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

drop policy if exists tc_checkpoints_select_member on public.tc_workspace_vault_checkpoints;
create policy tc_checkpoints_select_member
on public.tc_workspace_vault_checkpoints for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

drop policy if exists tc_leases_select_member on public.tc_checkpoint_leases;
create policy tc_leases_select_member
on public.tc_checkpoint_leases for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

drop policy if exists tc_inbox_select_workspace_member on public.tc_inbox_messages;
create policy tc_inbox_select_workspace_member
on public.tc_inbox_messages for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

drop policy if exists tc_presence_select_workspace_member on public.tc_presence;
create policy tc_presence_select_workspace_member
on public.tc_presence for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

drop policy if exists tc_presence_upsert_self on public.tc_presence;
create policy tc_presence_upsert_self
on public.tc_presence for all
to authenticated
using (
  exists (
    select 1
    from public.tc_participants p
    where p.id = participant_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.tc_participants p
    where p.id = participant_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists tc_conflicts_select_member on public.tc_conflicts;
create policy tc_conflicts_select_member
on public.tc_conflicts for select
to authenticated
using (teambridge_private.is_workspace_member(workspace_id));

-- Canonical event append. Trusted daemon/relay code calls this RPC; it locks the
-- workspace row, dedupes by dedupe_key, assigns the next canonical seq, and
-- returns the inserted/existing event row.
create or replace function public.tc_append_event(
  p_event_id text,
  p_workspace_id text,
  p_type text,
  p_actor_id text,
  p_device_id text,
  p_target_file text,
  p_payload jsonb,
  p_dedupe_key text
)
returns public.tc_workspace_events
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.tc_workspace_events;
  next_seq bigint;
  inserted public.tc_workspace_events;
begin
  perform 1
  from public.tc_workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception 'workspace not found: %', p_workspace_id;
  end if;

  if p_dedupe_key is not null then
    select *
    into existing
    from public.tc_workspace_events
    where workspace_id = p_workspace_id
      and dedupe_key = p_dedupe_key
    limit 1;

    if found then
      return existing;
    end if;
  end if;

  select coalesce(max(seq), 0) + 1
  into next_seq
  from public.tc_workspace_events
  where workspace_id = p_workspace_id;

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
  ) values (
    p_event_id,
    p_workspace_id,
    next_seq,
    p_type,
    p_actor_id,
    p_device_id,
    p_target_file,
    coalesce(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  returning * into inserted;

  return inserted;
end;
$$;

grant execute on function public.tc_append_event(text, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.tc_append_event(text, text, text, text, text, text, jsonb, text) to service_role;

-- Private checkpoint storage bucket.
insert into storage.buckets (id, name, public)
values ('teambridge-checkpoints', 'teambridge-checkpoints', false)
on conflict (id) do nothing;

drop policy if exists tc_checkpoint_objects_select_member on storage.objects;
create policy tc_checkpoint_objects_select_member
on storage.objects for select
to authenticated
using (
  bucket_id = 'teambridge-checkpoints'
  and teambridge_private.is_workspace_member((storage.foldername(name))[1])
);

-- Writes to storage and canonical event/checkpoint tables are performed by
-- trusted daemon/relay operations using the server-side service role key.

-- Realtime publication. Ignore duplicate-table errors so this can be rerun in dev.
do $$
begin
  begin
    alter publication supabase_realtime add table public.tc_workspace_events;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tc_workspace_vault_checkpoints;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tc_inbox_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tc_presence;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tc_conflicts;
  exception when duplicate_object then null;
  end;
end $$;
